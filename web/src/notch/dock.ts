import type { NotchAgent, NotchState } from "./types";

/**
 * The cards at the top right of the screen: one per bot at work, so you
 * can see who is busy without opening the notch. The lead is left out
 * (it is the notch itself), and so is a terminal session you opened by
 * hand: it is not a bot of the office and has nothing to stop. The one
 * "jump out" switch hides the cards too.
 */
export function dockAgents(state: NotchState | undefined): NotchAgent[] {
  if (!state || state.jump_out === false) return [];
  return state.agents.filter(
    (a) => a.mood === "working" && !a.is_lead && a.kind !== "session",
  );
}

/** The width the Mac app gives the cards (desktop/oswails/dock_darwin.m). */
export const DOCK_WIDTH = 300;
