import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Countdown } from './components/Countdown';
import { GuessPanel } from './components/GuessPanel';
import { Masthead } from './components/Masthead';
import { RevealPanel } from './components/RevealPanel';
import { ScoreBoard } from './components/ScoreBoard';
import { SubmitPrompt } from './components/SubmitPrompt';
import { useGame } from './hooks/useGame';

export const App = () => {
  const game = useGame();

  if (game.phase === 'loading') {
    return (
      <div className="rtr-loading">
        <div className="rtr-spinner" />
        <p>Opening today’s edition…</p>
      </div>
    );
  }

  if (game.phase === 'error' || !game.prompt) {
    return (
      <div className="rtr-error">
        <p>{game.error ?? 'The presses jammed. Try reopening the post.'}</p>
      </div>
    );
  }

  return (
    <div className="rtr-app">
      <div className="rtr-col">
        <Masthead day={game.prompt.day} date={game.prompt.date} />

        {game.phase === 'guess' ? (
          <GuessPanel
            prompt={game.prompt}
            loggedIn={game.loggedIn}
            locking={game.locking}
            error={game.error}
            onLockIn={(value) => void game.lockIn(value)}
          />
        ) : game.reveal ? (
          <>
            <RevealPanel prompt={game.prompt} reveal={game.reveal} />
            <ScoreBoard stats={game.stats} leaderboard={game.leaderboard} />
            <SubmitPrompt onSubmit={game.submitPrompt} />
            <Countdown />
          </>
        ) : null}
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
