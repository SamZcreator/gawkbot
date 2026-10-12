import { afterEach, describe, expect, it } from "vitest";

import {
  firstLessonStep,
  hotkeyCaps,
  lessonDone,
  nextLessonStep,
  saveLessonDone,
} from "./lesson";

afterEach(() => window.localStorage.clear());

describe("the first-run tour", () => {
  it("starts only in the Mac app, and only until it is done", () => {
    expect(firstLessonStep(undefined)).toBe("done");
    expect(firstLessonStep("alt")).toBe("open");
    expect(firstLessonStep("")).toBe("open");
    saveLessonDone();
    expect(lessonDone()).toBe(true);
    expect(firstLessonStep("alt")).toBe("done");
  });

  it("moves on only when the person does the thing", () => {
    expect(nextLessonStep("open", "closed")).toBe("open");
    expect(nextLessonStep("open", "opened")).toBe("choose");
    expect(nextLessonStep("choose", "opened")).toBe("choose");
    expect(nextLessonStep("choose", "practiced")).toBe("close");
    // Closing with the shortcut, then opening with it again, ends the tour.
    expect(nextLessonStep("close", "closed")).toBe("reopen");
    expect(nextLessonStep("reopen", "closed")).toBe("reopen");
    expect(nextLessonStep("reopen", "opened")).toBe("done");
    // With no shortcut there is nothing to reopen with.
    expect(nextLessonStep("close", "closed", false)).toBe("done");
    // Closed before practising: the next open teaches it again.
    expect(nextLessonStep("choose", "closed")).toBe("open");
    expect(nextLessonStep("choose", "skipped")).toBe("done");
  });

  it("names the keys the Mac app actually registered", () => {
    expect(hotkeyCaps("alt")).toEqual(["⌥", "Space"]);
    expect(hotkeyCaps("ctrl-alt")).toEqual(["⌃", "⌥", "Space"]);
    expect(hotkeyCaps("")).toEqual([]);
  });
});
