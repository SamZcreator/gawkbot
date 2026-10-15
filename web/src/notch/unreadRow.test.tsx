import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BUSY_OFFICE, MACBOOK_NOTCH } from "./fixtures";
import { NotchView } from "./NotchView";

const noop = () => {};

describe("a bot's row at rest", () => {
  it("shows the last line of its thread and how much of it is new", () => {
    render(
      <NotchView
        state={{
          ...BUSY_OFFICE,
          attention: [],
          agents: BUSY_OFFICE.agents.map((a) =>
            a.slug === "gemini"
              ? {
                  ...a,
                  mood: "idle",
                  detail: "",
                  channel: "gemini__human",
                  last: {
                    from: "gemini",
                    text: "Done: two tests fixed.",
                    at: "2026-10-15T09:02:00Z",
                  },
                  unread: 3,
                }
              : a,
          ),
        }}
        geometry={MACBOOK_NOTCH}
        expanded={true}
        gang={[]}
        boredom={0}
        line={null}
        peeker={null}
        selectedId={null}
        answering={new Set()}
        composer={null}
        sending={false}
        error={null}
        soundOn={false}
        voiceAvailable={false}
        onSelect={noop}
        onAnswer={noop}
        onReply={noop}
        onSend={noop}
        onComposerText={noop}
        onComposerSubmit={noop}
        onComposerCancel={noop}
        onVoice={noop}
        onOpen={noop}
        onKeyboard={noop}
        onToggleSound={noop}
        onOpenFull={noop}
        onFinishedDone={noop}
        onShowSource={noop}
        agentsOpen={true}
        onAgentsOpen={vi.fn()}
      />,
    );
    const row = screen.getByTestId("notch-agent-gemini");
    expect(row).toHaveTextContent("Done: two tests fixed.");
    expect(screen.getByTestId("notch-unread-gemini")).toHaveTextContent("3");
  });
});
