package team

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

// stubNotchSuggest runs the suggestion worker inline with fn as the model.
func stubNotchSuggest(t *testing.T, fn func(ctx context.Context, system, user string) (string, error)) {
	t.Helper()
	prevFn, prevGo := notchSuggestFn, notchSuggestGo
	notchSuggestFn, notchSuggestGo = fn, func(run func()) { run() }
	t.Cleanup(func() { notchSuggestFn, notchSuggestGo = prevFn, prevGo })
}

const twoSuggestions = `Sure: {"suggestions":[
  {"label":"Ship it","reply":"Looks good, merge it and watch CI."},
  {"label":"Add a test first","reply":"Add a regression test for the login bug, then merge."}
]}`

func TestNotchSuggestionsAreWrittenOnceAndRecommendedFirst(t *testing.T) {
	calls := 0
	var shown string
	stubNotchSuggest(t, func(_ context.Context, _ string, user string) (string, error) {
		calls++
		shown = user
		return twoSuggestions, nil
	})
	b := newTestBroker(t)
	now := time.Now()
	card := notchAttention{
		ID: "finished:eng@1", Kind: "finished", From: "eng", FromName: "Eng",
		Recap: &notchRecap{Asked: "Fix the login bug", Reply: "Fixed it. Want me to merge?"},
	}
	// The first read asks for them (the stub answers inline); the next
	// read is served from memory.
	first := b.withNotchSuggestions(notchState{Finished: []notchAttention{card}}, true, now)
	if first.Finished[0].Suggestions != nil {
		t.Fatalf("the read that asked already had suggestions: %+v", first.Finished[0])
	}
	state := b.withNotchSuggestions(notchState{Finished: []notchAttention{card}}, true, now)
	got := state.Finished[0].Suggestions
	if len(got) != 2 || got[0].Label != "Ship it" || got[1].Reply != "Add a regression test for the login bug, then merge." {
		t.Fatalf("suggestions = %+v", got)
	}
	if calls != 1 {
		t.Fatalf("model called %d times, want once per card", calls)
	}
	if !strings.Contains(shown, "Fix the login bug") || !strings.Contains(shown, "Want me to merge?") {
		t.Fatalf("model was not shown the recap: %q", shown)
	}
}

func TestNotchSuggestionsSkipSecretsOptionsAndOtherViewers(t *testing.T) {
	calls := 0
	stubNotchSuggest(t, func(context.Context, string, string) (string, error) {
		calls++
		return twoSuggestions, nil
	})
	b := newTestBroker(t)
	now := time.Now()
	secret := notchAttention{ID: "r1", Question: "Paste the API key", secret: true}
	options := notchAttention{ID: "r2", Question: "Ship?", Options: []notchOption{{ID: "yes", Label: "Yes"}}}
	words := notchAttention{ID: "r3", Question: "Which customer should I call first?"}

	state := b.withNotchSuggestions(notchState{Attention: []notchAttention{words}}, false, now)
	if calls != 0 || state.Attention[0].Suggestions != nil {
		t.Fatalf("a joined human's notch asked the model (%d calls)", calls)
	}
	state = b.withNotchSuggestions(notchState{Attention: []notchAttention{secret, options, words}}, true, now)
	if calls != 1 {
		t.Fatalf("model called %d times, want only for the question asked in words", calls)
	}
	if state.Attention[0].Suggestions != nil || state.Attention[1].Suggestions != nil {
		t.Fatalf("suggested for a secret or an optioned question: %+v", state.Attention)
	}
}

func TestNotchSuggestionsWaitAfterAFailedCall(t *testing.T) {
	calls := 0
	stubNotchSuggest(t, func(context.Context, string, string) (string, error) {
		calls++
		return "", errors.New("rate limited")
	})
	b := newTestBroker(t)
	card := notchAttention{ID: "finished:eng@1", Recap: &notchRecap{Reply: "Done."}}
	now := time.Now()
	b.withNotchSuggestions(notchState{Finished: []notchAttention{card}}, true, now)
	b.withNotchSuggestions(notchState{Finished: []notchAttention{card}}, true, now.Add(time.Minute))
	if calls != 1 {
		t.Fatalf("retried within the wait: %d calls", calls)
	}
	b.withNotchSuggestions(notchState{Finished: []notchAttention{card}}, true, now.Add(notchSuggestRetry+time.Second))
	if calls != 2 {
		t.Fatalf("never retried after the wait: %d calls", calls)
	}
}

func TestParseNotchSuggestionsKeepsOnlySendableReplies(t *testing.T) {
	long := strings.Repeat("word ", 80)
	out := `{"suggestions":[
	  {"label":"Run it","reply":"/clear"},
	  {"label":"Shell","reply":"!rm -rf ."},
	  {"label":"Too long","reply":"` + long + `"},
	  {"label":"","reply":"No label"},
	  {"label":"Merge","reply":"Merge it.\u0007"},
	  {"label":"Merge again","reply":"merge it."},
	  {"label":"Wait","reply":"Hold off until Monday."}
	]}`
	got, ok := parseNotchSuggestions(out)
	if !ok || len(got) != 2 || got[0].Reply != "Merge it." || got[1].Label != "Wait" {
		t.Fatalf("got %+v ok=%v", got, ok)
	}
	if _, ok := parseNotchSuggestions(`{"suggestions":[{"label":"One","reply":"Only one."}]}`); ok {
		t.Fatal("a single suggestion is not a choice")
	}
	if _, ok := parseNotchSuggestions("I cannot help with that."); ok {
		t.Fatal("prose was taken for suggestions")
	}
}
