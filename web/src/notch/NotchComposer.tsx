import { type FormEvent, useEffect, useRef } from "react";

import type { ComposerState, PanelProps } from "./NotchPanel";

/**
 * The reply box: one line, a microphone to hold, Send. The same box
 * answers a card on the Home screen and writes into a bot's thread
 * (NotchThread.tsx); it is remounted per target so it focuses once.
 */
export function Composer({
  composer,
  sending,
  voiceAvailable,
  onText,
  onSubmit,
  onCancel,
  onVoice,
  onKeyboard,
}: {
  composer: ComposerState;
  sending: boolean;
  voiceAvailable: boolean;
  onText: PanelProps["onComposerText"];
  onSubmit: PanelProps["onComposerSubmit"];
  onCancel: PanelProps["onComposerCancel"];
  onVoice: PanelProps["onVoice"];
  onKeyboard: PanelProps["onKeyboard"];
}) {
  const input = useRef<HTMLInputElement>(null);
  // Esc is handled once, by the window key handler (hooks.ts): it cancels
  // this reply first and only closes the notch when nothing is being typed.
  // Remounted per target (see the key on <Composer>), so this runs once per reply.
  useEffect(() => {
    input.current?.focus();
  }, []);
  const to =
    composer.target.kind === "answer"
      ? composer.target.to
      : composer.target.name;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (composer.text.trim() && !sending) onSubmit();
  };
  return (
    <form
      className={`ncompose${composer.listening ? " is-listening" : ""}`}
      onSubmit={submit}
    >
      <div className="ncompose-to">
        {composer.target.kind === "answer" ? "Answering" : "Message"}{" "}
        <b>{to}</b>
        <button
          type="button"
          className="ncompose-x"
          aria-label="Cancel reply"
          onClick={onCancel}
        >
          Esc
        </button>
      </div>
      <div className="ncompose-row">
        <input
          ref={input}
          aria-label={`Reply to ${to}`}
          placeholder={
            composer.listening
              ? "Listening…"
              : `Type, or hold ⌥V to talk to ${to}`
          }
          value={composer.text}
          onChange={(e) => onText(e.target.value)}
          onFocus={() => onKeyboard(true)}
          onBlur={() => onKeyboard(false)}
        />
        {voiceAvailable ? (
          <button
            type="button"
            className={`nmic${composer.listening ? " is-on" : ""}`}
            aria-label={composer.listening ? "Stop listening" : "Talk"}
            aria-pressed={composer.listening}
            onPointerDown={() => onVoice(true)}
            onPointerUp={() => onVoice(false)}
            onPointerLeave={() => composer.listening && onVoice(false)}
          >
            <span className="nmic-wave" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
          </button>
        ) : null}
        <button
          type="submit"
          className="nbtn is-primary"
          disabled={sending || !composer.text.trim()}
        >
          {sending ? "Sending" : "Send"} <kbd>↵</kbd>
        </button>
      </div>
    </form>
  );
}
