import { requestExpandedMode } from '@devvit/web/client';

const startButton = document.getElementById('start-button');

startButton?.addEventListener('click', (e) => {
  requestExpandedMode(e, 'game');
});
