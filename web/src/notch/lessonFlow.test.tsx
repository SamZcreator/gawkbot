import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BUSY_OFFICE } from "./fixtures";
import { lessonDone } from "./lesson";
import { NotchApp } from "./NotchApp";

// The tour end to end, as a person meets it on first run: the practice
// card once it opens, then closing and reopening it with the shortcut.

const sendMessage = vi.hoisted(() => vi.fn(() => Promise.resolve({})));
const answerRequest = vi.hoisted(() => vi.fn(() => Promise.resolve({})));
vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  getNotchState: () => Promise.resolve(BUSY_OFFICE),
  sendMessage,
  answerRequest,
}));

afterEach(() => window.localStorage.clear());

describe("the first-run tour", () => {
  it("teaches the shortcut, lets you practise, and then stays out of the way", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { container } = render(
      <QueryClientProvider client={client}>
        <NotchApp search="?nw=186&nh=32&ew=40&hk=alt" />
      </QueryClientProvider>,
    );
    // Nothing hangs under the closed notch, tour or not.
    await screen.findByTestId("notch-shell");
    expect(screen.queryByTestId("notch-lesson")).toBeNull();
    expect(container.querySelector(".notch-stage")).toBeNull();

    // Outside the Mac app, hovering opens the notch; in it, ⌥Space does.
    const host = container.querySelector(".notch-host") as HTMLElement;
    await userEvent.hover(host);
    const card = await screen.findByTestId("notch-lesson");

    // ↓ lands on the practice card's recommended reply, ↵ sends it.
    await userEvent.keyboard("{ArrowDown}");
    const practice = within(card).getAllByRole("button")[0];
    expect(document.activeElement).toBe(practice);
    // ↵ on it moves the tour on, and answers no real card.
    await userEvent.keyboard("{Enter}");
    expect(answerRequest).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent(
      /press ⌥\s*Space to close me, then press it again/,
    );

    // Close it, then bring it back: the tour is over.
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByTestId("notch-lesson")).toBeNull(),
    );
    expect(lessonDone()).toBe(false);
    await userEvent.unhover(host);
    await userEvent.hover(host);
    await screen.findByRole("list", { name: "Choose a reply" });
    expect(screen.queryByTestId("notch-lesson")).toBeNull();
    expect(lessonDone()).toBe(true);
  });
});
