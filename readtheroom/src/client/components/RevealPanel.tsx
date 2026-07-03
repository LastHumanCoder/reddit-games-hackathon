import { useEffect, useState } from 'react';
import { BIN_COUNT, type PromptData, type RevealData } from '../../shared/api';
import { useCountUp } from '../hooks/useCountUp';

type RevealPanelProps = {
  prompt: PromptData;
  reveal: RevealData;
};

const verdictFor = (score: number): string => {
  if (score >= 95) return 'Dead-on. You ARE the room.';
  if (score >= 85) return 'A very sharp read.';
  if (score >= 70) return 'Warm. You’ve met Reddit before.';
  if (score >= 50) return 'The room drifted away from you.';
  return 'The room disagrees. Loudly.';
};

/** Keep marker labels from clipping at the chart edges. */
const clampPct = (v: number): number => Math.max(5, Math.min(95, v));

export const RevealPanel = ({ prompt, reveal }: RevealPanelProps) => {
  // 0: mounted, 1: bars grow, 2: markers land, 3: score counts up
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStage(1), 150),
      setTimeout(() => setStage(2), 1150),
      setTimeout(() => setStage(3), 1650),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const score = useCountUp(reveal.score, stage >= 3);
  const maxCount = Math.max(1, ...reveal.bins);
  const guessBin = Math.min(
    BIN_COUNT - 1,
    Math.floor(reveal.guess / (100 / BIN_COUNT))
  );

  return (
    <section className="rtr-card">
      <span className="rtr-kicker rtr-kicker--ink">The Room Has Spoken</span>
      <h2 className="rtr-question">{prompt.question}</h2>
      {prompt.author ? (
        <p className="rtr-byline">
          filed by u/{prompt.author}, community correspondent
        </p>
      ) : null}
      <div className="rtr-poles" aria-hidden="true">
        <span>← {prompt.left}</span>
        <span>{prompt.right} →</span>
      </div>

      <div className="rtr-chart">
        <div className="rtr-chart-frame">
          <div className="rtr-bars" aria-hidden="true">
            {reveal.bins.map((count, i) => (
              <div
                key={i}
                className={[
                  'rtr-bar',
                  stage >= 1 ? 'is-in' : '',
                  count === 0 ? 'rtr-bar--empty' : '',
                  i === guessBin ? 'rtr-bar--you' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{
                  height: `${count === 0 ? 2 : Math.max(6, (count / maxCount) * 100)}%`,
                  transitionDelay: `${i * 45}ms`,
                }}
              />
            ))}
          </div>
          <div
            className={`rtr-marker ${stage >= 2 ? 'is-in' : ''}`}
            style={{ left: `${clampPct(reveal.mean)}%` }}
          >
            <span className="rtr-flag">THE ROOM · {reveal.mean}</span>
          </div>
          <div
            className={`rtr-guess-tick ${stage >= 2 ? 'is-in' : ''}`}
            style={{ left: `${clampPct(reveal.guess)}%` }}
          >
            YOU · {reveal.guess}
          </div>
        </div>
        <div className="rtr-chart-footer" />
      </div>

      <p className="rtr-byline" aria-live="polite">
        {reveal.total} {reveal.total === 1 ? 'reader has' : 'readers have'}{' '}
        weighed in — crowd average {reveal.mean}.
      </p>

      <div className={`rtr-scoreline ${stage >= 3 ? 'is-in' : ''}`}>
        <div className="rtr-score-num">{score}</div>
        <div>
          <div className="rtr-score-label">Accuracy / 100</div>
          <div className="rtr-verdict">{verdictFor(reveal.score)}</div>
        </div>
      </div>
    </section>
  );
};
