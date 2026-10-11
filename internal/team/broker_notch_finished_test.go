package team

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/nex-crm/wuphf/internal/agentdetect"
)

func addNotchBot(b *Broker, slug, name string) {
	b.members = append(b.members, officeMember{Slug: slug, Name: name})
	b.memberIndex[slug] = len(b.members) - 1
}

func TestNotchListsAFinishedTurnAsNeedingTheHuman(t *testing.T) {
	b := newTestBroker(t)
	now := time.Now().UTC()
	b.mu.Lock()
	lead := officeLeadSlugFrom(b.members)
	addNotchBot(b, "eng", "Engineer")
	addNotchBot(b, "ops", "Ops")
	addNotchBot(b, "pm", "PM")
	addNotchBot(b, "old", "Old")
	b.activity["eng"] = botActivitySnapshot{Slug: "eng", Status: "idle", Detail: "reply ready · shipped the fix", LastTime: now.Add(-time.Minute).Format(time.RFC3339)}
	b.activity["ops"] = botActivitySnapshot{Slug: "ops", Status: "active", Detail: "reply ready", LastTime: now.Format(time.RFC3339)}
	b.activity["pm"] = botActivitySnapshot{Slug: "pm", Status: "idle", Detail: "reply ready", LastTime: now.Format(time.RFC3339)}
	b.activity["old"] = botActivitySnapshot{Slug: "old", Status: "idle", Detail: "reply ready", LastTime: now.Add(-9 * time.Hour).Format(time.RFC3339)}
	b.activity[lead] = botActivitySnapshot{Slug: lead, Status: "idle", Detail: "reply ready", LastTime: now.Format(time.RFC3339)}
	// pm also asked something: the question is what needs the human.
	b.requests = append(b.requests, humanInterview{ID: "r1", From: "pm", Question: "Which plan?", CreatedAt: now.Format(time.RFC3339)})
	b.mu.Unlock()

	s := fetchNotchState(t, b)
	if len(s.Finished) != 1 || s.Finished[0].From != "eng" {
		t.Fatalf("finished = %+v, want eng alone (working, asking, stale and the lead left out)", s.Finished)
	}
	if got := s.Finished[0]; got.Kind != "finished" || got.Question != "shipped the fix" {
		t.Fatalf("finished item = %+v", got)
	}
	if a := notchAgentBySlug(t, s, "eng"); a.State != agentdetect.SessionYourTurn || a.LastSaid != "shipped the fix" {
		t.Fatalf("eng row = %+v, want state your_turn like a session", a)
	}
	if len(s.Attention) != 1 || s.Headline != "2 things need you" {
		t.Fatalf("attention=%d headline=%q", len(s.Attention), s.Headline)
	}
}

func TestNotchFinishedTurnHeadlineAndMarkedDone(t *testing.T) {
	b := newTestBroker(t)
	at := time.Now().UTC().Format(time.RFC3339)
	b.mu.Lock()
	addNotchBot(b, "eng", "Engineer")
	b.activity["eng"] = botActivitySnapshot{Slug: "eng", Status: "idle", Detail: "reply ready", LastTime: at}
	b.mu.Unlock()

	s := fetchNotchState(t, b)
	if len(s.Finished) != 1 || s.Mood != MoodNeedsYou || s.Headline != "Engineer finished. Your turn." {
		t.Fatalf("finished=%+v mood=%q headline=%q", s.Finished, s.Mood, s.Headline)
	}

	for _, bad := range []string{`{"id":"r1"}`, `nope`} {
		rec := httptest.NewRecorder()
		b.handleNotchFinishedSeen(rec, httptest.NewRequest(http.MethodPost, "/notch/finished/seen", strings.NewReader(bad)))
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("%s: status %d, want 400", bad, rec.Code)
		}
	}
	rec := httptest.NewRecorder()
	b.handleNotchFinishedSeen(rec, httptest.NewRequest(http.MethodPost, "/notch/finished/seen", strings.NewReader(`{"id":"`+s.Finished[0].ID+`"}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("seen status %d", rec.Code)
	}
	if s = fetchNotchState(t, b); len(s.Finished) != 0 || !strings.Contains(s.Headline, "Nothing needs you") {
		t.Fatalf("after done: finished=%+v headline=%q", s.Finished, s.Headline)
	}

	// The next turn is a new one and shows again.
	b.mu.Lock()
	b.activity["eng"] = botActivitySnapshot{Slug: "eng", Status: "idle", Detail: "reply ready", LastTime: time.Now().UTC().Add(time.Second).Format(time.RFC3339)}
	b.mu.Unlock()
	if s = fetchNotchState(t, b); len(s.Finished) != 1 {
		t.Fatalf("next turn hidden: %+v", s.Finished)
	}
}

func TestNotchFinishedSkipsAClosedSession(t *testing.T) {
	closed, open := false, true
	b := newTestBroker(t)
	state := notchState{Agents: []notchAgent{
		{Slug: "session.a", Name: "A", Kind: notchAgentSession, State: agentdetect.SessionYourTurn, UpdatedAt: "2026-10-11T10:00:00Z", Open: &closed},
		{Slug: "session.b", Name: "B", Kind: notchAgentSession, State: agentdetect.SessionYourTurn, UpdatedAt: "2026-10-11T11:00:00Z", Open: &open, LastSaid: "done here"},
		{Slug: "session.c", Name: "C", Kind: notchAgentSession, State: agentdetect.SessionYourTurn, UpdatedAt: "2026-10-11T12:00:00Z"},
		{Slug: "session.d", Name: "D", Kind: notchAgentSession, State: agentdetect.SessionWorking, UpdatedAt: "2026-10-11T12:00:00Z"},
	}}
	got := b.withNotchFinished(state).Finished
	if len(got) != 2 || got[0].From != "session.c" || got[1].From != "session.b" || got[1].Question != "done here" {
		t.Fatalf("finished = %+v, want c then b, newest first, closed a and working d left out", got)
	}
}
