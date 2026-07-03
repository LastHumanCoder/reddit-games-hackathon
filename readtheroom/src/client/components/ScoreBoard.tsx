import { useEffect, useState } from 'react';
import type { LeaderboardRow, PlayerStats } from '../../shared/api';

type ScoreBoardProps = {
  stats: PlayerStats | null;
  leaderboard: LeaderboardRow[];
  /** Delay (ms) before the panels fade in, so the reveal lands first. */
  enterDelayMs?: number;
};

/** Personal stats strip + daily top-10, shown after the reveal. */
export const ScoreBoard = ({
  stats,
  leaderboard,
  enterDelayMs = 2100,
}: ScoreBoardProps) => {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShown(true), enterDelayMs);
    return () => clearTimeout(t);
  }, [enterDelayMs]);

  return (
    <>
      {stats ? (
        <section className={`rtr-fade-in ${shown ? 'is-in' : ''}`}>
          <div className="rtr-stats">
            <div className="rtr-stat">
              <div className="rtr-stat-num">
                {stats.streak}
                {stats.streak >= 3 ? '🔥' : ''}
              </div>
              <div className="rtr-stat-label">Day streak</div>
            </div>
            <div className="rtr-stat">
              <div className="rtr-stat-num">{stats.gamesPlayed}</div>
              <div className="rtr-stat-label">Rooms read</div>
            </div>
            <div className="rtr-stat">
              <div className="rtr-stat-num">{stats.avgScore}</div>
              <div className="rtr-stat-label">Avg accuracy</div>
            </div>
          </div>
        </section>
      ) : null}

      <section
        className={`rtr-card rtr-card--flat rtr-fade-in ${shown ? 'is-in' : ''}`}
      >
        <span className="rtr-kicker rtr-kicker--ink">
          Today’s Sharpest Readers
        </span>
        {leaderboard.length === 0 ? (
          <p className="rtr-hint">
            Nobody on the board yet. The room is quiet…
          </p>
        ) : (
          <ol>
            {leaderboard.map((row, i) => (
              <li
                key={`${row.username}-${i}`}
                className={`rtr-lb-row ${row.isYou ? 'rtr-lb-row--you' : ''}`}
              >
                <span className="rtr-lb-rank">{i + 1}.</span>
                <span className="rtr-lb-name">
                  u/{row.username}
                  {row.isYou ? ' (you)' : ''}
                </span>
                <span className="rtr-lb-score">{row.score}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
};
