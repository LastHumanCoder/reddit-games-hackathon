import { requestExpandedMode } from '@devvit/web/client';
import type { InitResponse } from '../shared/api';

const startButton = document.getElementById('start-button');
const description = document.querySelector('.description');

startButton?.addEventListener('click', (e) => {
  requestExpandedMode(e, 'game');
});

// If the player already called today's bridge, make that clear on the splash.
void (async () => {
  try {
    const res = await fetch('/api/init');
    const data = (await res.json()) as InitResponse;
    if (data.type === 'init' && data.alreadyPlayed && data.yourGuess) {
      if (startButton) startButton.textContent = 'Watch today’s verdict';
      if (description) {
        description.textContent = `You called ${data.yourGuess.toUpperCase()}. See how it ended.`;
      }
    }
  } catch {
    // Splash works fine without it.
  }
})();
