import { describe, expect, it } from "vitest";

import { notchStatePath } from "./api";

describe("the state poll says when the panel is open", () => {
  it("adds open=1 only while expanded", () => {
    expect(notchStatePath(false)).toBe("/notch/state");
    expect(notchStatePath(true)).toBe("/notch/state?open=1");
  });
});
