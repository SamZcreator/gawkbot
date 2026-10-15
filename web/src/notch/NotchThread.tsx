import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

import { getMessages, type Message } from "../api/client";
import { markRead } from "./api";
import { NotchBot } from "./NotchBot";
import { Composer } from "./NotchComposer";
import type { ComposerState, PanelProps } from "./NotchPanel";
import { sinceShort } from "./NotchPanel";
import type { NotchScreen } from "./screens";
import type { NotchState } from "./types";

export const THREAD_QUERY_PREFIX = "notch-thread";
const THREAD_LINES = 60;
const THREAD_POLL_MS = 2_000;

export interface NotchThreadProps {
  state: NotchState;
  screen: Extract<NotchScreen, { kind: "agent" }>;
  composer: ComposerState | null;
  sending: boolean;
  voiceAvailable: boolean;
  onComposerText: PanelProps["onComposerText"];
  onComposerSubmit: PanelProps["onComposerSubmit"];
  onComposerCancel: PanelProps["onComposerCancel"];
  onVoice: PanelProps["onVoice"];
  onKeyboard: PanelProps["onKeyboard"];
  /** Back to Home. */
  onBack: () => void;
  /** Opens the full view at a path. */
  onOpen: (path: string) => void;
  /** Stops this bot's running turns. */
  onStop: (slug: string) => void;
}

/** Whether a message is the person's own. */
export function isYours(message: Pick<Message, "from">): boolean {
  return message.from === "human" || message.from === "you";
}

/** The last lines of the conversation, oldest first. */
export function threadLines(messages: readonly Message[]): Message[] {
  return [...messages]
    .filter((m) => m.content.trim() !== "")
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .slice(-THREAD_LINES);
}

/**
 * One bot's thread: its face and what it is doing at the top, the
 * conversation, the reply box at the bottom. Polls while shown and
 * refetches on the live stream like the rest of the notch.
 */
export function NotchThread(props: NotchThreadProps) {
  const { state, screen, composer } = props;
  const agent = state.agents.find((a) => a.slug === screen.slug);
  const query = useQuery({
    queryKey: [THREAD_QUERY_PREFIX, screen.channel],
    queryFn: () => getMessages(screen.channel, null, THREAD_LINES),
    refetchInterval: THREAD_POLL_MS,
  });
  const lines = threadLines(query.data?.messages ?? []);
  const list = useRef<HTMLDivElement>(null);
  const count = lines.length;
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);
  // Shown is read: the newest line is marked each time it changes.
  const newest = lines.at(-1)?.id ?? "";
  useEffect(() => {
    if (newest) void markRead(screen.channel, newest).catch(() => undefined);
  }, [newest, screen.channel]);
  const working = agent?.mood === "working";
  const name = agent?.name ?? screen.name;
  const now = Date.now();
  return (
    <div className="npanel nthread" data-testid={`notch-thread-${screen.slug}`}>
      <div className="nthread-head">
        <button
          type="button"
          className="nicon nthread-back"
          aria-label="Back"
          title="Back to the office (Esc)"
          onClick={props.onBack}
        >
          ‹
        </button>
        <NotchBot
          slug={screen.slug}
          avatar={agent?.avatar}
          mood={agent?.mood ?? "idle"}
          size={28}
          label=""
        />
        <span className="nthread-who">
          <b>{name}</b>
          <small>
            {agent?.detail || (agent?.mood ?? "").replace("_", " ")}
          </small>
        </span>
        {working ? (
          <button
            type="button"
            className="nbtn is-quiet is-danger"
            aria-label={`Stop ${name}`}
            onClick={() => props.onStop(screen.slug)}
          >
            Stop
          </button>
        ) : null}
        <button
          type="button"
          className="nicon"
          aria-label={`Open ${name} in full view`}
          title="Open in the full app"
          onClick={() =>
            props.onOpen(`/channels/${encodeURIComponent(screen.channel)}`)
          }
        >
          ↗
        </button>
      </div>
      <div className="nthread-msgs" ref={list}>
        {query.isLoading ? (
          <p className="nthread-empty">Opening the conversation…</p>
        ) : lines.length === 0 ? (
          <p className="nthread-empty">
            Nothing said yet. Say the first thing.
          </p>
        ) : (
          lines.map((m) => (
            <div key={m.id} className={`nmsg${isYours(m) ? " is-you" : ""}`}>
              <span className="nmsg-who">
                {isYours(m) ? "You" : name}
                {m.timestamp ? <i> · {sinceShort(m.timestamp, now)}</i> : null}
              </span>
              <span className="nmsg-text">{m.content}</span>
            </div>
          ))
        )}
      </div>
      {composer &&
      composer.target.kind === "message" &&
      composer.target.channel === screen.channel ? (
        <Composer
          key={`m:${screen.channel}`}
          composer={composer}
          sending={props.sending}
          voiceAvailable={props.voiceAvailable}
          onText={props.onComposerText}
          onSubmit={props.onComposerSubmit}
          onCancel={props.onComposerCancel}
          onVoice={props.onVoice}
          onKeyboard={props.onKeyboard}
        />
      ) : null}
    </div>
  );
}
