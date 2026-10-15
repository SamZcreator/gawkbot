import type { Meta, StoryObj } from "@storybook/react-vite";

import "./notch.css";
import { BUSY_OFFICE } from "./fixtures";
import { NotchDockCards } from "./NotchDock";
import type { NotchState } from "./types";

const AT_WORK: NotchState = {
  ...BUSY_OFFICE,
  agents: [
    {
      slug: "ops",
      name: "Ops",
      mood: "working",
      detail: "Moving last week's screenshots into Shots",
      runtime: { harness: "claude-code", harness_name: "Claude Code" },
    },
    {
      slug: "release-checker",
      name: "Release Checker",
      mood: "working",
      detail: "Reading the changes waiting on the deploy",
    },
  ],
};

const noop = () => {};

const meta: Meta<typeof NotchDockCards> = {
  title: "Notch / Dock",
  component: NotchDockCards,
  args: {
    agents: AT_WORK.agents,
    state: AT_WORK,
    stopping: new Set<string>(),
    onOpen: noop,
    onStop: noop,
  },
  decorators: [
    (Story) => (
      <div
        style={{
          background:
            "linear-gradient(135deg, #6b8cff 0%, #c86dd7 60%, #ffb86b 100%)",
          padding: 24,
          display: "inline-block",
        }}
      >
        <div className="ndock-root">
          <Story />
        </div>
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof NotchDockCards>;

/** Two bots at work: the cards the Mac app floats at the top right. */
export const TwoWorking: Story = {};

/** One stop asked for, not yet taken: the button rests until the bot leaves. */
export const Stopping: Story = {
  args: { stopping: new Set(["ops"]) },
};

/** One bot, no detail line yet. */
export const OneJustStarted: Story = {
  args: {
    agents: [{ slug: "scout", name: "Scout", mood: "working" }],
  },
};
