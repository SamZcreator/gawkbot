import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BotRuntimeContext } from "../lib/botRuntime";
import { gang } from "./antics";
import { BUSY_OFFICE, MACBOOK_NOTCH, NO_NOTCH, QUIET_OFFICE } from "./fixtures";
import { NotchBot } from "./NotchBot";
import { agentsSummary } from "./NotchPanel";
import { DOT_BAND, dotsThatFit, stripShapeFor } from "./NotchStrip";
import { NotchView, type NotchViewProps } from "./NotchView";
import { byNeed } from "./order";
import type { NotchAgent, NotchState } from "./types";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function notchProps(overrides: Partial<NotchViewProps> = {}): NotchViewProps {
  return {
    state: BUSY_OFFICE,
    geometry: MACBOOK_NOTCH,
    expanded: false,
    gang: gang(BUSY_OFFICE.attention, BUSY_OFFICE.agents),
    boredom: 0,
    line: null,
    peeker: null,
    selectedId: "req-1",
    answering: new Set(),
    composer: null,
    sending: false,
    error: null,
    soundOn: true,
    voiceAvailable: true,
    onSelect: vi.fn(),
    onAnswer: vi.fn(),
    onReply: vi.fn(),
    onComposerText: vi.fn(),
    onComposerSubmit: vi.fn(),
    onComposerCancel: vi.fn(),
    onVoice: vi.fn(),
    onOpen: vi.fn(),
    onKeyboard: vi.fn(),
    onToggleSound: vi.fn(),
    onOpenFull: vi.fn(),
    agentsOpen: false,
    onAgentsOpen: vi.fn(),
    onFinishedDone: vi.fn(),
    onShowSource: vi.fn(),
    ...overrides,
  };
}

function renderNotch(overrides: Partial<NotchViewProps> = {}) {
  const props = notchProps(overrides);
  render(<NotchView {...props} />);
  return props;
}

function renderNotchWith(overrides: Partial<NotchViewProps>) {
  const props = notchProps(overrides);
  return render(<NotchView {...props} />);
}

describe("collapsed notch", () => {
  it("is exactly the notch plus two compact ears", () => {
    renderNotch();
    const shell = screen.getByTestId("notch-shell");
    // Compact ears that hug the notch, not 72 points over the menu bar.
    expect(shell.style.width).toBe(`${186 + 2 * 40}px`);
    expect(shell.style.height).toBe("32px");
  });

  it("shows every state as a centred row of dots: red, green, orange, latest first", () => {
    const at = (min: number) =>
      new Date(Date.now() - min * 60_000).toISOString();
    const state: NotchState = {
      ...QUIET_OFFICE,
      attention: [],
      finished: [
        { id: "finished:c@1", kind: "finished", from: "c", question: "done" },
        {
          id: "finished:cc-1@1",
          kind: "finished",
          from: "cc-1",
          question: "ok",
        },
      ],
      agents: [
        { slug: "a", name: "A", mood: "working", updated_at: at(9) },
        { slug: "b", name: "B", mood: "error", updated_at: at(5) },
        {
          slug: "cos",
          name: "Chief of Staff",
          mood: "working",
          is_lead: true,
          updated_at: at(1),
        },
        {
          slug: "c",
          name: "C",
          mood: "idle",
          state: "your_turn",
          updated_at: at(8),
        },
        { slug: "q", name: "Q", mood: "needs_you", updated_at: at(2) },
        { slug: "e", name: "E", mood: "idle" },
        // Marked done: its turn is over and nobody is waiting, so no dot.
        {
          slug: "d",
          name: "D",
          mood: "idle",
          state: "your_turn",
          updated_at: at(1),
        },
        {
          slug: "cc-1",
          name: "S",
          mood: "idle",
          kind: "session",
          state: "your_turn",
          updated_at: at(3),
        },
      ],
    };
    const finished = new Set(["c", "cc-1"]);
    const shape = stripShapeFor(MACBOOK_NOTCH, finished, state.agents);
    expect(shape).toEqual({ earWidth: 0, band: DOT_BAND });
    renderNotchWith({
      geometry: { ...MACBOOK_NOTCH, ...shape },
      state,
      gang: [],
    });
    const shell = screen.getByTestId("notch-shell");
    // No wider than the notch; a thin band under it.
    expect(shell.style.width).toBe("186px");
    expect(shell.style.height).toBe(`${32 + DOT_BAND}px`);
    expect(document.querySelector(".notch-strip .notch-bot")).toBeNull();
    const row = Array.from(
      screen.getByTestId("notch-dots").querySelectorAll("[data-mood]"),
    );
    expect(row.map((el) => el.getAttribute("aria-label"))).toEqual([
      "Q: needs your answer",
      "B: stuck",
      "S: finished, your turn",
      "C: finished, your turn",
      "Chief of Staff: working",
      "A: working",
    ]);
    expect(row.map((el) => el.className)).toEqual([
      "ndot ndot-needs_you",
      "ndot ndot-error",
      "ndot ndot-done",
      "ndot ndot-done",
      "ndot ndot-working",
      "ndot ndot-working",
    ]);
  });

  it("draws a question red, stuck as a red ring, a finished turn green", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/notch/notch.css"),
      "utf8",
    );
    expect(css).toMatch(
      /\.ndot-needs_you\s*\{\s*background: var\(--mood-error\);/,
    );
    expect(css).toMatch(
      /\.ndot-error\s*\{\s*background: transparent;\s*box-shadow: inset 0 0 0 1\.5px var\(--mood-error\);/,
    );
    expect(css).toMatch(/\.ndot-done\s*\{\s*background: var\(--mood-done\);/);
  });

  it("orders the agent list the same way, bots and sessions together", () => {
    const at = (min: number) =>
      new Date(Date.now() - min * 60_000).toISOString();
    const order = byNeed(
      [
        { slug: "idle", name: "I", mood: "idle", updated_at: at(0) },
        { slug: "w-old", name: "W1", mood: "working", updated_at: at(20) },
        { slug: "w-new", name: "W2", mood: "working", updated_at: at(1) },
        {
          slug: "turn",
          name: "T",
          mood: "idle",
          kind: "session",
          updated_at: at(4),
        },
        { slug: "ask", name: "A", mood: "needs_you", updated_at: at(30) },
      ],
      new Set(["turn"]),
    ).map((a) => a.slug);
    expect(order).toEqual(["ask", "turn", "w-new", "w-old", "idle"]);
  });

  it("draws work as a pulsing orange dot, with no spinner left in the notch", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/notch/notch.css"),
      "utf8",
    );
    expect(css).toMatch(
      /\.ndot-working\s*\{\s*background: var\(--dot-working\);/,
    );
    expect(css).toMatch(/--dot-working: #ff9f0a;/);
    expect(css).toMatch(/\.ndot-working\s*\{\s*animation: ndot-pulse/);
    expect(css).not.toMatch(/rotate\(360deg\)/);
    expect(css).not.toMatch(/ndot-spin/);
  });

  it("fits as many dots as the notch is wide", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      slug: `b${i}`,
      name: `B${i}`,
      mood: "working" as const,
    }));
    const state: NotchState = { ...QUIET_OFFICE, attention: [], agents: many };
    const shape = stripShapeFor(MACBOOK_NOTCH, new Set(), many);
    renderNotchWith({
      geometry: { ...MACBOOK_NOTCH, ...shape },
      state,
      gang: [],
    });
    expect(
      screen.getByTestId("notch-dots").querySelectorAll("[data-mood]"),
    ).toHaveLength(dotsThatFit(186));
    expect(dotsThatFit(186)).toBe(17);
  });

  it("sizes the strip to what is going on", () => {
    const idle = [{ slug: "x", name: "X", mood: "idle" as const }];
    const working = [{ slug: "x", name: "X", mood: "working" as const }];
    const none = new Set<string>();
    expect(stripShapeFor(MACBOOK_NOTCH, none, idle)).toEqual({
      earWidth: 0,
      band: 0,
    });
    expect(stripShapeFor(MACBOOK_NOTCH, none, working)).toEqual({
      earWidth: 0,
      band: DOT_BAND,
    });
    // Something that needs the human is a dot too, never faces beside the notch.
    const asking = [{ slug: "x", name: "X", mood: "needs_you" as const }];
    expect(stripShapeFor(MACBOOK_NOTCH, none, asking)).toEqual({
      earWidth: 0,
      band: DOT_BAND,
    });
    expect(stripShapeFor(MACBOOK_NOTCH, new Set(["x"]), idle)).toEqual({
      earWidth: 0,
      band: DOT_BAND,
    });
    expect(stripShapeFor(NO_NOTCH, none, working)).toEqual({
      earWidth: NO_NOTCH.earWidth,
      band: 0,
    });
  });

  it("is exactly the notch, nothing beside it, when it has no ears", () => {
    renderNotchWith({
      geometry: { ...MACBOOK_NOTCH, earWidth: 0 },
      state: QUIET_OFFICE,
      gang: [],
    });
    const shell = screen.getByTestId("notch-shell");
    expect(shell.style.width).toBe("186px");
    expect(shell.style.height).toBe("32px");
    // Nothing is drawn: the notch itself has no pixels to draw in.
    expect(document.querySelector(".notch-strip .notch-bot")).toBeNull();
  });

  it("piles everyone who needs you onto the notch, with a count", () => {
    renderNotch();
    expect(screen.getByTestId("notch-gang").children).toHaveLength(2);
    expect(
      screen.getByRole("img", { name: "Gemini CLI needs you" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("2 need you")).toBeInTheDocument();
  });

  it("lets the bored gang talk below the notch", () => {
    renderNotch({
      boredom: 2,
      line: { speaker: "gemini", text: "Is the human even there?" },
    });
    expect(screen.getByTestId("notch-chat")).toHaveTextContent(
      "Gemini CLI Is the human even there?",
    );
  });

  it("shows an agent peeking out for fun", () => {
    renderNotch({
      state: QUIET_OFFICE,
      gang: [],
      peeker: QUIET_OFFICE.agents[1],
    });
    expect(
      screen.getByRole("img", { name: "Designer peeks out" }),
    ).toBeInTheDocument();
  });

  it("flies a new asker in under the notch before it joins the gang", () => {
    const flyer = gang(BUSY_OFFICE.attention, BUSY_OFFICE.agents)[0];
    renderNotch({ arrival: flyer });
    expect(
      screen.getByRole("img", {
        name: `${flyer.name} flies in with a question`,
      }),
    ).toBeInTheDocument();
    // Still in the air: the gang waits for it to land.
    expect(screen.getByTestId("notch-gang").children).toHaveLength(1);
    expect(
      screen.queryByRole("img", { name: `${flyer.name} needs you` }),
    ).toBeNull();
  });

  it("puts the lead to sleep in a mask when nothing is going on", () => {
    const quiet = {
      ...QUIET_OFFICE,
      mood: "idle" as const,
      attention: [],
      agents: QUIET_OFFICE.agents.map((a) => ({ ...a, mood: "idle" as const })),
    };
    const { unmount } = renderNotchWith({ state: quiet, gang: [] });
    expect(
      screen.getByRole("img", { name: /asleep, nothing needs you/ }),
    ).toHaveClass("nb-tucked");
    expect(document.querySelector(".nb-mask")).not.toBeNull();
    // A mask is enough; there is no blanket.
    expect(document.querySelector(".nb-blanket")).toBeNull();
    unmount();
    // The human opens the notch (hovering in opens it): it wakes up.
    const open = renderNotchWith({ state: quiet, gang: [], expanded: true });
    expect(document.querySelector(".nb-mask")).toBeNull();
    expect(document.querySelector(".notch-strip .nb-awake")).not.toBeNull();
    expect(document.querySelector(".notch-strip .nb-tucked")).toBeNull();
    open.unmount();
    // Someone working, or anything waiting on the human: it is up.
    renderNotch();
    expect(document.querySelector(".nb-mask")).toBeNull();
  });

  it("renders as a pill on Macs without a notch", () => {
    renderNotch({ geometry: NO_NOTCH, state: QUIET_OFFICE, gang: [] });
    expect(screen.getByTestId("notch-shell").style.width).toBe("128px");
    expect(screen.queryByLabelText(/need you/)).not.toBeInTheDocument();
  });
});

describe("open notch", () => {
  it("answers in one tap and numbers the answers on the selected question", async () => {
    const props = renderNotch({ expanded: true });
    const approve = screen.getByRole("button", { name: "1 Approve" });
    await userEvent.click(approve);
    expect(props.onAnswer).toHaveBeenCalledWith("req-1", "approve");
  });

  it("replies to the asker in words", async () => {
    const props = renderNotch({ expanded: true });
    await userEvent.click(screen.getAllByRole("button", { name: /Reply/ })[1]);
    expect(props.onReply).toHaveBeenCalledWith({
      kind: "answer",
      requestId: "req-2",
      to: "Chief of Staff",
    });
  });

  it("badges every agent with what it runs on, sessions and bots alike", () => {
    const [lead, ...rest] = BUSY_OFFICE.agents;
    const state: NotchState = {
      ...BUSY_OFFICE,
      agents: [
        {
          ...lead,
          runtime: {
            harness: "claude-code",
            harness_name: "Claude Code",
            model_label: "Sonnet 4.6",
            family: "claude",
            source: "default",
          },
        },
        ...rest,
        {
          slug: "session.codex.b",
          name: "Add rate limits to the login route",
          mood: "working",
          kind: "session",
          tool: "codex",
          tool_name: "Codex CLI",
          runtime: {
            harness: "codex",
            harness_name: "Codex CLI",
            model: "gpt-6-astra",
            model_label: "GPT-6 Astra",
            family: "gpt",
            source: "observed",
          },
        },
      ],
    };
    renderNotch({ expanded: true, agentsOpen: true, state });
    const session = screen.getByTestId("notch-agent-session.codex.b");
    expect(
      session.querySelector(
        '[role="img"][aria-label="Runs on GPT-6 Astra in Codex CLI"]',
      ),
    ).not.toBeNull();
    // A bot that is asking carries its badge on the question card too.
    expect(
      document.querySelector(
        '.model-badge[aria-label="Runs on Sonnet 4.6 in Claude Code"]',
      ),
    ).not.toBeNull();
    // The collapsed strip is too small for a legible badge: its bots are
    // drawn, and none of them carries one.
    const gang = screen.getByTestId("notch-gang");
    expect(gang.querySelector(".notch-bot")).not.toBeNull();
    expect(gang.querySelector(".model-badge")).toBeNull();
    // The badge sits on the bot, beside its mood: it does not replace the
    // notch's own mood class.
    const bot = session.querySelector(".notch-bot");
    expect(bot).toHaveClass("nb-working");
    expect(bot?.querySelector(".model-badge")).not.toBeNull();
  });

  it("says what a named bot runs on in its accessible name", () => {
    // The bot is one image to a screen reader, so the badge inside it is
    // not read on its own.
    render(
      <BotRuntimeContext.Provider
        value={() => ({
          harness: "codex",
          harness_name: "Codex CLI",
          model_label: "GPT-6 Astra",
        })}
      >
        <NotchBot slug="cx-1" mood="working" label="Rate limits: working" />
      </BotRuntimeContext.Provider>,
    );
    expect(
      screen.getByRole("img", {
        name: "Rate limits: working, runs on GPT-6 Astra in Codex CLI",
      }),
    ).toBeInTheDocument();
  });

  it("lists a session running on this Mac as an agent, by what it is doing", async () => {
    const state: NotchState = {
      ...BUSY_OFFICE,
      agents: [
        ...BUSY_OFFICE.agents,
        {
          slug: "session.claude-code.a",
          name: "Fix the flaky checkout test",
          mood: "idle",
          detail: "Your turn · shop",
          kind: "session",
          tool: "claude-code",
          tool_name: "Claude Code",
          project: "shop",
          cwd: "/Users/me/shop",
          state: "your_turn",
          updated_at: new Date(Date.now() - 12 * 60_000).toISOString(),
          last_said: "Both fixes pass. Which one should I keep?",
        },
      ],
    };
    renderNotch({ expanded: true, agentsOpen: true, state });
    // One list: there is no separate section for what runs on this Mac.
    expect(screen.queryByLabelText("Running on this Mac")).toBeNull();
    const row = screen.getByTestId("notch-agent-session.claude-code.a");
    // The words are what the session is about; the tool is the logo.
    expect(row).toHaveTextContent("Fix the flaky checkout test");
    expect(row).toHaveTextContent("Your turn · shop · 12m");
    expect(
      row.querySelector('[role="img"][aria-label="Claude Code"] svg'),
    ).not.toBeNull();
    // It has its own face, like every other agent.
    expect(row.querySelector("svg, canvas")).not.toBeNull();
    // Bots and sessions share one list; a terminal mark says which is which.
    expect(screen.queryByText(/^gawkbot team/)).toBeNull();
    expect(screen.queryByText(/^Sessions on this Mac/)).toBeNull();
    expect(
      row.querySelector(
        '.nsession-mark[aria-label="Claude Code session on this Mac"]',
      ),
    ).not.toBeNull();
    expect(
      screen
        .getByTestId("notch-agent-designer")
        .querySelector(".nsession-mark"),
    ).toBeNull();
    // Not a member of the office yet: pressing it shows what it last said.
    expect(row.querySelector(".nagent-open")).toBeNull();
    expect(row).not.toHaveTextContent("Which one should I keep?");
    await userEvent.click(
      screen.getByRole("button", { name: /Fix the flaky checkout test/ }),
    );
    expect(row).toHaveTextContent("Both fixes pass. Which one should I keep?");
    expect(row).toHaveTextContent("/Users/me/shop");
    expect(row).toHaveTextContent("Answer it in its Claude Code window.");
  });

  it("lists a finished turn under Needs you, to reply to or mark done", async () => {
    const state: NotchState = {
      ...BUSY_OFFICE,
      finished: [
        {
          id: "finished:designer@2026-10-11T10:00:00Z",
          kind: "finished",
          from: "designer",
          title: "Your turn",
          question: "Mockups are in the wiki.",
        },
      ],
    };
    const props = renderNotch({ expanded: true, state });
    expect(
      screen.getByText(`Needs you · ${BUSY_OFFICE.attention.length + 1}`),
    ).toBeInTheDocument();
    const card = screen.getByTestId("notch-finished-designer");
    expect(card).toHaveTextContent("Mockups are in the wiki.");
    expect(card).toHaveTextContent("your turn");
    await userEvent.click(within(card).getByRole("button", { name: "Reply" }));
    expect(props.onReply).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "message", slug: "designer" }),
    );
    await userEvent.click(within(card).getByRole("button", { name: "Done" }));
    expect(props.onFinishedDone).toHaveBeenCalledWith(
      "finished:designer@2026-10-11T10:00:00Z",
    );
  });

  it("recaps a finished turn: the work, the last ask, where it stands", async () => {
    const reply = `Not fully finished.\n\n- Renderer done.\n- Commit pending. ${"More words. ".repeat(30)}`;
    const state: NotchState = {
      ...BUSY_OFFICE,
      finished: [
        {
          id: "finished:designer@1",
          kind: "finished",
          from: "designer",
          question: "…Commit pending.",
          created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
          recap: {
            project: "gawkbot",
            asked: "Redo the liquid glass design system on a new branch",
            last_asked: "is it finished?",
            reply,
          },
        },
      ],
    };
    renderNotch({ expanded: true, state });
    const card = screen.getByTestId("notch-finished-designer");
    expect(card).toHaveTextContent("gawkbot · 5m ago");
    const sections = Array.from(card.querySelectorAll(".nrecap")).map((el) => [
      el.querySelector("h4")?.textContent,
      el.querySelector("p")?.textContent,
    ]);
    expect(sections.slice(0, 2)).toEqual([
      ["You asked", "Redo the liquid glass design system on a new branch"],
      ["Last you said", "is it finished?"],
    ]);
    expect(sections[2][0]).toBe("Where it stands");
    const where = within(card).getByTestId("notch-finished-reply");
    expect(where.textContent).toBe(reply);
    expect(where).not.toHaveClass("is-open");
    await userEvent.click(within(card).getByRole("button", { name: "More" }));
    expect(where).toHaveClass("is-open");
  });

  it("shows the turn before when the latest reply is too short to say much", () => {
    const state: NotchState = {
      ...BUSY_OFFICE,
      finished: [
        {
          id: "finished:designer@2",
          kind: "finished",
          from: "designer",
          question: "Restarted the preview.",
          recap: {
            reply: "Restarted the preview.",
            earlier: "Pricing page rebuilt; two plans left to write.",
          },
        },
      ],
    };
    renderNotch({ expanded: true, state });
    const card = screen.getByTestId("notch-finished-designer");
    const sections = Array.from(card.querySelectorAll(".nrecap")).map(
      (el) => el.querySelector("h4")?.textContent,
    );
    expect(sections).toEqual(["Before that", "Latest"]);
    expect(card).toHaveTextContent(
      "Pricing page rebuilt; two plans left to write.",
    );
  });

  it("names the way into the full app on every card", () => {
    const state: NotchState = {
      ...BUSY_OFFICE,
      finished: [
        {
          id: "finished:designer@1",
          kind: "finished",
          from: "designer",
          question: "Done.",
        },
      ],
    };
    renderNotch({ expanded: true, state });
    const card = screen.getByTestId("notch-finished-designer");
    expect(
      within(card).getByRole("button", { name: "Open in gawkbot" }),
    ).toBeInTheDocument();
    const question = screen.getByTestId(
      `notch-attention-${BUSY_OFFICE.attention[0].id}`,
    );
    expect(
      within(question).getByRole("button", { name: "Open in gawkbot" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
  });

  it("opens a session where it runs, from its card and its row", async () => {
    const session: NotchAgent = {
      slug: "cc-1a2b3c4d",
      name: "Fix the flaky test",
      mood: "idle",
      kind: "session",
      tool: "claude-code",
      tool_name: "Claude Code",
      state: "your_turn",
      can_message: true,
    };
    const state: NotchState = {
      ...BUSY_OFFICE,
      agents: [
        ...BUSY_OFFICE.agents,
        session,
        {
          ...session,
          slug: "cx-9",
          name: "Tidy",
          tool: "codex",
          state: "quiet",
        },
        { ...session, slug: "cc-2", name: "Old", open: false, state: "quiet" },
      ],
      finished: [
        {
          id: "finished:cc-1a2b3c4d@1",
          kind: "finished",
          from: "cc-1a2b3c4d",
          question: "Done.",
        },
      ],
    };
    const props = renderNotch({ expanded: true, agentsOpen: true, state });
    const card = screen.getByTestId("notch-finished-cc-1a2b3c4d");
    await userEvent.click(
      within(card).getByRole("button", { name: "Open in its window" }),
    );
    expect(props.onShowSource).toHaveBeenCalledWith("cc-1a2b3c4d");
    expect(
      screen.getByRole("button", { name: "Open in Codex: Tidy" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Resume in Terminal: Old" }),
    ).toBeInTheDocument();
    // An office bot lives in gawkbot: it has no such button.
    expect(
      within(screen.getByTestId("notch-agent-designer")).queryByRole("button", {
        name: /Open in its window|Open in Codex|Resume in Terminal/,
      }),
    ).toBeNull();
  });

  it("does not send the human to a window that is closed", async () => {
    const state: NotchState = {
      ...BUSY_OFFICE,
      agents: [
        ...BUSY_OFFICE.agents,
        {
          slug: "session.claude-code.b",
          name: "Tidy the migration scripts",
          mood: "idle",
          detail: "Closed · api",
          kind: "session",
          tool: "claude-code",
          tool_name: "Claude Code",
          open: false,
          last_said: "Run them on staging?",
        },
      ],
    };
    renderNotch({ expanded: true, agentsOpen: true, state });
    await userEvent.click(
      screen.getByRole("button", { name: /Tidy the migration scripts/ }),
    );
    const row = screen.getByTestId("notch-agent-session.claude-code.b");
    expect(row).toHaveTextContent("Its Claude Code window is closed.");
    expect(row).not.toHaveTextContent("Answer it in its");
  });

  it("shows every active agent on the strip in its own state, up to the cap", () => {
    const moods = [
      "working",
      "done",
      "error",
      "working",
      "working",
      "working",
      "working",
    ] as const;
    const agents = [
      {
        slug: "cos",
        name: "Chief of Staff",
        mood: "idle" as const,
        is_lead: true,
      },
      ...moods.map((mood, i) => ({ slug: `bot-${i}`, name: `Bot ${i}`, mood })),
      { slug: "napper", name: "Napper", mood: "idle" as const },
    ];
    const state: NotchState = {
      ...QUIET_OFFICE,
      mood: "working",
      attention: [],
      agents,
    };
    // The roomier pill of a Mac without a notch holds five, with a "+N".
    const pill = renderNotchWith({ state, gang: [], geometry: NO_NOTCH });
    const crew = screen.getByTestId("notch-crew");
    expect(crew.children).toHaveLength(5);
    // The one that hit a snag leads, then the one that finished, then work.
    const shown = Array.from(crew.querySelectorAll("[data-mood]")).map((el) =>
      el.getAttribute("data-mood"),
    );
    expect(shown).toEqual(["error", "done", "working", "working", "working"]);
    // Two more are working than the strip holds; the idle ones do not count.
    expect(
      screen.getByRole("img", { name: "2 more active" }),
    ).toHaveTextContent("+2");
    pill.unmount();

    // Compact ears hugging a notch hold three, and no "+N" text.
    renderNotchWith({ state, gang: [] });
    const compact = screen.getByTestId("notch-crew");
    expect(
      Array.from(compact.querySelectorAll("[data-mood]")).map((el) =>
        el.getAttribute("data-mood"),
      ),
    ).toEqual(["error", "done", "working"]);
    expect(screen.queryByRole("img", { name: /more active/ })).toBeNull();
  });

  it("treats a session that has joined the office exactly like a bot", async () => {
    const state: NotchState = {
      ...BUSY_OFFICE,
      agents: [
        ...BUSY_OFFICE.agents,
        {
          slug: "cc-1a2b3c4d",
          name: "Fix the flaky checkout test",
          mood: "idle",
          detail: "Your turn · shop",
          kind: "session",
          tool: "claude-code",
          tool_name: "Claude Code",
          can_message: true,
        },
      ],
    };
    const props = renderNotch({ expanded: true, agentsOpen: true, state });
    await userEvent.click(
      screen.getByRole("button", {
        name: "Message Fix the flaky checkout test",
      }),
    );
    expect(props.onReply).toHaveBeenCalledWith({
      kind: "message",
      slug: "cc-1a2b3c4d",
      name: "Fix the flaky checkout test",
      channel: "cc-1a2b3c4d__human",
    });
    await userEvent.click(
      screen.getByRole("button", {
        name: "Open Fix the flaky checkout test in full view",
      }),
    );
    expect(props.onOpen).toHaveBeenCalledWith("/agents/cc-1a2b3c4d");
  });

  it("says what the folded agent list holds, and that it opens", () => {
    renderNotch({ expanded: true });
    const toggle = screen.getByRole("button", { name: /Agents/ });
    expect(toggle).toHaveTextContent("Show all");
    // The lead is not in the list: it has a box of its own.
    expect(toggle).toHaveTextContent(
      agentsSummary(BUSY_OFFICE.agents.filter((a) => !a.is_lead)),
    );
  });

  it("always shows the lead's own chat box, outside the agent list", async () => {
    const state: NotchState = {
      ...QUIET_OFFICE,
      attention: [],
      lead_recent: [
        { from: "you", text: "Get the checkout release out this week." },
        {
          from: QUIET_OFFICE.lead ?? "cos",
          text: "On it. I split it into three tasks.",
        },
      ],
    };
    // Nothing needs the human and the agent list is folded: it is there.
    const props = renderNotch({ expanded: true, state, agentsOpen: false });
    const box = screen.getByRole("region", {
      name: state.lead_name ?? "Chief of Staff",
    });
    expect(box).toHaveTextContent("Get the checkout release out this week.");
    expect(box).toHaveTextContent("On it. I split it into three tasks.");
    // It is not inside the agents block, and the lead is not listed there.
    const agents = screen.getByRole("region", { name: "Agents" });
    expect(agents.contains(box)).toBe(false);
    expect(box.contains(agents)).toBe(false);
    // Typing to it and opening it in the full app both start from the box.
    await userEvent.click(
      screen.getByRole("button", { name: /^Ask .* to manage any agent/ }),
    );
    expect(props.onReply).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "message", channel: state.lead_dm }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^Open .* in full view$/ }),
    );
    expect(props.onOpen).toHaveBeenCalledWith(`/agents/${state.lead ?? "cos"}`);
  });

  it("does not list the lead among the agents", () => {
    renderNotch({ expanded: true, agentsOpen: true });
    const lead = BUSY_OFFICE.agents.find((a) => a.is_lead);
    expect(lead).toBeDefined();
    expect(screen.queryByTestId(`notch-agent-${lead?.slug}`)).toBeNull();
  });

  it("keeps the agent list folded away until asked for", async () => {
    const props = renderNotch({ expanded: true });
    expect(screen.queryByTestId("notch-agent-gemini")).toBeNull();
    const toggle = screen.getByRole("button", { name: /Agents/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(props.onAgentsOpen).toHaveBeenCalledWith(true);
  });

  it("tags a local agent with the tool that runs it, after who made it", () => {
    renderNotch({ expanded: true, agentsOpen: true });
    const gemini = screen.getByTestId("notch-agent-gemini");
    expect(
      Array.from(gemini.querySelectorAll(".ntag")).map((t) => t.textContent),
    ).toEqual(["adopted", "Gemini CLI · this Mac"]);
    // No tool from the broker: only the origin.
    expect(
      Array.from(
        screen.getByTestId("notch-agent-codex").querySelectorAll(".ntag"),
      ).map((t) => t.textContent),
    ).toEqual(["adopted"]);
    // A question card keeps one tag: who made it when it runs here.
    expect(
      Array.from(
        screen.getByTestId("notch-attention-req-1").querySelectorAll(".ntag"),
      ).map((t) => t.textContent),
    ).toEqual(["adopted", "holding up work"]);
  });

  it("messages an agent from the roster, with a button for its full view", async () => {
    const props = renderNotch({ expanded: true, agentsOpen: true });
    expect(screen.getByTestId("notch-agent-hermes")).toHaveTextContent(
      "Hermes gateway",
    );
    // The row is the quick chat, including for agents running elsewhere.
    await userEvent.click(
      screen.getByRole("button", { name: "Message Hermes" }),
    );
    expect(props.onReply).toHaveBeenCalledWith({
      kind: "message",
      slug: "hermes",
      name: "Hermes",
      channel: "hermes__human",
    });
    expect(props.onOpen).not.toHaveBeenCalled();
    // The arrow leaves for the agent's page in the full app.
    await userEvent.click(
      screen.getByRole("button", { name: "Open Hermes in full view" }),
    );
    expect(props.onOpen).toHaveBeenCalledWith("/agents/hermes");
  });

  it("opens the selected question with its full background, and only that one", () => {
    const state = {
      ...BUSY_OFFICE,
      attention: BUSY_OFFICE.attention.map((a, i) =>
        i === 0
          ? {
              ...a,
              context: "Short lead-in.",
              brief: {
                context: "The whole account of the decision.",
                project: "checkout",
                project_about: "Ship the new checkout this week.",
                task: { title: "Migrate sessions", status: "in_progress" },
                recent: [
                  {
                    from: "gemini",
                    name: "Gemini CLI",
                    text: "Dry run is clean.",
                  },
                ],
              },
              options: (a.options ?? []).map((o) =>
                o.id === "approve" ? { ...o, description: "Sends it now." } : o,
              ),
            }
          : a,
      ),
    };
    const first = state.attention[0].id;
    renderNotch({ expanded: true, state, selectedId: first });
    const card = screen.getByTestId(`notch-attention-${first}`);
    const brief = screen.getByTestId("notch-brief");
    expect(card).toContainElement(brief);
    expect(brief).toHaveTextContent(
      "#checkout Ship the new checkout this week.",
    );
    expect(brief).toHaveTextContent("Migrate sessions");
    expect(brief).toHaveTextContent("in progress");
    expect(brief).toHaveTextContent("The whole account of the decision.");
    expect(brief).toHaveTextContent("Gemini CLI Dry run is clean.");
    expect(card).toHaveTextContent("Sends it now.");
    // One brief on screen: the cards that are not selected stay short.
    expect(screen.getAllByTestId("notch-brief")).toHaveLength(1);
  });

  it("shows only the lead-in on a question that is not selected", () => {
    const state = {
      ...BUSY_OFFICE,
      attention: BUSY_OFFICE.attention.map((a, i) =>
        i === 0
          ? {
              ...a,
              context: "Short lead-in.",
              brief: { context: "The whole account." },
            }
          : a,
      ),
    };
    renderNotch({ expanded: true, state, selectedId: "none" });
    expect(screen.queryByTestId("notch-brief")).toBeNull();
    expect(screen.getByText("Short lead-in.")).toBeInTheDocument();
  });

  it("composes, listens and sends", async () => {
    const props = renderNotch({
      expanded: true,
      composer: {
        target: {
          kind: "message",
          slug: "codex",
          name: "Codex CLI",
          channel: "codex__human",
        },
        text: "pause it",
        listening: false,
      },
    });
    await userEvent.click(screen.getByRole("button", { name: /Send/ }));
    expect(props.onComposerSubmit).toHaveBeenCalled();
    screen
      .getByRole("button", { name: "Talk" })
      .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(props.onVoice).toHaveBeenCalledWith(true);
  });

  it("opens the full app from the widget", async () => {
    const props = renderNotch({ expanded: true });
    await userEvent.click(
      screen.getByRole("button", { name: "Open full view" }),
    );
    expect(props.onOpenFull).toHaveBeenCalled();
  });

  it("can mute its sounds", async () => {
    const props = renderNotch({ expanded: true });
    await userEvent.click(screen.getByRole("button", { name: "Mute sounds" }));
    expect(props.onToggleSound).toHaveBeenCalled();
  });

  it("disables answers already in flight", () => {
    renderNotch({ expanded: true, answering: new Set(["req-1"]) });
    expect(screen.getByRole("button", { name: "1 Approve" })).toBeDisabled();
  });
});
