import * as Phaser from 'phaser';
import { generateWorldTextures } from '../world/textures';

/** All art is generated procedurally — nothing to download, instant boot. */
export class Preloader extends Phaser.Scene {
  constructor() {
    super('Preloader');
  }

  create() {
    generateWorldTextures(this);
    this.scene.start('Town');
  }
}
