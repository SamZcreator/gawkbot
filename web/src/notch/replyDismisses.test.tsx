import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BUSY_OFFICE } from "./fixtures";
import { NotchApp } from "./NotchApp";
import type { NotchState } from "./types";

// Replying to a finished turn is what it was waiting for, so an office
// bot's card goes without a separate Done. A session takes the reply only
// once it is waiting for you, so its card stays, marked sent, until then.

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

async function openNotch() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { container } = render(
    <QueryClientProvider client={client}>
      <NotchApp search="" />
    </QueryClientProvider>,
  );
  // Outside the Mac app, hovering the notch opens it.
  await userEvent.hover(container.querySelector(".notch-host") as HTMLElement);
}

describe("replying to a finished turn", () => {
  it("sends the reply to that bot and dismisses its card", async () => {
    await openNotch();
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

  it("keeps a session's card, marked sent, until the session takes it", async () => {
    sendMessage.mockClear();
    markFinishedSeen.mockClear();
    served = {
      ...BUSY_OFFICE,
      agents: [
        ...BUSY_OFFICE.agents,
        {
          slug: "cc-1",
          name: "billing",
          mood: "done",
          kind: "session",
          can_message: true,
        },
      ],
      finished: [
        {
          id: "finished:cc-1@2026-10-12T09:00:00Z",
          kind: "finished",
          from: "cc-1",
          question: "Fixed it. Merge?",
          suggestions: [
            { label: "Merge it", reply: "Merge it and watch CI." },
            { label: "Hold", reply: "Hold off for now." },
          ],
        },
      ],
    };
    await openNotch();
    const card = await screen.findByTestId("notch-finished-cc-1");
    const choices = within(card).getByRole("list", { name: "Choose a reply" });
    const [first] = within(choices).getAllByRole("button");
    expect(first.textContent).toContain("Recommended");
    await userEvent.click(first);
    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith(
        expect.stringContaining("cc-1"),
        "Merge it and watch CI.",
      ),
    );
    expect(await within(card).findByRole("status")).toHaveTextContent(
      /Sent\. It goes in as soon as billing is waiting for you/,
    );
    expect(markFinishedSeen).not.toHaveBeenCalled();
    expect(
      within(card).queryByRole("list", { name: "Choose a reply" }),
    ).toBeNull();
  });

  it("answers a finished card from the keyboard: J to it, then its number", async () => {
    sendMessage.mockClear();
    await openNotch();
    await screen.findByTestId("notch-finished-cc-1");
    // The questions come first; J moves card by card down to the finished one.
    await userEvent.keyboard("jj");
    const card = screen.getByTestId("notch-finished-cc-1");
    await waitFor(() => expect(card).toHaveClass("is-selected"));
    await userEvent.keyboard("2");
    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith(
        expect.stringContaining("cc-1"),
        "Hold off for now.",
      ),
    );
  });
});
