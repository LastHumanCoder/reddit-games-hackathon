import * as Phaser from 'phaser';
import { AUTO, Game } from 'phaser';
import { BridgeScene } from './scenes/BridgeScene';

const config: Phaser.Types.Core.GameConfig = {
  type: AUTO,
  parent: 'game-container',
  backgroundColor: '#ffb26b',
  width: 800,
  height: 600,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 1 },
      debug: false,
    },
  },
  scene: [BridgeScene],
};

document.addEventListener('DOMContentLoaded', () => {
  const game = new Game(config);
  (window as unknown as { __game: Game }).__game = game;
});
