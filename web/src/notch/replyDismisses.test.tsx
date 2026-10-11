import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BUSY_OFFICE } from "./fixtures";
import { NotchApp } from "./NotchApp";
import type { NotchState } from "./types";

// Replying to a finished turn is what it was waiting for, so its card goes
// without a separate Done.

let served: NotchState = {
  ...BUSY_OFFICE,
  finished: [
    {
      id: "finished:designer@2026-10-11T10:00:00Z",
      kind: "finished",
      from: "designer",
      question: "Mockups are in the wiki.",
    },
  ],
};
const sendMessage = vi.hoisted(() => vi.fn(() => Promise.resolve({})));
// The broker drops a turn once it is marked done.
const markFinishedSeen = vi.hoisted(() =>
  vi.fn((id: string) => {
    served = {
      ...served,
      finished: (served.finished ?? []).filter((f) => f.id !== id),
    };
    return Promise.resolve({});
  }),
);

vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  getNotchState: () => Promise.resolve(served),
  sendMessage,
  markFinishedSeen,
}));

describe("replying to a finished turn", () => {
  it("sends the reply to that bot and dismisses its card", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { container } = render(
      <QueryClientProvider client={client}>
        <NotchApp search="" />
      </QueryClientProvider>,
    );
    // Outside the Mac app, hovering the notch opens it.
    await userEvent.hover(
      container.querySelector(".notch-host") as HTMLElement,
    );
    const card = await screen.findByTestId("notch-finished-designer");
    await userEvent.click(within(card).getByRole("button", { name: "Reply" }));
    await userEvent.type(
      await screen.findByRole("textbox", { name: /Reply to/ }),
      "Ship it{Enter}",
    );
    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith(
        expect.stringContaining("designer"),
        "Ship it",
      ),
    );
    await waitFor(() =>
      expect(markFinishedSeen).toHaveBeenCalledWith(
        "finished:designer@2026-10-11T10:00:00Z",
      ),
    );
    expect(screen.queryByTestId("notch-finished-designer")).toBeNull();
  });
});
