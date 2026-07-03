import './index.css';

import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { SplashResponse } from '../shared/api';

type Teaser = {
  question: string;
  left: string;
  right: string;
  day: number | null;
  players: number;
};

/**
 * Inline in-feed entry: paints instantly, then fills in today's question and
 * hands off to the 'game' entrypoint in expanded mode.
 */
export const Splash = () => {
  const [teaser, setTeaser] = useState<Teaser>({
    question: '',
    left: '',
    right: '',
    day: null,
    players: 0,
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/splash');
        if (!res.ok) return;
        const data: SplashResponse = await res.json();
        if (cancelled) return;
        setTeaser({
          question: data.question,
          left: data.left,
          right: data.right,
          day: data.day,
          players: data.players,
        });
      } catch (err) {
        console.error('splash teaser failed', err);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="rtr-splash">
      <div className="rtr-eyebrow">
        The Daily Consensus{teaser.day !== null ? ` · No. ${teaser.day}` : ''}
      </div>
      <h1 className="rtr-splash-title">
        Read the <em>Room</em>
      </h1>
      <p className="rtr-splash-question">
        {teaser.question || 'Today’s question is hot off the press…'}
      </p>
      {teaser.question ? (
        <p className="rtr-splash-poles">
          {teaser.left} <em>↔</em> {teaser.right}
        </p>
      ) : null}
      <button
        className="rtr-btn rtr-splash-btn"
        onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
      >
        Can you read the room?
      </button>
      <p className="rtr-splash-players">
        {teaser.players > 0
          ? `${teaser.players} ${teaser.players === 1 ? 'reader has' : 'readers have'} guessed today`
          : 'One question. One guess. Every day.'}
      </p>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
