import { useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { BotRuntimeContext } from "../lib/botRuntime";
import { getNotchState, stopBot } from "./api";
import { dockAgents } from "./dock";
import { postDock } from "./dockBridge";
import { NotchBot } from "./NotchBot";
import { agentChannel } from "./NotchPanel";
import type { NotchAgent, NotchState } from "./types";

export const DOCK_QUERY_KEY = ["notch-state", "dock"] as const;
const POLL_MS = 2_000;

export interface NotchDockCardsProps {
  agents: NotchAgent[];
  state: NotchState;
  /** Slugs whose stop was asked for and has not shown yet. */
  stopping: ReadonlySet<string>;
  onOpen: (path: string) => void;
  onStop: (slug: string) => void;
}

/** The cards themselves, with nothing to fetch: what the story shows. */
export function NotchDockCards({
  agents,
  state,
  stopping,
  onOpen,
  onStop,
}: NotchDockCardsProps) {
  if (agents.length === 0) return null;
  return (
    <ul className="ndock" aria-label="Bots at work">
      {agents.map((agent) => {
        const channel = agentChannel(agent, state);
        const halting = stopping.has(agent.slug);
        return (
          <li
            key={agent.slug}
            className="ndock-card"
            data-testid={`notch-dock-${agent.slug}`}
          >
            <div className="ndock-head">
              <NotchBot
                slug={agent.slug}
                avatar={agent.avatar}
                mood={agent.mood}
                size={24}
                label=""
              />
              <span className="ndock-name">{agent.name}</span>
              <span className="ndock-state">
                <i aria-hidden="true" />
                {halting ? "Stopping" : "Working"}
              </span>
            </div>
            {agent.detail ? (
              <p className="ndock-detail">{agent.detail}</p>
            ) : null}
            <div className="ndock-actions">
              <button
                type="button"
                className="nbtn is-quiet"
                onClick={() =>
                  onOpen(`/agents/${encodeURIComponent(agent.slug)}`)
                }
              >
                History
              </button>
              {channel ? (
                <button
                  type="button"
                  className="nbtn is-quiet"
                  onClick={() =>
                    onOpen(`/channels/${encodeURIComponent(channel)}`)
                  }
                >
                  Open
                </button>
              ) : null}
              <button
                type="button"
                className="nbtn is-quiet is-danger"
                disabled={halting}
                aria-label={`Stop ${agent.name}`}
                onClick={() => onStop(agent.slug)}
              >
                Stop
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The dock page: polls the same office state as the notch, tells the Mac
 * app how much room the cards need, and hands it the paths to open.
 */
export function NotchDock() {
  const query = useQuery({
    queryKey: DOCK_QUERY_KEY,
    queryFn: () => getNotchState(false),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
  });
  const state = query.data;
  const agents = dockAgents(state);
  const [stopping, setStopping] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const toldRef = useRef({ height: -1, count: -1 });

  // A stop that took effect is a bot no longer at work: forget it.
  const working = new Set(agents.map((a) => a.slug));
  const stale = [...stopping].filter((slug) => !working.has(slug));
  if (stale.length > 0) {
    const next = new Set(stopping);
    for (const slug of stale) next.delete(slug);
    setStopping(next);
  }

  useLayoutEffect(() => {
    const count = agents.length;
    const height = count > 0 ? (rootRef.current?.offsetHeight ?? 0) : 0;
    if (toldRef.current.height === height && toldRef.current.count === count)
      return;
    toldRef.current = { height, count };
    postDock({ type: "dock", height, count });
  });

  const runtimeOf = (slug: string) =>
    state?.agents.find((a) => a.slug === slug)?.runtime;

  return (
    <BotRuntimeContext.Provider value={runtimeOf}>
      <div ref={rootRef} className="ndock-root" data-testid="notch-dock">
        {state ? (
          <NotchDockCards
            agents={agents}
            state={state}
            stopping={stopping}
            onOpen={(path) => postDock({ type: "open", path })}
            onStop={(slug) => {
              setStopping((prev) => new Set(prev).add(slug));
              void stopBot(slug).catch(() => {
                setStopping((prev) => {
                  const next = new Set(prev);
                  next.delete(slug);
                  return next;
                });
              });
            }}
          />
        ) : null}
      </div>
    </BotRuntimeContext.Provider>
  );
}
