import * as Phaser from 'phaser';
import { PALETTE, mulberry32 } from './layout';

/**
 * All art is generated at boot with Phaser Graphics: flat "paper cutout"
 * shapes, warm palette, thick outlines, deterministic hand-drawn wobble.
 * No external assets → no CSP issues, instant load, distinct identity.
 */

type G = Phaser.GameObjects.Graphics;

const OUTLINE_W = 5;

/** A quad with small deterministic jitter so edges feel hand-cut. */
const wobbleQuad = (
  g: G,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number,
  rng: () => number,
  outline = true
): void => {
  const j = () => (rng() - 0.5) * Math.min(w, h) * 0.06;
  const pts = [
    new Phaser.Math.Vector2(x + j(), y + j()),
    new Phaser.Math.Vector2(x + w + j(), y + j()),
    new Phaser.Math.Vector2(x + w + j(), y + h + j()),
    new Phaser.Math.Vector2(x + j(), y + h + j()),
  ];
  g.fillStyle(fill, 1);
  g.fillPoints(pts, true);
  if (outline) {
    g.lineStyle(OUTLINE_W, PALETTE.outline, 1);
    g.strokePoints(pts, true);
  }
};

const wobbleTri = (
  g: G,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  fill: number,
  rng: () => number
): void => {
  const j = () => (rng() - 0.5) * 6;
  const pts = [
    new Phaser.Math.Vector2(x1 + j(), y1 + j()),
    new Phaser.Math.Vector2(x2 + j(), y2 + j()),
    new Phaser.Math.Vector2(x3 + j(), y3 + j()),
  ];
  g.fillStyle(fill, 1);
  g.fillPoints(pts, true);
  g.lineStyle(OUTLINE_W, PALETTE.outline, 1);
  g.strokePoints(pts, true);
};

const drawWindow = (g: G, x: number, y: number, w = 26, h = 30): void => {
  g.fillStyle(PALETTE.window, 1);
  g.fillRoundedRect(x, y, w, h, 5);
  g.lineStyle(4, PALETTE.outline, 1);
  g.strokeRoundedRect(x, y, w, h, 5);
};

const drawDoor = (g: G, x: number, y: number, w = 34, h = 46): void => {
  g.fillStyle(0x6f5138, 1);
  g.fillRoundedRect(x, y, w, h, { tl: 14, tr: 14, bl: 0, br: 0 });
  g.lineStyle(4, PALETTE.outline, 1);
  g.strokeRoundedRect(x, y, w, h, { tl: 14, tr: 14, bl: 0, br: 0 });
};

/** Standard house: wall + overhanging roof + door + windows + chimney. */
const makeHouse = (
  scene: Phaser.Scene,
  key: string,
  opts: {
    w: number;
    h: number;
    roofH: number;
    wall: number;
    roof: number;
    chimney?: boolean;
    seed: number;
  }
): void => {
  const { w, h, roofH, wall, roof, chimney, seed } = opts;
  const rng = mulberry32(seed);
  const pad = 16;
  const g = scene.add.graphics();
  const texW = w + pad * 2;
  const texH = h + roofH + pad * 2;

  // Wall
  wobbleQuad(g, pad, pad + roofH, w, h, wall, rng);
  // Roof (overhangs the wall)
  wobbleTri(g, pad - 10, pad + roofH, pad + w + 10, pad + roofH, pad + w / 2, pad - 6, roof, rng);
  // Chimney
  if (chimney) {
    wobbleQuad(g, pad + w * 0.68, pad + roofH * 0.1, 22, roofH * 0.55, PALETTE.stone, rng);
  }
  // Door centered at bottom, windows either side
  drawDoor(g, pad + w / 2 - 17, pad + roofH + h - 46);
  drawWindow(g, pad + w * 0.16, pad + roofH + h * 0.32);
  drawWindow(g, pad + w * 0.84 - 26, pad + roofH + h * 0.32);

  g.generateTexture(key, texW, texH);
  g.destroy();
};

export const generateWorldTextures = (scene: Phaser.Scene): void => {
  makeHouse(scene, 'bakery', {
    w: 200,
    h: 150,
    roofH: 80,
    wall: PALETTE.wall,
    roof: PALETTE.roofBakery,
    chimney: true,
    seed: 11,
  });
  makeHouse(scene, 'sawmill', {
    w: 220,
    h: 140,
    roofH: 70,
    wall: PALETTE.wallAlt,
    roof: PALETTE.roofSawmill,
    seed: 22,
  });
  makeHouse(scene, 'tavern', {
    w: 230,
    h: 170,
    roofH: 90,
    wall: PALETTE.wall,
    roof: PALETTE.roofTavern,
    chimney: true,
    seed: 33,
  });
  makeHouse(scene, 'farm', {
    w: 240,
    h: 150,
    roofH: 85,
    wall: PALETTE.roofFarm,
    roof: PALETTE.roofCottage,
    seed: 44,
  });

  // Well: stone ring + posts + tiny roof
  {
    const rng = mulberry32(55);
    const g = scene.add.graphics();
    g.fillStyle(PALETTE.stone, 1);
    g.fillEllipse(60, 78, 90, 44);
    g.lineStyle(OUTLINE_W, PALETTE.outline, 1);
    g.strokeEllipse(60, 78, 90, 44);
    g.fillStyle(PALETTE.water, 1);
    g.fillEllipse(60, 74, 62, 26);
    g.lineStyle(3, PALETTE.outline, 1);
    g.strokeEllipse(60, 74, 62, 26);
    // posts
    g.fillStyle(PALETTE.treeTrunk, 1);
    g.fillRect(22, 20, 8, 52);
    g.fillRect(90, 20, 8, 52);
    wobbleTri(g, 8, 24, 112, 24, 60, -2, PALETTE.roofBakery, rng);
    g.generateTexture('well', 120, 100);
    g.destroy();
  }

  // Plaza: flat cobbled ellipse
  {
    const g = scene.add.graphics();
    g.fillStyle(PALETTE.path, 1);
    g.fillEllipse(170, 90, 340, 180);
    g.lineStyle(4, PALETTE.pathEdge, 1);
    g.strokeEllipse(170, 90, 340, 180);
    const rng = mulberry32(66);
    g.fillStyle(PALETTE.pathEdge, 0.55);
    for (let i = 0; i < 26; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng());
      g.fillEllipse(170 + Math.cos(a) * r * 150, 90 + Math.sin(a) * r * 75, 16, 9);
    }
    g.generateTexture('plaza', 340, 180);
    g.destroy();
  }

  // Tree: trunk + layered canopy blobs
  {
    const g = scene.add.graphics();
    g.fillStyle(PALETTE.treeTrunk, 1);
    g.fillRoundedRect(52, 88, 16, 42, 6);
    g.lineStyle(4, PALETTE.outline, 1);
    g.strokeRoundedRect(52, 88, 16, 42, 6);
    g.fillStyle(PALETTE.treeCanopyDark, 1);
    g.fillCircle(60, 62, 40);
    g.fillStyle(PALETTE.treeCanopy, 1);
    g.fillCircle(42, 52, 30);
    g.fillCircle(78, 50, 28);
    g.fillCircle(60, 36, 30);
    g.lineStyle(OUTLINE_W, PALETTE.outline, 1);
    g.strokeCircle(60, 62, 40);
    g.generateTexture('tree', 120, 134);
    g.destroy();
  }

  // Soft cloud (drifts across the sky)
  {
    const g = scene.add.graphics();
    g.fillStyle(0xffffff, 0.9);
    g.fillEllipse(60, 40, 110, 44);
    g.fillEllipse(110, 34, 90, 40);
    g.fillEllipse(85, 24, 70, 36);
    g.generateTexture('cloud', 170, 64);
    g.destroy();
  }

  // Chimney smoke puff
  {
    const g = scene.add.graphics();
    g.fillStyle(0xffffff, 0.8);
    g.fillCircle(12, 12, 12);
    g.generateTexture('puff', 24, 24);
    g.destroy();
  }

  // Citizen drop shadow
  {
    const g = scene.add.graphics();
    g.fillStyle(PALETTE.shadow, 0.18);
    g.fillEllipse(30, 10, 60, 20);
    g.generateTexture('citizen-shadow', 60, 20);
    g.destroy();
  }
};

const SKIN_TONES = [0xf0c8a0, 0xd9a077, 0xc68642, 0x8d5524];
const HAIR_TONES = [0x4a3225, 0x2c2c2c, 0x9c6b30, 0xb5b5b5, 0xd97757];

/**
 * Paper-doll citizen sprites for NPCs / players without a snoovatar.
 * One texture per (tunic color, variant). ~44x72.
 */
export const generateDollTexture = (
  scene: Phaser.Scene,
  key: string,
  tunicColor: number,
  variantSeed: number
): void => {
  if (scene.textures.exists(key)) return;
  const rng = mulberry32(variantSeed);
  const skin = SKIN_TONES[Math.floor(rng() * SKIN_TONES.length)] ?? SKIN_TONES[0]!;
  const hair = HAIR_TONES[Math.floor(rng() * HAIR_TONES.length)] ?? HAIR_TONES[0]!;
  const g = scene.add.graphics();

  // Legs
  g.fillStyle(0x5a4a3a, 1);
  g.fillRoundedRect(14, 56, 7, 14, 3);
  g.fillRoundedRect(23, 56, 7, 14, 3);
  // Tunic
  g.fillStyle(tunicColor, 1);
  g.fillRoundedRect(8, 32, 28, 28, 9);
  g.lineStyle(4, PALETTE.outline, 1);
  g.strokeRoundedRect(8, 32, 28, 28, 9);
  // Head
  g.fillStyle(skin, 1);
  g.fillCircle(22, 20, 13);
  g.lineStyle(4, PALETTE.outline, 1);
  g.strokeCircle(22, 20, 13);
  // Hair: cap or side blobs
  g.fillStyle(hair, 1);
  if (rng() > 0.5) {
    g.fillEllipse(22, 11, 26, 12);
  } else {
    g.fillEllipse(22, 10, 24, 10);
    g.fillCircle(11, 18, 5);
    g.fillCircle(33, 18, 5);
  }
  // Eyes
  g.fillStyle(PALETTE.outline, 1);
  g.fillCircle(18, 20, 1.8);
  g.fillCircle(27, 20, 1.8);

  g.generateTexture(key, 44, 72);
  g.destroy();
};
