import { hotkeyCaps, type LessonStep } from "./lesson";
import type { NotchGeometry, NotchHotkey } from "./types";

// What the first-run lesson draws (lesson.ts has the steps).

function Caps({ hotkey }: { hotkey: NotchHotkey | undefined }) {
  return (
    <span className="nlesson-caps">
      {hotkeyCaps(hotkey).map((cap) => (
        <kbd key={cap}>{cap}</kbd>
      ))}
    </span>
  );
}

/** Under the closed notch: the keys that open it. */
export function LessonBubble({
  geometry,
  hotkey,
}: {
  geometry: NotchGeometry;
  hotkey: NotchHotkey | undefined;
}) {
  const caps = hotkeyCaps(hotkey);
  return (
    <div
      className="notch-stage nlesson-bubble"
      data-testid="notch-lesson-bubble"
      style={{ top: geometry.notchHeight + geometry.band + 8 }}
      aria-live="polite"
    >
      <div className="notch-bubble">
        {caps.length > 0 ? (
          <>
            Press <Caps hotkey={hotkey} /> to open me from anywhere
          </>
        ) : (
          "Point at the notch to open me"
        )}
      </div>
    </div>
  );
}

const PRACTICE = [
  { label: "Ship it", detail: "The recommended reply is always on top." },
  { label: "Not yet", detail: "The others follow, best first." },
];

/**
 * In the open notch: a practice card that works exactly like a real one,
 * except that choosing a reply only moves the lesson on.
 */
export function LessonCard({
  step,
  hotkey,
  onPracticed,
  onSkip,
}: {
  step: LessonStep;
  hotkey: NotchHotkey | undefined;
  onPracticed: () => void;
  onSkip: () => void;
}) {
  if (step !== "choose" && step !== "close") return null;
  return (
    <article
      className="nq nlesson is-lesson"
      aria-label="How to use the notch"
      data-testid="notch-lesson"
    >
      <div className="nq-body">
        <div className="nq-from">
          <b>Quick tour</b>
          <span className="ntag">
            {step === "choose" ? "1 of 2" : "2 of 2"}
          </span>
        </div>
        {step === "choose" ? (
          <>
            <p className="nq-text">
              Every card offers replies. Press <kbd>↓</kbd> to move to one, then{" "}
              <kbd>↵</kbd> to send it. <kbd>J</kbd> <kbd>K</kbd> jump between
              cards. Try it here; this one sends nothing.
            </p>
            <ul className="nchoices" aria-label="Practice replies">
              {PRACTICE.map((p, i) => (
                <li key={p.label}>
                  <button
                    type="button"
                    className={`nchoice${i === 0 ? " is-recommended" : ""}`}
                    onClick={onPracticed}
                  >
                    <span className="nchoice-text">
                      <span className="nchoice-label">
                        {p.label}
                        {i === 0 ? (
                          <span className="nchoice-rec">Recommended</span>
                        ) : null}
                      </span>
                      <span className="nchoice-detail">{p.detail}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="nq-text" role="status">
            That is all there is to it. Press{" "}
            {hotkeyCaps(hotkey).length > 0 ? (
              <>
                <Caps hotkey={hotkey} /> or{" "}
              </>
            ) : null}
            <kbd>Esc</kbd> to close, and the same keys open it again from any
            app.
          </p>
        )}
        <div className="nq-actions">
          <button type="button" className="nbtn is-quiet" onClick={onSkip}>
            {step === "choose" ? "Skip the tour" : "Got it"}
          </button>
        </div>
      </div>
    </article>
  );
}
