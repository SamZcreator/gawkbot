import { useCallback, useMemo } from "react";

import { type BotRuntime, BotRuntimeContext } from "../lib/botRuntime";
import { EXPANDED_HEIGHT, EXPANDED_WIDTH } from "./bridge";
import { NotchPanel, type PanelProps } from "./NotchPanel";
import { NotchSettings } from "./NotchSettings";
import {
  NotchStage,
  NotchStrip,
  type StripProps,
  stageHeight,
} from "./NotchStrip";
import { NotchThread } from "./NotchThread";
import { isAgentScreen, type NotchScreen } from "./screens";
import type { NotchGeometry } from "./types";

// Presentational notch: the strip (always) and the panel (when open), inside
// one black shell that grows out of the camera housing. NotchApp owns the
// data, timers, sounds and the native bridge.

export { EXPANDED_HEIGHT, EXPANDED_WIDTH } from "./bridge";

export type NotchViewProps = Omit<StripProps, "expanded"> &
  Omit<PanelProps, "state"> & {
    geometry: NotchGeometry;
    expanded: boolean;
    /** Home, or one bot's thread (screens.ts). Home when absent. */
    screen?: NotchScreen;
    onBack?: () => void;
    onStop?: (slug: string) => void;
    /** The talk key is down (NotchApp): threads keep quiet meanwhile. */
    talking?: boolean;
  };

export function collapsedWidth(g: NotchGeometry): number {
  return g.notchWidth + 2 * g.earWidth;
}

/** From this width the open notch shows Home and a thread side by side. */
export const SPLIT_MIN_WIDTH = 980;
/** Home's column in the split; the thread takes the rest. */
export const SPLIT_HOME_WIDTH = 440;

export function isSplit(
  width: number,
  screen: NotchScreen | undefined,
): boolean {
  return width >= SPLIT_MIN_WIDTH && !!screen && isAgentScreen(screen);
}

export function NotchView(props: NotchViewProps) {
  const { geometry, expanded, state } = props;
  // Every notch avatar looks its runtime up by slug, so the strip, the
  // panel rows and the question cards all carry the same badge.
  const runtimes = useMemo(() => {
    const map = new Map<string, BotRuntime>();
    for (const agent of state?.agents ?? []) {
      if (agent.runtime?.harness) map.set(agent.slug, agent.runtime);
    }
    return map;
  }, [state?.agents]);
  const runtimeOf = useCallback(
    (slug: string) => runtimes.get(slug),
    [runtimes],
  );
  const openHeight = geometry.expandedHeight ?? EXPANDED_HEIGHT;
  const width = expanded
    ? Math.max(
        geometry.expandedWidth ?? EXPANDED_WIDTH,
        collapsedWidth(geometry),
      )
    : collapsedWidth(geometry);
  const stage = stageHeight({
    line: props.line,
    peeker: props.peeker,
    arrival: props.arrival,
    expanded,
  });
  return (
    <BotRuntimeContext.Provider value={runtimeOf}>
      <div
        className={`notch-root${geometry.nativeGlass ? " has-native-glass" : ""}`}
        style={{
          ["--notch-strip-h" as string]: `${geometry.notchHeight + geometry.band}px`,
          height: expanded
            ? openHeight
            : geometry.notchHeight + geometry.band + stage,
        }}
      >
        <NotchStage
          state={state}
          geometry={geometry}
          gang={props.gang}
          boredom={props.boredom}
          line={props.line}
          peeker={props.peeker}
          arrival={props.arrival}
          expanded={expanded}
        />
        <div
          className={`notch-shell ${expanded ? "is-expanded" : "is-collapsed"}`}
          style={{
            width,
            height: expanded
              ? openHeight
              : geometry.notchHeight + geometry.band,
          }}
          data-testid="notch-shell"
          data-mood={state?.mood ?? "idle"}
        >
          <NotchStrip
            state={state}
            geometry={geometry}
            gang={props.gang}
            boredom={props.boredom}
            line={props.line}
            peeker={props.peeker}
            arrival={props.arrival}
            expanded={expanded}
          />
          {expanded && state && props.screen?.kind === "settings" ? (
            <NotchSettings
              state={state}
              onBack={props.onBack ?? (() => undefined)}
              onOpen={props.onOpen}
            />
          ) : expanded &&
            state &&
            props.screen &&
            isAgentScreen(props.screen) ? (
            isSplit(width, props.screen) ? (
              <div className="nsplit" data-testid="notch-split">
                <div
                  className="nsplit-home"
                  style={{ width: SPLIT_HOME_WIDTH }}
                >
                  <NotchPanel
                    {...props}
                    state={state}
                    hotkey={geometry.hotkey}
                    composer={null}
                    compact={true}
                  />
                </div>
                <div className="nsplit-thread">
                  <NotchThread
                    state={state}
                    screen={props.screen}
                    composer={props.composer}
                    sending={props.sending}
                    voiceAvailable={props.voiceAvailable}
                    onComposerText={props.onComposerText}
                    onComposerSubmit={props.onComposerSubmit}
                    onComposerCancel={props.onComposerCancel}
                    onVoice={props.onVoice}
                    onKeyboard={props.onKeyboard}
                    onBack={props.onBack ?? (() => undefined)}
                    onOpen={props.onOpen}
                    onStop={props.onStop ?? (() => undefined)}
                    talking={props.talking}
                  />
                </div>
              </div>
            ) : (
              <NotchThread
                state={state}
                screen={props.screen}
                composer={props.composer}
                sending={props.sending}
                voiceAvailable={props.voiceAvailable}
                onComposerText={props.onComposerText}
                onComposerSubmit={props.onComposerSubmit}
                onComposerCancel={props.onComposerCancel}
                onVoice={props.onVoice}
                onKeyboard={props.onKeyboard}
                onBack={props.onBack ?? (() => undefined)}
                onOpen={props.onOpen}
                onStop={props.onStop ?? (() => undefined)}
                talking={props.talking}
              />
            )
          ) : expanded ? (
            <NotchPanel {...props} state={state} hotkey={geometry.hotkey} />
          ) : null}
        </div>
      </div>
    </BotRuntimeContext.Provider>
  );
}
