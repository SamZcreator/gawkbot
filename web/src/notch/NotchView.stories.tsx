import type { Meta, StoryObj } from "@storybook/react-vite";

import "./notch.css";

import { gang } from "./antics";
import {
  BUSY_OFFICE,
  FINISHED_OFFICE,
  MACBOOK_NOTCH,
  NO_NOTCH,
  QUIET_OFFICE,
} from "./fixtures";
import { NotchView } from "./NotchView";

const noop = () => {};
const busyGang = gang(BUSY_OFFICE.attention, BUSY_OFFICE.agents);

const meta: Meta<typeof NotchView> = {
  title: "Notch / NotchView",
  component: NotchView,
  args: {
    state: BUSY_OFFICE,
    geometry: MACBOOK_NOTCH,
    expanded: false,
    gang: busyGang,
    boredom: 0,
    line: null,
    peeker: null,
    selectedId: "req-1",
    answering: new Set(),
    composer: null,
    sending: false,
    error: null,
    soundOn: true,
    voiceAvailable: true,
    onSelect: noop,
    onAnswer: noop,
    onReply: noop,
    onSend: noop,
    onComposerText: noop,
    onComposerSubmit: noop,
    onComposerCancel: noop,
    onVoice: noop,
    onOpen: noop,
    onKeyboard: noop,
    onToggleSound: noop,
    onOpenFull: noop,
    agentsOpen: true,
    onAgentsOpen: noop,
    onFinishedDone: noop,
    onShowSource: noop,
  },
  decorators: [
    (Story) => (
      <div
        style={{
          position: "relative",
          height: 620,
          background: "linear-gradient(160deg, #3b3f58, #1d2030 70%)",
        }}
      >
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof NotchView>;

export const GangWaiting: Story = {};
export const GangFidgeting: Story = { args: { boredom: 1 } };
export const GangChatting: Story = {
  args: {
    boredom: 2,
    line: {
      speaker: "gemini",
      text: "I was here first. “Send the launch email?”",
    },
  },
};
export const AgentPeeking: Story = {
  args: { state: QUIET_OFFICE, gang: [], peeker: QUIET_OFFICE.agents[1] },
};
export const Quiet: Story = { args: { state: QUIET_OFFICE, gang: [] } };
export const Open: Story = { args: { expanded: true } };
export const OpenReplying: Story = {
  args: {
    expanded: true,
    composer: {
      target: { kind: "answer", requestId: "req-2", to: "Chief of Staff" },
      text: "Use the one we already pay for",
      listening: false,
    },
  },
};
export const OpenListening: Story = {
  args: {
    expanded: true,
    composer: {
      target: {
        kind: "message",
        slug: "codex",
        name: "Codex CLI",
        channel: "codex__human",
      },
      text: "pause the billing refactor until",
      listening: true,
    },
  },
};
/** A finished turn leads with its suggested replies, the recommended first. */
export const OpenFinished: Story = {
  args: { expanded: true, state: FINISHED_OFFICE },
};
/** The reply went to a session that has not taken it yet. */
export const OpenFinishedSent: Story = {
  args: {
    expanded: true,
    state: FINISHED_OFFICE,
    sentTo: new Set(["finished:codex@2026-10-12T09:00:00Z"]),
  },
};
export const OpenQuiet: Story = {
  args: { expanded: true, state: QUIET_OFFICE, gang: [] },
};
/** A bot is set to run on this Mac and the grants are not there yet. */
export const OpenNeedsPermissions: Story = {
  args: {
    expanded: true,
    gang: [],
    state: {
      ...QUIET_OFFICE,
      host_wanted: true,
      permissions: { accessibility: true, screen_recording: false },
      capabilities: {
        voice_realtime: false,
        screen_context: true,
        screen_capture: false,
        pointer: true,
        mac_computer: false,
      },
    },
  },
};
/** The Mac app, open: the notch names the app in front of you. */
export const OpenSeeing: Story = {
  args: {
    expanded: true,
    gang: [],
    state: {
      ...QUIET_OFFICE,
      screen: {
        app: "Finder",
        bundle_id: "com.apple.finder",
        window_title: "Downloads",
      },
      permissions: { accessibility: false, screen_recording: false },
      capabilities: {
        voice_realtime: false,
        screen_context: true,
        screen_capture: false,
        pointer: false,
        mac_computer: false,
      },
    },
  },
};
export const NoNotchMac: Story = { args: { geometry: NO_NOTCH } };
export const Connecting: Story = {
  args: { state: null, expanded: true, gang: [] },
};
