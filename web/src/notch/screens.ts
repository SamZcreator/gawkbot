import type { ReplyTarget } from "./NotchPanel";

/**
 * What the open notch shows: Home (what needs you, who is working, the
 * lead's box), or one bot's thread. Tapping a bot, or Reply on its card,
 * opens its thread with the reply box ready; Esc and ‹ come back Home,
 * and so does closing the notch.
 */
export type NotchScreen =
  | { kind: "home" }
  | { kind: "agent"; slug: string; name: string; channel: string };

export const HOME: NotchScreen = { kind: "home" };

/** The screen a reply target belongs on: a bot's thread, or none (a card's answer stays Home). */
export function screenForTarget(target: ReplyTarget): NotchScreen | null {
  if (target.kind !== "message") return null;
  return {
    kind: "agent",
    slug: target.slug,
    name: target.name,
    channel: target.channel,
  };
}

export function isAgentScreen(
  screen: NotchScreen,
): screen is Extract<NotchScreen, { kind: "agent" }> {
  return screen.kind === "agent";
}
