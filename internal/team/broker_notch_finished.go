package team

import (
	"encoding/json"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/nex-crm/wuphf/internal/agentdetect"
)

// A finished turn needs the human as much as a question does: the bot or
// session has stopped and is waiting for them. The notch lists each one in
// Needs you, after the questions, until the human answers it (which starts
// a new turn) or marks it done.
//
// They travel in their own field, not in Attention: Attention items are
// open requests that /requests/answer can answer, and every client that
// reads Attention (the phone too) relies on that.

// notchFinishedWindow is how long a finished turn stays in Needs you if
// nobody looks at it: the same span a session stays on the list at all.
const notchFinishedWindow = 8 * time.Hour

// notchSeenMax bounds the in-memory set of turns marked done.
const notchSeenMax = 512

// notchFinishedSummary is what a bot's finished turn said, from the
// "reply ready · <summary>" its runner leaves in the activity snapshot.
func notchFinishedSummary(detail string) string {
	rest := strings.TrimPrefix(strings.TrimSpace(detail), "reply ready")
	return strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(rest), "·"))
}

// notchBotFinished reports whether a bot's latest turn ended with a reply
// that is still waiting on the human.
func notchBotFinished(snap botActivitySnapshot, hasOpenRequest bool, now time.Time) bool {
	if hasOpenRequest || !strings.HasPrefix(strings.TrimSpace(snap.Detail), "reply ready") {
		return false
	}
	switch strings.ToLower(strings.TrimSpace(snap.Status)) {
	case "active", "error":
		return false
	}
	at, err := time.Parse(time.RFC3339, snap.LastTime)
	return err == nil && now.Sub(at) <= notchFinishedWindow
}

// notchFinishedID names one finished turn. It carries the turn's time, so
// marking it done hides that turn only and the next one shows again.
func notchFinishedID(slug, at string) string {
	return "finished:" + slug + "@" + at
}

// withNotchFinished lists every agent whose turn is over and waiting on the
// human, newest first, leaving out the lead (its own chat box shows its
// reply) and the turns the human marked done. Caller must not hold b.mu.
func (b *Broker) withNotchFinished(state notchState) notchState {
	b.mu.Lock()
	seen := make(map[string]bool, len(b.notchSeen))
	for id := range b.notchSeen {
		seen[id] = true
	}
	b.mu.Unlock()
	state.Finished = []notchAttention{}
	for _, a := range state.Agents {
		if a.IsLead || a.State != agentdetect.SessionYourTurn || a.UpdatedAt == "" {
			continue
		}
		if a.Open != nil && !*a.Open {
			// Its window is gone; there is nobody there to answer.
			continue
		}
		id := notchFinishedID(a.Slug, a.UpdatedAt)
		if seen[id] {
			continue
		}
		state.Finished = append(state.Finished, notchAttention{
			ID:        id,
			Kind:      "finished",
			From:      a.Slug,
			FromName:  a.Name,
			Title:     "Your turn",
			Question:  firstNonEmpty(a.LastSaid, "Finished. Your turn."),
			CreatedAt: a.UpdatedAt,
		})
	}
	sort.SliceStable(state.Finished, func(i, j int) bool {
		return state.Finished[i].CreatedAt > state.Finished[j].CreatedAt
	})
	switch {
	case len(state.Finished) == 0:
	case len(state.Attention) == 0:
		state.Mood, state.Headline = notchFinishedHeadline(state.Finished)
	default:
		state.Headline = notchCount(len(state.Attention)+len(state.Finished), "thing needs you", "things need you")
	}
	return state
}

func notchFinishedHeadline(items []notchAttention) (string, string) {
	if len(items) == 1 {
		who := firstNonEmpty(items[0].FromName, items[0].From, "A bot")
		return MoodNeedsYou, who + " finished. Your turn."
	}
	return MoodNeedsYou, notchCount(len(items), "bot finished. Your turn.", "bots finished. Your turn.")
}

// POST /notch/finished/seen {"id": "..."} — the human marked a finished
// turn done without answering it. Owner-only, like /notch/state.
func (b *Broker) handleNotchFinishedSeen(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	id := strings.TrimSpace(req.ID)
	if !strings.HasPrefix(id, "finished:") || len(id) > 512 {
		http.Error(w, "unknown finished turn", http.StatusBadRequest)
		return
	}
	b.mu.Lock()
	if b.notchSeen == nil || len(b.notchSeen) >= notchSeenMax {
		// Old marks name turns long since replaced by newer ones.
		b.notchSeen = make(map[string]struct{})
	}
	b.notchSeen[id] = struct{}{}
	b.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
