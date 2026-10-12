import type { NotchHotkey } from "./types";

// The first-run lesson: how to open the notch from the keyboard, how to
// pick and send a reply, and how to close it. Each step ends when the
// person does the thing, never on a timer:
//
//   open    the notch is closed: a bubble under it shows the keys to press
//   choose  open: a practice card; ↓ (or ↑) moves to a reply, ↵ sends it
//   close   the same keys, or Esc, close it
//
// The practice card sends nothing anywhere. Done (or skipped) is kept in
// this viewer's storage; if that is cleared the lesson comes back, which is
// harmless.

export type LessonStep = "open" | "choose" | "close" | "done";

const LESSON_KEY = "gawkbot.notch.lesson";

export function lessonDone(): boolean {
  try {
    return window.localStorage.getItem(LESSON_KEY) === "done";
  } catch {
    return false;
  }
}

export function saveLessonDone(): void {
  try {
    window.localStorage.setItem(LESSON_KEY, "done");
  } catch {
    // Storage is off: the lesson shows again next time, nothing worse.
  }
}

/** The first step to show, or "done" when there is nothing to teach. */
export function firstLessonStep(hotkey: NotchHotkey | undefined): LessonStep {
  // Outside the Mac app there is no global shortcut to teach.
  if (hotkey === undefined || lessonDone()) return "done";
  return "open";
}

/** The keys of the shortcut that opens the notch, one keycap each. */
export function hotkeyCaps(hotkey: NotchHotkey | undefined): string[] {
  switch (hotkey) {
    case "alt":
      return ["⌥", "Space"];
    case "ctrl-alt":
      return ["⌃", "⌥", "Space"];
    default:
      return [];
  }
}

/** The step after this one, given what just happened. */
export function nextLessonStep(
  step: LessonStep,
  event: "opened" | "closed" | "practiced" | "skipped",
): LessonStep {
  if (event === "skipped") return "done";
  if (step === "open" && event === "opened") return "choose";
  if (step === "choose" && event === "practiced") return "close";
  // Closing before practising skips the practice; the next open teaches it.
  if (step === "choose" && event === "closed") return "open";
  if (step === "close" && event === "closed") return "done";
  return step;
}
