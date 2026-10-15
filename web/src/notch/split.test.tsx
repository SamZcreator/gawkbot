import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BUSY_OFFICE, MACBOOK_NOTCH } from "./fixtures";
import { isSplit, NotchView, SPLIT_MIN_WIDTH } from "./NotchView";

vi.mock("../api/client", async (original) => ({
  ...(await original<typeof import("../api/client")>()),
  getMessages: () => Promise.resolve({ messages: [] }),
}));

const noop = () => {};
const screenOf = {
  kind: "agent" as const,
  slug: "gemini",
  name: "Gemini CLI",
  channel: "gemini__human",
};

function mount(width: number) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NotchView
        state={BUSY_OFFICE}
        geometry={{
          ...MACBOOK_NOTCH,
          expandedWidth: width,
          expandedHeight: 820,
        }}
        expanded={true}
        screen={screenOf}
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
        agentsOpen={false}
        onAgentsOpen={noop}
      />
    </QueryClientProvider>,
  );
}

describe("the open notch at a wide size", () => {
  it("shows Home and the thread side by side, and only the thread when narrow", () => {
    expect(isSplit(SPLIT_MIN_WIDTH, screenOf)).toBe(true);
    expect(isSplit(SPLIT_MIN_WIDTH - 1, screenOf)).toBe(false);
    expect(isSplit(SPLIT_MIN_WIDTH, { kind: "home" })).toBe(false);
    mount(SPLIT_MIN_WIDTH);
    expect(screen.getByTestId("notch-split")).toBeInTheDocument();
    expect(screen.getByTestId("notch-thread-gemini")).toBeInTheDocument();
    // Home in a column keeps the cards and rows, not the lead's box or the key help.
    expect(screen.getByText(/needs you/i)).toBeInTheDocument();
    expect(screen.queryByText(/Ask .* to manage any agent/)).toBeNull();
  });
  it("is the thread alone when narrow", () => {
    mount(640);
    expect(screen.queryByTestId("notch-split")).toBeNull();
    expect(screen.getByTestId("notch-thread-gemini")).toBeInTheDocument();
  });
});
