import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { NOTCH_QUERY_KEY } from "./api";
import { acceptIdea, dismissIdea, markIdeaSeen } from "./ideasApi";
import { NotchBot } from "./NotchBot";
import type { NotchIdea, NotchIdeas as NotchIdeasData } from "./types";

export interface NotchIdeasProps {
  ideas: NotchIdeasData;
  /** Opens the full view at a path: the new bot's page after a Yes. */
  onOpen: (path: string) => void;
}

/**
 * Suggested for you: the office's ideas for new bots, one card at a time.
 * Each is a character, a name, the integration it works through, a promise
 * in its own words citing what it saw, why now, and how often. No sends
 * it away; "Yes, make it and go" creates the bot and starts it.
 */
export function NotchIdeas({ ideas, onOpen }: NotchIdeasProps) {
  const queryClient = useQueryClient();
  const items = ideas.items;
  const [at, setAt] = useState(0);
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const [made, setMade] = useState<{
    id: string;
    slug: string;
    name: string;
  } | null>(null);
  const [showing, setShowing] = useState(false);
  const seen = useRef<Set<string>>(new Set());
  const live = items.filter((i) => !gone.has(i.id));
  const index = Math.min(at, Math.max(0, live.length - 1));
  const idea = live[index];

  useEffect(() => {
    if (!idea || seen.current.has(idea.id)) return;
    seen.current.add(idea.id);
    void markIdeaSeen(idea.id).catch(() => undefined);
  }, [idea]);

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: NOTCH_QUERY_KEY });
  const no = useMutation({
    mutationFn: (id: string) => dismissIdea(id),
    onMutate: (id) => setGone((g) => new Set(g).add(id)),
    onSettled: refresh,
  });
  const yes = useMutation({
    mutationFn: (id: string) => acceptIdea(id),
    onSuccess: (r, id) => {
      setMade({ id, slug: r.slug, name: idea?.name ?? "" });
      setGone((g) => new Set(g).add(id));
      refresh();
    },
  });

  if (made) {
    return (
      <section className="nideas" aria-label="Suggested for you">
        <div className="nidea nidea-made" data-testid="notch-idea-made">
          <NotchBot slug={made.slug} mood="working" size={40} label="" />
          <div className="nidea-text">
            <b>{made.name} is on it.</b>
            <small>
              Its first task is under way. You will hear when it is done.
            </small>
          </div>
          <div className="nidea-actions">
            <button
              type="button"
              className="nbtn is-quiet"
              onClick={() => onOpen(`/agents/${encodeURIComponent(made.slug)}`)}
            >
              Open
            </button>
            <button
              type="button"
              className="nbtn is-quiet"
              onClick={() => setMade(null)}
            >
              {live.length > 0 ? "Next idea" : "Done"}
            </button>
          </div>
        </div>
      </section>
    );
  }
  if (!idea) return null;
  const busy = yes.isPending || no.isPending;
  return (
    <section className="nideas" aria-label="Suggested for you">
      <h3 className="nsection">
        Suggested for you · {index + 1} of {live.length}
      </h3>
      <div className="nidea" data-testid={`notch-idea-${idea.id}`}>
        <div className="nidea-head">
          <NotchBot
            slug={idea.id}
            avatar={idea.avatar}
            mood="idle"
            size={40}
            label=""
            badge={false}
          />
          <div className="nidea-text">
            <b>{idea.name}</b>
            <small>
              A new bot for this idea
              <span className="nidea-badge">
                {idea.logo_url ? (
                  <img src={idea.logo_url} alt="" width={14} height={14} />
                ) : null}
                {idea.integration_name}
              </span>
            </small>
          </div>
          {live.length > 1 ? (
            <span className="nidea-nav">
              <button
                type="button"
                className="nicon"
                aria-label="Previous idea"
                disabled={index === 0}
                onClick={() => setAt(index - 1)}
              >
                ‹
              </button>
              <button
                type="button"
                className="nicon"
                aria-label="Next idea"
                disabled={index >= live.length - 1}
                onClick={() => setAt(index + 1)}
              >
                ›
              </button>
            </span>
          ) : null}
        </div>
        <p className="nidea-promise">“{idea.promise}”</p>
        {idea.rationale ? <p className="nidea-why">{idea.rationale}</p> : null}
        {idea.cadence_label ? (
          <p className="nidea-when">{idea.cadence_label}</p>
        ) : null}
        {idea.evidence && idea.evidence.length > 0 ? (
          <div className="nidea-source">
            <button
              type="button"
              className="nidea-source-toggle"
              aria-expanded={showing}
              onClick={() => setShowing(!showing)}
            >
              {showing ? "Hide" : "Show"} what it saw · {idea.evidence.length}
            </button>
            {showing ? (
              <ul>
                {idea.evidence.map((e) => (
                  <li key={e.id}>{e.text}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {yes.isError ? (
          <p className="nidea-error">
            Could not make it. Try again, or from the full view.
          </p>
        ) : null}
        <div className="nidea-actions">
          <button
            type="button"
            className="nbtn is-quiet"
            disabled={busy}
            onClick={() => no.mutate(idea.id)}
          >
            No
          </button>
          <button
            type="button"
            className="nbtn is-primary"
            disabled={busy}
            onClick={() => yes.mutate(idea.id)}
          >
            {yes.isPending ? "Making it…" : "Yes, make it and go"}
          </button>
        </div>
      </div>
    </section>
  );
}
