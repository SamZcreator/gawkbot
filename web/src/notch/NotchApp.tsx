import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { hush } from "./announce";
import { boredom as boredomOf, gang as gangOf } from "./antics";
import {
  answerRequest,
  answerWithText,
  getNotchState,
  markFinishedSeen,
  NOTCH_QUERY_KEY,
  requestPermission,
  sendMessage,
  showSession,
  stopBot,
} from "./api";
import {
  installNativeReceiver,
  isInMacApp,
  postNative,
  readGeometry,
} from "./bridge";
import {
  staysInNotch,
  useArrival,
  useAttentionSignals,
  useBanter,
  useNotchKeys,
  usePeeks,
  useVoice,
} from "./hooks";
import { nudgeForIdeas } from "./ideasNudge";
import {
  firstLessonStep,
  type LessonStep,
  nextLessonStep,
  saveLessonDone,
} from "./lesson";
import { pollInterval, useNotchLive } from "./live";
import {
  agentChannel,
  type ComposerState,
  type ReplyTarget,
} from "./NotchPanel";
import { stageHeight, stripShapeFor } from "./NotchStrip";
import { NotchView } from "./NotchView";
import { finishedSlugs } from "./order";
import { drawOnScreen, relayOverlay } from "./overlay";
import { useRealtime } from "./realtime/useRealtime";
import {
  HOME,
  isAgentScreen,
  type NotchScreen,
  SETTINGS,
  screenForTarget,
} from "./screens";
import { play, setSoundEnabled, soundEnabled, unlock } from "./sounds";
import type { NotchState } from "./types";
import { useAnnounce } from "./useAnnounce";
import { deliverNativeVoice, voiceAvailable } from "./voice";

export { moodTransitions, newAttentionIds } from "./hooks";

function useGestureUnlock(): void {
  useEffect(() => {
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
}

/** A 1s clock that only ticks while someone is waiting on the human. */
function useWaitClock(waiting: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!waiting) return;
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [waiting]);
  return now;
}

export function NotchApp({
  search = window.location.search,
}: {
  search?: string;
}) {
  const queryClient = useQueryClient();
  const [measured] = useState(() => readGeometry(search));
  // The open panel's size, when the app has one to tell (dragged, remembered).
  const [openSize, setOpenSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  // ?peek=<seconds> makes peeks frequent (demos, screenshots).
  const peekEveryMs = useMemo(
    () =>
      Math.max(0, Number(new URLSearchParams(search).get("peek")) || 0) * 1000,
    [search],
  );
  const inApp = isInMacApp();

  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composer, setComposer] = useState<ComposerState | null>(null);
  // Home, or one bot's thread (screens.ts). Closing the notch comes Home.
  const [screen, setScreen] = useState<NotchScreen>(HOME);
  useEffect(() => {
    if (!expanded) setScreen(HOME);
  }, [expanded]);
  const [answering, setAnswering] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(soundEnabled);
  const [agentsOpen, setAgentsOpen] = useState(false);

  // The poll tells the broker when the panel is open, through a ref so the
  // query key (and its data) stays put across open and close.
  const openRef = useRef(expanded);
  openRef.current = expanded;
  // Changes arrive from the event stream the moment they happen; the poll
  // is the open notch's heartbeat (it lets the office read the screen)
  // and the fallback when the stream is not there (live.ts).
  const live = useNotchLive(queryClient);
  const query = useQuery({
    queryKey: NOTCH_QUERY_KEY,
    queryFn: () => getNotchState(openRef.current),
    refetchInterval: pollInterval(expanded, live),
    refetchIntervalInBackground: true,
  });
  const state = query.data ?? null;
  // Drawings the office left for the screen go to the app once each.
  const drawnSeq = useRef(0);
  useEffect(() => {
    drawnSeq.current = relayOverlay(
      drawnSeq.current,
      state?.overlay,
      drawOnScreen,
    );
  }, [state?.overlay]);
  const attention = useMemo(() => state?.attention ?? [], [state]);
  const agents = useMemo(() => state?.agents ?? [], [state]);
  // Every card the keyboard moves through, in the order the panel shows
  // them: the questions, then the finished turns.
  const cards = useMemo(
    () => [...(state?.attention ?? []), ...(state?.finished ?? [])],
    [state],
  );
  const selected = cards.find((a) => a.id === selectedId) ?? cards[0];

  useEffect(() => {
    const uninstall = installNativeReceiver(setExpanded, {
      setSize: (w, h) => {
        if (w > 0 && h > 0) setOpenSize({ w, h });
      },
      focusKeyboard: () => setExpanded(true),
      voice: deliverNativeVoice,
    });
    postNative({ type: "ready" });
    return uninstall;
  }, []);
  useGestureUnlock();

  // Sounds + the native tap/peek for new things; the boredom clock.
  const firstSeen = useAttentionSignals(state);
  const now = useWaitClock(attention.length > 0);
  const gang = useMemo(() => gangOf(attention, agents), [attention, agents]);
  const bored = boredomOf(attention, now, firstSeen.current);
  // One switch in Settings keeps everybody inside the notch: no chatter and
  // no peeking here, no opening by itself and no fly-in inside the hooks.
  const quiet = staysInNotch(state);
  const line = useBanter(bored >= 2 && !expanded && !quiet, attention, agents);
  const peeker = usePeeks(
    agents,
    attention,
    expanded || line !== null || quiet,
    peekEveryMs,
  );

  const arrival = useArrival(state, expanded);
  // Each answer that lands gets a clap from the lead in the open notch.
  const [cheer, setCheer] = useState(0);

  // On a Mac with a notch the strip is exactly the notch while nothing is
  // going on, and every state is a small coloured dot in a centred row just
  // under it: red for an answer needed, green for a finished turn, orange
  // for work. Everything else is in the panel.
  const finished = useMemo(() => finishedSlugs(state), [state]);
  const shape = stripShapeFor(measured, finished, agents);
  const geometry = useMemo(
    () => ({
      ...measured,
      earWidth: shape.earWidth,
      band: shape.band,
      ...(openSize
        ? { expandedWidth: openSize.w, expandedHeight: openSize.h }
        : {}),
    }),
    [measured, shape.earWidth, shape.band, openSize],
  );
  useEffect(() => {
    postNative({ type: "ears", width: shape.earWidth, band: shape.band });
  }, [shape.earWidth, shape.band]);

  // The first-run tour (lesson.ts): it moves on when the notch opens and
  // closes, and when a practice reply is chosen.
  const [lessonStep, setLessonStep] = useState<LessonStep>(() =>
    firstLessonStep(measured.hotkey),
  );
  const lessonEvent = useCallback(
    (event: Parameters<typeof nextLessonStep>[1]) =>
      setLessonStep((step) => {
        const next = nextLessonStep(step, event, !!measured.hotkey);
        if (next === "done" && step !== "done") saveLessonDone();
        return next;
      }),
    [measured.hotkey],
  );
  useEffect(() => {
    lessonEvent(expanded ? "opened" : "closed");
  }, [expanded, lessonEvent]);
  // Room below the notch for the current act.
  const stage = stageHeight({ line, peeker, arrival, expanded });
  useEffect(() => {
    postNative({ type: "stage", height: stage });
  }, [stage]);

  const refresh = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: NOTCH_QUERY_KEY }),
    [queryClient],
  );

  const answer = useMutation({
    mutationFn: ({ id, choiceId }: { id: string; choiceId: string }) =>
      answerRequest(id, choiceId),
    onMutate: ({ id }) => {
      setError(null);
      setAnswering((s) => new Set(s).add(id));
    },
    // The lead claps for it in the open notch (NotchHero), with the sound.
    onSuccess: () => setCheer((n) => n + 1),
    onError: (err) =>
      setError(
        err instanceof Error ? err.message : "Could not send that answer",
      ),
    onSettled: (_d, _e, { id }) => {
      setAnswering((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
      refresh();
    },
  });

  // Out to where a terminal session really runs. The notch steps aside so
  // the window it brings forward is not under it.
  const showSource = useMutation({
    mutationFn: (slug: string) => showSession(slug),
    onMutate: () => setError(null),
    onSuccess: () => {
      if (inApp) postNative({ type: "collapse" });
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "Could not open it"),
  });

  // Done on a finished turn: gone from the list at once, then for good.
  const finishedDone = useMutation({
    mutationFn: (id: string) => markFinishedSeen(id),
    onMutate: (id) => {
      setError(null);
      queryClient.setQueryData<NotchState>(NOTCH_QUERY_KEY, (s) =>
        s
          ? { ...s, finished: (s.finished ?? []).filter((f) => f.id !== id) }
          : s,
      );
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "Could not mark that done"),
    onSettled: refresh,
  });

  // Finished turns replied to whose session has not taken the reply yet.
  const [sentTo, setSentTo] = useState<ReadonlySet<string>>(() => new Set());
  const finishedIds = (state?.finished ?? []).map((f) => f.id).join(" ");
  useEffect(() => {
    // A card that went (the session took the reply) needs no mark.
    const live = new Set(finishedIds.split(" "));
    setSentTo((s) =>
      [...s].every((id) => live.has(id))
        ? s
        : new Set([...s].filter((id) => live.has(id))),
    );
  }, [finishedIds]);

  const send = useMutation({
    mutationFn: ({ target, text }: { target: ReplyTarget; text: string }) =>
      target.kind === "answer"
        ? answerWithText(target.requestId, text)
        : sendMessage(target.channel, text),
    onMutate: () => setError(null),
    onSuccess: (_d, { target }) => {
      if (target.kind === "answer") setCheer((n) => n + 1);
      else {
        play("sent");
        const turns = (state?.finished ?? []).filter(
          (f) => f.from === target.slug,
        );
        const isSession =
          state?.agents.find((a) => a.slug === target.slug)?.kind === "session";
        if (isSession) {
          // A session takes the reply only once it is waiting for you, and
          // until then the reply lives in the running app alone. Its card
          // stays, marked sent, and goes by itself when the session starts
          // on it; if the app restarts first, the card is still there.
          setSentTo((s) => new Set([...s, ...turns.map((f) => f.id)]));
        } else {
          // An office bot has the reply the moment it is posted: the card
          // goes, as Done would take it.
          for (const f of turns) finishedDone.mutate(f.id);
        }
      }
      // In a thread the box stays, empty, for the next line.
      setComposer((c) =>
        c && target.kind === "message" && isAgentScreen(screenRef.current)
          ? { ...c, text: "" }
          : null,
      );
      refresh();
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "Could not send that"),
  });
  const screenRef = useRef(screen);
  screenRef.current = screen;

  const setVoiceSession = useVoice(setComposer, setError);
  const [talking, setTalking] = useState(false);
  // The talk key: while it is down the notch listens and says nothing.
  const setVoice = useCallback(
    (on: boolean) => {
      setTalking(on);
      if (on) hush();
      setVoiceSession(on);
    },
    [setVoiceSession],
  );
  useAnnounce(state, talking);
  // The morning's ideas: one peek and one line, per look, with the notch closed.
  const ideasCheckedAt = state?.ideas?.checked_at ?? "";
  const nudgeLatest = useRef({ state, expanded, talking });
  nudgeLatest.current = { state, expanded, talking };
  useEffect(() => {
    if (!ideasCheckedAt) return;
    const now = nudgeLatest.current;
    if (!now.talking) nudgeForIdeas(now.state, now.expanded);
  }, [ideasCheckedAt, expanded]);
  // Talking to the office out loud, when the office has a key for it.
  const talk = useRealtime(
    expanded,
    state?.capabilities?.screen_capture === true,
  );
  const talkRef = useRef(talk);
  talkRef.current = talk;
  const talkKey = useCallback((on: boolean): boolean => {
    const t = talkRef.current;
    if (on) {
      if (!t.available) return false;
      setTalking(true);
      hush();
      t.hold();
      return true;
    }
    setTalking(false);
    t.release();
    return true;
  }, []);
  // A message to a bot opens its thread with the box ready; a card's
  // answer keeps the box on Home, under the card.
  const openComposer = useCallback((target: ReplyTarget) => {
    setComposer({ target, text: "", listening: false });
    const next = screenForTarget(target);
    if (next) setScreen(next);
  }, []);
  const cancelComposer = useCallback(() => {
    setVoice(false);
    setComposer(null);
    setScreen(HOME);
  }, [setVoice]);
  const goHome = useCallback(() => {
    setVoice(false);
    setComposer(null);
    setScreen(HOME);
  }, [setVoice]);

  const leadTarget = useCallback((): ReplyTarget | null => {
    if (!state?.lead_dm) return null;
    return {
      kind: "message",
      slug: state.lead ?? "cos",
      name: state.lead_name || "Chief of Staff",
      channel: state.lead_dm,
    };
  }, [state]);
  const replyTarget = useCallback((): ReplyTarget | null => {
    if (!selected) return leadTarget();
    const who = agents.find((a) => a.slug === selected.from);
    return {
      kind: "answer",
      requestId: selected.id,
      to: who?.name ?? selected.from,
    };
  }, [selected, agents, leadTarget]);

  // Out to the full app, at whatever is selected. On the Mac, closing that
  // window hides it again (HideWindowOnClose) and the notch is all that is
  // left, so this is a round trip, not a hand-off.
  const openFull = useCallback(() => {
    postNative({
      type: "open",
      path: selected?.channel
        ? `/channels/${encodeURIComponent(selected.channel)}`
        : "/",
    });
  }, [selected]);

  // Where a reply chosen on a card goes: the question's answer, or the
  // finished agent's own conversation.
  const cardTarget = (id: string): ReplyTarget | null => {
    const asked = attention.find((a) => a.id === id);
    if (asked) {
      return {
        kind: "answer",
        requestId: id,
        to: asked.from_name ?? asked.from,
      };
    }
    const turn = state?.finished?.find((f) => f.id === id);
    const agent = turn && state?.agents.find((a) => a.slug === turn.from);
    const channel = agent && state ? agentChannel(agent, state) : null;
    if (!(turn && agent && channel)) return null;
    return { kind: "message", slug: turn.from, name: agent.name, channel };
  };

  useNotchKeys(expanded, {
    attention: cards,
    // During the practice step a stray ↵ or number must not answer a real
    // card: only the arrows (and ↵ on the focused practice reply) act.
    selected: lessonStep === "choose" ? undefined : selected,
    composer,
    select: setSelectedId,
    choose: (id, choiceId) => answer.mutate({ id, choiceId }),
    suggest: (id, text) => {
      const target = cardTarget(id);
      if (target) send.mutate({ target, text });
    },
    done: (id) => {
      if (state?.finished?.some((f) => f.id === id)) finishedDone.mutate(id);
    },
    reply: replyTarget,
    lead: leadTarget,
    open: openComposer,
    voice: setVoice,
    talk: talkKey,
    settings: () => setScreen(SETTINGS),
    openFull,
    close: () => {
      if (talk.phase !== "idle" || talk.said) talk.end();
      else if (screen.kind !== "home") goHome();
      else if (composer) cancelComposer();
      else if (inApp) postNative({ type: "collapse" });
      else setExpanded(false);
    },
  });

  // Outside the Mac app (a browser tab, a demo) hovering the notch opens it.
  const hoverProps = inApp
    ? {}
    : {
        onMouseEnter: () => setExpanded(true),
        onMouseLeave: () => {
          if (!composer) setExpanded(false);
        },
      };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundEnabled(next);
    setSoundOn(next);
    postNative({ type: "sound", on: next });
    if (next) play("sent");
  };

  return (
    <div {...hoverProps} className="notch-host">
      <NotchView
        state={state}
        geometry={geometry}
        expanded={expanded}
        gang={gang}
        boredom={bored}
        line={line}
        peeker={peeker}
        lessonStep={lessonStep}
        screen={screen}
        onSettings={() => setScreen(SETTINGS)}
        talking={talking}
        onBack={goHome}
        onStop={(slug) =>
          void stopBot(slug).catch(() => setError("Could not stop it"))
        }
        voice={talk.available || talk.phase !== "idle" ? talk : undefined}
        onPermission={(kind) => void requestPermission(kind)}
        onLessonPracticed={() => lessonEvent("practiced")}
        onLessonSkip={() => lessonEvent("skipped")}
        arrival={arrival}
        cheer={cheer}
        selectedId={selected?.id ?? null}
        answering={answering}
        composer={composer}
        sending={send.isPending}
        error={error ?? (query.isError ? "Lost the office. Retrying…" : null)}
        soundOn={soundOn}
        voiceAvailable={voiceAvailable()}
        onSelect={setSelectedId}
        onAnswer={(id, choiceId) => answer.mutate({ id, choiceId })}
        onReply={openComposer}
        onSend={(target, text) => send.mutate({ target, text })}
        sentTo={sentTo}
        onComposerText={(text) => setComposer((c) => (c ? { ...c, text } : c))}
        onComposerSubmit={() =>
          composer &&
          send.mutate({ target: composer.target, text: composer.text.trim() })
        }
        onComposerCancel={cancelComposer}
        onVoice={setVoice}
        onOpen={(path) => postNative({ type: "open", path })}
        onKeyboard={(active) => postNative({ type: "keyboard", active })}
        onToggleSound={toggleSound}
        onOpenFull={openFull}
        agentsOpen={agentsOpen}
        onAgentsOpen={setAgentsOpen}
        onFinishedDone={(id) => finishedDone.mutate(id)}
        onShowSource={(slug) => showSource.mutate(slug)}
      />
    </div>
  );
}
