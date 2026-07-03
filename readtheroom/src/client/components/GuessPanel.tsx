import { useState } from 'react';
import type { PromptData } from '../../shared/api';

type GuessPanelProps = {
  prompt: PromptData;
  loggedIn: boolean;
  locking: boolean;
  error: string | null;
  onLockIn: (value: number) => void;
};

/** Position of the value bubble, compensating for the 30px thumb width. */
const bubbleLeft = (value: number): string =>
  `calc(${value}% + ${(50 - value) * 0.3}px)`;

export const GuessPanel = ({
  prompt,
  loggedIn,
  locking,
  error,
  onLockIn,
}: GuessPanelProps) => {
  const [value, setValue] = useState(50);

  return (
    <section className="rtr-card">
      <span className="rtr-kicker">Today’s Room</span>
      <h2 className="rtr-question">{prompt.question}</h2>
      {prompt.author ? (
        <p className="rtr-byline">
          filed by u/{prompt.author}, community correspondent
        </p>
      ) : null}
      <p className="rtr-hint">
        Don’t answer for yourself — predict where the{' '}
        <strong>crowd average</strong> will land.
      </p>

      <div className="rtr-poles" aria-hidden="true">
        <span>← {prompt.left}</span>
        <span>{prompt.right} →</span>
      </div>

      <div className="rtr-slider-wrap">
        <div className="rtr-bubble" style={{ left: bubbleLeft(value) }}>
          {value}
        </div>
        <input
          className="rtr-range"
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          aria-label={`Your read of the crowd, 0 means ${prompt.left}, 100 means ${prompt.right}`}
          onChange={(e) => setValue(Number(e.currentTarget.value))}
        />
      </div>
      <div className="rtr-scale" aria-hidden="true">
        <span>0</span>
        <span>25</span>
        <span>50</span>
        <span>75</span>
        <span>100</span>
      </div>

      <button
        className="rtr-btn"
        disabled={locking}
        onClick={() => onLockIn(value)}
      >
        {locking
          ? 'Reading the room…'
          : loggedIn
            ? `Lock in ${value}`
            : 'Log in to guess'}
      </button>
      {error ? (
        <p className="rtr-form-note rtr-form-note--err">{error}</p>
      ) : null}
      {!loggedIn ? (
        <p className="rtr-form-note">
          Anyone can peek at the question — you need a Reddit account to play.
        </p>
      ) : null}
    </section>
  );
};
