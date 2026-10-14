import { get, post } from "../api/client";
import type { NotchState } from "./types";

export const NOTCH_QUERY_KEY = ["notch-state"] as const;

/**
 * The state poll. While the panel is open it says so (open=1): that is the
 * only time the broker reads what is in front of the owner, and it stops
 * as soon as the open polls stop.
 */
export function notchStatePath(open: boolean) {
  return open ? "/notch/state?open=1" : "/notch/state";
}

export function getNotchState(open = false) {
  return get<NotchState>(notchStatePath(open));
}

/** One picture of the display, because the person asked. Owner only. */
export function captureScreen() {
  return post<{ data_url: string; width: number; height: number }>(
    "/notch/screen/capture",
    {},
  );
}

/** Asks macOS for a grant through the app (the driver never prompts). */
export function requestPermission(kind: "accessibility" | "screen_recording") {
  return post("/notch/permissions/request", { kind });
}

/** Answers a pending request with one of its options (same path as the Inbox). */
export function answerRequest(id: string, choiceId: string) {
  return post("/requests/answer", { id, choice_id: choiceId });
}

/** Answers a pending request in words (typed or spoken). */
export function answerWithText(id: string, customText: string) {
  return post("/requests/answer", { id, custom_text: customText });
}

/** Posts the human's message into a DM, exactly as the app's composer does. */
export function sendMessage(channel: string, content: string) {
  return post("/messages", { from: "you", channel, content });
}

/** Marks a finished turn done without answering it. */
export function markFinishedSeen(id: string) {
  return post("/notch/finished/seen", { id });
}

/** Opens a terminal session where it runs (its terminal, or Codex). */
export function showSession(slug: string) {
  return post("/agents/local/sessions/show", { slug });
}
