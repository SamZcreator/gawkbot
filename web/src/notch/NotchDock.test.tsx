import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dockAgents } from "./dock";
import type { DockMessage } from "./dockBridge";
import { BUSY_OFFICE, QUIET_OFFICE } from "./fixtures";
import { NotchDock } from "./NotchDock";
import type { NotchState } from "./types";

// The cards at the top right, fed by a broker whose answer the test
// controls, talking to a stand-in for the Mac app.

let served: NotchState = QUIET_OFFICE;
const stopped: string[] = [];

vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  getNotchState: () => Promise.resolve(served),
  stopBot: (slug: string) => {
    stopped.push(slug);
    return Promise.resolve();
  },
}));

type DockHost = { webkit?: unknown };
let posted: DockMessage[] = [];

const AT_WORK: NotchState = {
  ...BUSY_OFFICE,
  jump_out: true,
  agents: [
    { slug: "cos", name: "Chief of Staff", mood: "working", is_lead: true },
    { slug: "ops", name: "Ops", mood: "working", detail: "moving 14 files" },
    { slug: "scout", name: "Scout", mood: "idle" },
    {
      slug: "term",
      name: "Claude Code",
      mood: "working",
      kind: "session",
      tool: "claude-code",
    },
  ],
};

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NotchDock />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  posted = [];
  stopped.length = 0;
  (window as unknown as DockHost).webkit = {
    messageHandlers: {
      gawkDock: { postMessage: (m: DockMessage) => posted.push(m) },
    },
  };
});

afterEach(() => {
  cleanup();
  (window as unknown as DockHost).webkit = undefined;
});

describe("who gets a card", () => {
  it("is every bot at work but the lead and sessions you opened yourself", () => {
    expect(dockAgents(AT_WORK).map((a) => a.slug)).toEqual(["ops"]);
  });
  it("is nobody while bots may not leave the notch, or before the office answers", () => {
    expect(dockAgents({ ...AT_WORK, jump_out: false })).toEqual([]);
    expect(dockAgents(undefined)).toEqual([]);
  });
});

describe("the dock page", () => {
  it("shows a card per working bot and tells the app how tall it is", async () => {
    served = AT_WORK;
    mount();
    expect(await screen.findByTestId("notch-dock-ops")).toBeInTheDocument();
    expect(screen.queryByTestId("notch-dock-cos")).toBeNull();
    expect(screen.getByText("moving 14 files")).toBeInTheDocument();
    const sizes = posted.filter((m) => m.type === "dock");
    expect(sizes.at(-1)).toMatchObject({ type: "dock", count: 1 });
  });

  it("tells the app to hide when nobody is working", async () => {
    served = QUIET_OFFICE;
    mount();
    await waitFor(() =>
      expect(posted.at(-1)).toEqual({ type: "dock", height: 0, count: 0 }),
    );
  });

  it("opens history and the DM in the full view, and stops one bot", async () => {
    served = AT_WORK;
    mount();
    await screen.findByTestId("notch-dock-ops");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "History" }));
    await user.click(screen.getByRole("button", { name: "Open" }));
    const opened = posted.filter((m) => m.type === "open");
    expect(opened).toEqual([
      { type: "open", path: "/agents/ops" },
      { type: "open", path: "/channels/human__ops" },
    ]);
    await user.click(screen.getByRole("button", { name: "Stop Ops" }));
    expect(stopped).toEqual(["ops"]);
    expect(screen.getByText("Stopping")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop Ops" })).toBeDisabled();
  });
});
