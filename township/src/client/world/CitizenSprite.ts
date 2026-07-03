import * as Phaser from 'phaser';
import type { Citizen } from '../../shared/types';
import { TRADE_INFO } from '../../shared/types';
import { TRADE_WORKPLACE_DOOR, WANDER_POINTS, hashString, mulberry32 } from './layout';
import { generateDollTexture } from './textures';

const WALK_SPEED = 42; // px/s
const LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'Georgia, serif',
  fontSize: '17px',
  color: '#3e3428',
  stroke: '#f7efdf',
  strokeThickness: 4,
};

/**
 * A townsperson: snoovatar (players) or paper doll (NPCs / no snoovatar),
 * with a name label, drop shadow, walk-bob, and waypoint wandering.
 */
export class CitizenSprite extends Phaser.GameObjects.Container {
  readonly citizen: Citizen;
  private readonly rng: () => number;
  private readonly avatar: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Image;
  private target: { x: number; y: number } | null = null;
  private pauseUntil = 0;
  private walkT = 0;

  constructor(scene: Phaser.Scene, citizen: Citizen, textureKey: string) {
    // Spawn near a deterministic wander point so layouts feel stable.
    const rng = mulberry32(hashString(citizen.id));
    const spawn = CitizenSprite.pickPoint(citizen, rng);
    super(scene, spawn.x + (rng() - 0.5) * 60, spawn.y + (rng() - 0.5) * 30);

    this.citizen = citizen;
    this.rng = rng;

    this.shadow = scene.add.image(0, 0, 'citizen-shadow').setOrigin(0.5, 0.5);
    this.avatar = scene.add.image(0, 0, textureKey);
    const targetH = citizen.isNpc ? 68 : 76;
    this.avatar.setScale(targetH / this.avatar.height);
    this.avatar.setOrigin(0.5, 1);

    const label = scene.add
      .text(0, -targetH - 6, citizen.username, LABEL_STYLE)
      .setOrigin(0.5, 1);

    this.add([this.shadow, this.avatar, label]);
    this.setSize(44, targetH);
    scene.add.existing(this);

    this.pauseUntil = scene.time.now + rng() * 3000;
  }

  private static pickPoint(citizen: Citizen, rng: () => number): { x: number; y: number } {
    const roll = rng();
    if (roll < 0.4) return TRADE_WORKPLACE_DOOR[citizen.trade];
    const pt = WANDER_POINTS[Math.floor(rng() * WANDER_POINTS.length)];
    return pt ?? TRADE_WORKPLACE_DOOR[citizen.trade];
  }

  /** Advance wandering + walk bob. Call from the scene's update(). */
  tick(time: number, deltaMs: number): void {
    if (!this.target) {
      if (time >= this.pauseUntil) {
        const pt = CitizenSprite.pickPoint(this.citizen, this.rng);
        this.target = {
          x: pt.x + (this.rng() - 0.5) * 70,
          y: pt.y + (this.rng() - 0.5) * 36,
        };
      } else {
        this.avatar.y = 0;
        this.avatar.rotation = 0;
        return;
      }
    }

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const step = (WALK_SPEED * deltaMs) / 1000;

    if (dist <= step) {
      this.setPosition(this.target.x, this.target.y);
      this.target = null;
      this.pauseUntil = time + 1800 + this.rng() * 4200;
      return;
    }

    this.setPosition(this.x + (dx / dist) * step, this.y + (dy / dist) * step);
    if (Math.abs(dx) > 2) this.avatar.setFlipX(dx < 0);

    // Walk bob: bounce + slight sway
    this.walkT += deltaMs / 1000;
    this.avatar.y = -Math.abs(Math.sin(this.walkT * 9)) * 4;
    this.avatar.rotation = Math.sin(this.walkT * 9) * 0.045;
    this.shadow.setScale(1 - Math.abs(Math.sin(this.walkT * 9)) * 0.12);

    // Depth-sort by feet position so citizens overlap buildings correctly.
    this.setDepth(this.y);
  }
}

/** Resolve (and if needed generate) the texture for a citizen, then build the sprite. */
export const createCitizenSprite = (
  scene: Phaser.Scene,
  citizen: Citizen,
  onReady: (sprite: CitizenSprite) => void
): void => {
  const dollKey = `doll-${citizen.trade}-${hashString(citizen.id) % 8}`;
  const makeDoll = () => {
    const tunic = Phaser.Display.Color.HexStringToColor(TRADE_INFO[citizen.trade].color).color;
    generateDollTexture(scene, dollKey, tunic, hashString(citizen.id));
    onReady(new CitizenSprite(scene, citizen, dollKey));
  };

  if (!citizen.snoovatarUrl) {
    makeDoll();
    return;
  }

  const snooKey = `snoo-${citizen.id}`;
  if (scene.textures.exists(snooKey)) {
    onReady(new CitizenSprite(scene, citizen, snooKey));
    return;
  }

  // Phaser has per-key complete events but only a global error event.
  const onError = (file: Phaser.Loader.File) => {
    if (file.key !== snooKey) return;
    scene.load.off('loaderror', onError);
    makeDoll();
  };
  scene.load.image(snooKey, citizen.snoovatarUrl);
  scene.load.once(`filecomplete-image-${snooKey}`, () => {
    scene.load.off('loaderror', onError);
    onReady(new CitizenSprite(scene, citizen, snooKey));
  });
  scene.load.on('loaderror', onError);
  scene.load.start();
};
