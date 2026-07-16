import * as Phaser from 'phaser';
import type {
  Crowd,
  Guess,
  InitResponse,
  LeaderboardResponse,
  Outcome,
  ResultResponse,
} from '../../shared/api';
import { sound } from '../sound';

const W = 800;
const H = 600;

const DECK_Y = 330;
const GAP_LEFT = 180;
const GAP_RIGHT = 620;
const COLLAPSE_Y = 430;
const WATER_Y = H - 70;
const SIM_TIMEOUT_MS = 9000;

const ROASTS_COLLAPSE = [
  'That truss was load-bearing hopes and dreams.',
  'The bridge inspector was, in fact, a raccoon.',
  'Structural integrity: emotionally unavailable.',
  'Somewhere, an engineer just felt a chill.',
];

const ROASTS_HOLD = [
  'Held together by splinters and spite. Respect.',
  'The planks unionized and refused to quit.',
  'Physics blinked first.',
  'Not pretty. Not safe. But it HELD.',
];

/** mulberry32 seeded PRNG. */
const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

type Syncable = Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle | Phaser.GameObjects.Arc;

type SyncPair = {
  body: MatterJS.BodyType;
  obj: Syncable;
};

type Phase = 'loading' | 'banner' | 'choosing' | 'running' | 'done';

type SceneData = {
  practice?: boolean;
  seed?: number;
};

export class BridgeScene extends Phaser.Scene {
  private rand: () => number = Math.random;
  private initData: InitResponse | null = null;
  private phase: Phase = 'loading';
  private guess: Guess | null = null;
  private practice = false;
  private runSeed = 0;

  private pairs: SyncPair[] = [];
  private planks: MatterJS.BodyType[] = [];
  private supports: { plank: MatterJS.BodyType; ax: number; ay: number }[] = [];
  private cableG: Phaser.GameObjects.Graphics | null = null;
  private chassis: MatterJS.BodyType | null = null;
  private wheels: MatterJS.BodyType[] = [];
  private truckImg: Phaser.GameObjects.Image | null = null;
  private exhaust: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private clouds: { img: Phaser.GameObjects.Image; speed: number }[] = [];
  private simStartedAt = 0;
  private resolved = false;
  private splashed = false;

  private buttonItems: Phaser.GameObjects.GameObject[] = [];
  private statusText: Phaser.GameObjects.Text | null = null;
  private simPill: Phaser.GameObjects.Container | null = null;
  private simBar: Phaser.GameObjects.Graphics | null = null;
  private countdownText: Phaser.GameObjects.Text | null = null;
  private muteBtn: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('BridgeScene');
  }

  init(data: SceneData) {
    this.rand = Math.random;
    this.initData = null;
    this.phase = 'loading';
    this.guess = null;
    this.practice = Boolean(data.practice);
    this.runSeed = data.seed ?? ((Math.random() * 0xffffffff) >>> 0);
    this.pairs = [];
    this.planks = [];
    this.supports = [];
    this.cableG = null;
    this.chassis = null;
    this.wheels = [];
    this.truckImg = null;
    this.exhaust = null;
    this.clouds = [];
    this.simStartedAt = 0;
    this.resolved = false;
    this.splashed = false;
    this.buttonItems = [];
    this.statusText = null;
    this.simPill = null;
    this.simBar = null;
    this.countdownText = null;
    this.muteBtn = null;
  }

  create() {
    this.makeTextures();
    this.drawBackdrop();
    this.addAmbientLife();
    this.addVignette();
    this.addHud();

    // WebAudio needs a user gesture; first tap anywhere warms it up.
    this.input.on('pointerdown', () => sound.ensure());

    if (!this.practice) {
      let seen = false;
      try {
        seen = localStorage.getItem('wih-howto') === '1';
      } catch {
        seen = true;
      }
      if (!seen) this.time.delayedCall(400, () => this.showHowTo());
    }

    if (this.practice) {
      this.rand = mulberry32(this.runSeed);
      this.buildBridge();
      this.buildTruck();
      this.matter.world.pause();
      this.phase = 'choosing';
      this.showChoiceButtons();
      return;
    }

    this.statusText = this.mkText(W / 2, H / 2, 'Surveying the bridge…', 24, '#3c2415')
      .setOrigin(0.5)
      .setDepth(50);
    void this.boot();
  }

  private async boot() {
    let data: InitResponse;
    try {
      const res = await fetch('/api/init');
      data = (await res.json()) as InitResponse;
      if (data.type !== 'init') throw new Error('bad init');
    } catch {
      data = {
        type: 'init',
        seed: (Date.now() / 86400000) | 0,
        date: new Date().toISOString().slice(0, 10),
        loggedIn: false,
        alreadyPlayed: false,
        yourGuess: null,
        outcome: null,
        crowd: { hold: 0, collapse: 0 },
        streak: 0,
        best: 0,
      };
    }
    this.initData = data;
    this.runSeed = data.seed;
    this.rand = mulberry32(data.seed);
    this.statusText?.destroy();
    this.statusText = null;

    this.buildBridge();
    this.buildTruck();
    this.matter.world.pause();

    if (data.alreadyPlayed && data.yourGuess) {
      this.guess = data.yourGuess;
      this.showReplayBanner(data.yourGuess);
    } else {
      this.phase = 'choosing';
      this.showChoiceButtons();
    }
  }

  /** Crisp text helper (higher rendering resolution). */
  private mkText(
    x: number,
    y: number,
    str: string,
    size: number,
    color: string,
    extra: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}
  ): Phaser.GameObjects.Text {
    const t = this.add.text(x, y, str, {
      fontFamily: 'Arial Black, Arial, sans-serif',
      fontSize: `${size}px`,
      color,
      ...extra,
    });
    t.setResolution(2);
    return t;
  }

  // ---------- textures ----------

  private makeTextures() {
    if (!this.textures.exists('px')) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, 4, 4);
      g.generateTexture('px', 4, 4);
      g.destroy();
    }

    if (!this.textures.exists('truck')) {
      const g = this.add.graphics();
      // Chunky painterly pickup, facing right. Two-tone body.
      // Cargo bed (left).
      g.fillStyle(0x9e3434, 1);
      g.fillRoundedRect(0, 12, 50, 22, { tl: 5, tr: 2, bl: 3, br: 0 });
      g.fillStyle(0xc94747, 1);
      g.fillRoundedRect(2, 12, 46, 11, { tl: 4, tr: 2, bl: 0, br: 0 });
      // Bed rail highlight.
      g.fillStyle(0xe06a5a, 1);
      g.fillRect(2, 12, 46, 3);
      // Cab (right), rounded roof.
      g.fillStyle(0xd64545, 1);
      g.fillRoundedRect(46, 2, 36, 32, { tl: 10, tr: 9, bl: 0, br: 3 });
      // Cab lower two-tone shadow.
      g.fillStyle(0xa93a3a, 1);
      g.fillRect(46, 24, 36, 10);
      // Windshield.
      g.fillStyle(0x9fd4e8, 1);
      g.fillRoundedRect(55, 6, 22, 13, { tl: 7, tr: 7, bl: 2, br: 2 });
      // Windshield glint.
      g.fillStyle(0xe6f6fc, 0.9);
      g.fillTriangle(60, 6, 68, 6, 57, 19);
      // Window pillar.
      g.fillStyle(0xd64545, 1);
      g.fillRect(65, 6, 3, 13);
      // Dark wheel wells.
      g.fillStyle(0x3a2620, 1);
      g.fillCircle(14, 34, 10);
      g.fillCircle(66, 34, 10);
      // Front bumper + headlight.
      g.fillStyle(0x8a2f2f, 1);
      g.fillRect(80, 24, 4, 10);
      g.fillStyle(0xffd98a, 1);
      g.fillRect(80, 20, 4, 4);
      g.generateTexture('truck', 84, 40);
      g.destroy();
    }

    if (!this.textures.exists('wheel')) {
      const g = this.add.graphics();
      g.fillStyle(0x2e2622, 1);
      g.fillCircle(12, 12, 11);
      g.fillStyle(0x8c8378, 1);
      g.fillCircle(12, 12, 5);
      // Spoke marker so rolling is visible.
      g.fillStyle(0x2e2622, 1);
      g.fillRect(11, 3, 2, 8);
      g.generateTexture('wheel', 24, 24);
      g.destroy();
    }

    if (!this.textures.exists('cloud')) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillEllipse(50, 26, 90, 30);
      g.fillEllipse(30, 18, 46, 26);
      g.fillEllipse(70, 16, 52, 24);
      g.generateTexture('cloud', 104, 40);
      g.destroy();
    }

    if (!this.textures.exists('bird')) {
      const g = this.add.graphics();
      g.lineStyle(2, 0x4a3527, 1);
      g.beginPath();
      g.moveTo(0, 6);
      g.lineTo(6, 1);
      g.lineTo(12, 6);
      g.strokePath();
      g.generateTexture('bird', 12, 8);
      g.destroy();
    }

    // Film-grain noise, tiled at low alpha over the cliffs for texture.
    if (!this.textures.exists('grain')) {
      const size = 160;
      const tex = this.textures.createCanvas('grain', size, size);
      if (tex) {
        const c = tex.getContext();
        const imgData = c.createImageData(size, size);
        const rnd = mulberry32(99);
        for (let i = 0; i < imgData.data.length; i += 4) {
          const v = 90 + Math.floor(rnd() * 130);
          imgData.data[i] = v;
          imgData.data[i + 1] = v;
          imgData.data[i + 2] = v;
          imgData.data[i + 3] = Math.floor(rnd() * 46);
        }
        c.putImageData(imgData, 0, 0);
        tex.refresh();
      }
    }

    // Radial vignette for the cinematic edge darkening.
    if (!this.textures.exists('vignette')) {
      const tex = this.textures.createCanvas('vignette', 400, 300);
      if (tex) {
        const c = tex.getContext();
        const grad = c.createRadialGradient(200, 150, 90, 200, 150, 250);
        grad.addColorStop(0, 'rgba(30,15,8,0)');
        grad.addColorStop(0.75, 'rgba(30,15,8,0.08)');
        grad.addColorStop(1, 'rgba(30,15,8,0.4)');
        c.fillStyle = grad;
        c.fillRect(0, 0, 400, 300);
        tex.refresh();
      }
    }
  }

  private plankTextureKey(w: number, h: number): string {
    const key = `plank-${Math.round(w)}x${h}`;
    if (!this.textures.exists(key)) {
      const g = this.add.graphics();
      g.fillStyle(0xa5744f, 1);
      g.fillRect(0, 0, w, h);
      // Wood grain.
      g.lineStyle(1, 0x8a5f3e, 0.8);
      g.lineBetween(3, h * 0.35, w - 3, h * 0.3);
      g.lineBetween(4, h * 0.7, w - 5, h * 0.72);
      // Edge shading.
      g.fillStyle(0x7d5336, 1);
      g.fillRect(0, h - 3, w, 3);
      // Bolts at both ends.
      g.fillStyle(0x4a3527, 1);
      g.fillCircle(5, h / 2, 2);
      g.fillCircle(w - 5, h / 2, 2);
      g.generateTexture(key, Math.round(w), h);
      g.destroy();
    }
    return key;
  }

  // ---------- backdrop ----------

  private drawBackdrop() {
    const g = this.add.graphics().setDepth(-10);
    // Three-stop sky gradient (two stacked gradient rects).
    g.fillGradientStyle(0xffe7a3, 0xffe7a3, 0xffc27d, 0xffc27d, 1);
    g.fillRect(0, 0, W, H * 0.45);
    g.fillGradientStyle(0xffc27d, 0xffc27d, 0xff8355, 0xff8355, 1);
    g.fillRect(0, H * 0.45, W, H * 0.55);

    // Sun with layered glow halo.
    g.fillStyle(0xfff3c4, 0.16);
    g.fillCircle(660, 90, 84);
    g.fillStyle(0xfff3c4, 0.3);
    g.fillCircle(660, 90, 60);
    g.fillStyle(0xfff8d9, 1);
    g.fillCircle(660, 90, 40);

    // Layered silhouette hills (back → front, darker forward).
    g.fillStyle(0xc99a6e, 0.6);
    g.fillEllipse(190, 600, 700, 420);
    g.fillEllipse(690, 640, 720, 460);
    g.fillStyle(0x9c6f4e, 0.85);
    g.fillEllipse(90, 640, 560, 380);
    g.fillEllipse(740, 660, 600, 400);
    g.fillStyle(0x7c5138, 1);
    g.fillEllipse(320, 740, 640, 380);
    g.fillEllipse(560, 760, 620, 360);

    const cliffTop = DECK_Y + 14;

    // River winding through the ravine floor with a soft bank.
    g.fillStyle(0x6e5138, 1);
    g.fillRect(GAP_LEFT - 30, WATER_Y - 14, GAP_RIGHT - GAP_LEFT + 60, H - WATER_Y + 14);
    g.fillStyle(0x40616f, 1);
    g.fillRect(GAP_LEFT - 30, WATER_Y, GAP_RIGHT - GAP_LEFT + 60, H - WATER_Y);
    // Winding bends suggested by stacked lighter curves.
    g.fillStyle(0x527a8a, 0.9);
    g.fillEllipse(W / 2 - 60, WATER_Y + 14, 260, 22);
    g.fillEllipse(W / 2 + 90, WATER_Y + 34, 300, 26);
    // Glint highlights.
    g.lineStyle(2, 0xbfe3ef, 0.8);
    g.lineBetween(GAP_LEFT + 40, WATER_Y + 9, GAP_LEFT + 140, WATER_Y + 9);
    g.lineBetween(GAP_LEFT + 210, WATER_Y + 19, GAP_LEFT + 320, WATER_Y + 19);
    g.lineBetween(GAP_LEFT + 110, WATER_Y + 30, GAP_LEFT + 230, WATER_Y + 30);
    g.lineStyle(1.5, 0xfff3c4, 0.5);
    g.lineBetween(GAP_LEFT + 170, WATER_Y + 13, GAP_LEFT + 250, WATER_Y + 13);

    // Layered canyon cliff faces (3 tones per side, back → front).
    const cliff = (x0: number, x1: number, mirror: boolean) => {
      const w = x1 - x0;
      // Back face (lighter, sun-washed).
      g.fillStyle(0x7a5940, 1);
      g.fillRect(x0, cliffTop, w, H - cliffTop);
      // Mid ledge face.
      g.fillStyle(0x654733, 1);
      const inset = mirror ? 0 : Math.floor(w * 0.22);
      g.fillRect(x0 + (mirror ? Math.floor(w * 0.22) : 0), cliffTop + 60, w - Math.floor(w * 0.22), H);
      // Front (darkest) column near the gap edge.
      g.fillStyle(0x523a2a, 1);
      const frontW = Math.floor(w * 0.34);
      g.fillRect(mirror ? x0 : x1 - frontW, cliffTop + 24, frontW, H);
      void inset;
    };
    cliff(0, GAP_LEFT, false);
    cliff(GAP_RIGHT, W, true);

    // Rock strata lines across both cliffs.
    const stoneRand = mulberry32(7);
    for (let y = cliffTop + 20; y < H - 30; y += 22) {
      const jL = stoneRand() * 12;
      const jR = stoneRand() * 12;
      g.lineStyle(2, 0x43301f, 0.55);
      g.lineBetween(0, y + jL, GAP_LEFT - 4, y + jL * 0.5);
      g.lineBetween(GAP_RIGHT + 4, y + jR * 0.5, W, y + jR);
      // Occasional vertical crack.
      if (stoneRand() < 0.5) {
        g.lineBetween(30 + stoneRand() * 110, y + jL, 34 + stoneRand() * 110, y + jL + 16);
      }
      if (stoneRand() < 0.5) {
        g.lineBetween(GAP_RIGHT + 30 + stoneRand() * 110, y + jR, GAP_RIGHT + 34 + stoneRand() * 110, y + jR + 16);
      }
      // Warm strata highlight just under each line.
      g.lineStyle(1, 0x8f6a49, 0.35);
      g.lineBetween(0, y + jL + 3, GAP_LEFT - 4, y + jL * 0.5 + 3);
      g.lineBetween(GAP_RIGHT + 4, y + jR * 0.5 + 3, W, y + jR + 3);
    }

    // Warm rim light along the cliff tops and gap edges.
    g.lineStyle(3, 0xffd98a, 0.65);
    g.lineBetween(0, cliffTop, GAP_LEFT, cliffTop);
    g.lineBetween(GAP_RIGHT, cliffTop, W, cliffTop);
    g.lineStyle(2, 0xffc27d, 0.4);
    g.lineBetween(GAP_LEFT - 1, cliffTop, GAP_LEFT - 1, cliffTop + 130);
    g.lineBetween(GAP_RIGHT + 1, cliffTop, GAP_RIGHT + 1, cliffTop + 130);

    // Bedrock strip.
    g.fillStyle(0x35261b, 1);
    g.fillRect(0, H - 34, W, 34);

    // Grass tufts + bushes along cliff edges.
    const tuftRand = mulberry32(13);
    const tuft = (x: number) => {
      g.fillStyle(0x7d8f4e, 1);
      const s = 3 + tuftRand() * 3;
      g.fillTriangle(x, DECK_Y, x - s, DECK_Y + 1, x - s * 0.4, DECK_Y - s * 2);
      g.fillTriangle(x, DECK_Y, x + s, DECK_Y + 1, x + s * 0.4, DECK_Y - s * 1.6);
    };
    const bush = (x: number) => {
      const r = 5 + tuftRand() * 4;
      g.fillStyle(0x5e7040, 1);
      g.fillCircle(x, DECK_Y - r * 0.5, r);
      g.fillCircle(x - r * 0.8, DECK_Y - r * 0.2, r * 0.7);
      g.fillCircle(x + r * 0.8, DECK_Y - r * 0.2, r * 0.7);
      g.fillStyle(0x76894c, 1);
      g.fillCircle(x - r * 0.3, DECK_Y - r * 0.7, r * 0.55);
    };
    for (let x = 14; x < GAP_LEFT - 24; x += 22 + tuftRand() * 26) tuft(x);
    for (let x = GAP_RIGHT + 18; x < W - 10; x += 22 + tuftRand() * 26) tuft(x);
    bush(46);
    bush(126);
    bush(GAP_RIGHT + 64);
    bush(W - 46);

    // Suspension towers.
    const towerH = 96;
    g.fillStyle(0x4a3527, 1);
    g.fillRect(GAP_LEFT - 14, DECK_Y - towerH, 14, towerH);
    g.fillRect(GAP_RIGHT, DECK_Y - towerH, 14, towerH);
    // Tower warm-lit face.
    g.fillStyle(0x6b4c3a, 1);
    g.fillRect(GAP_LEFT - 14, DECK_Y - towerH, 5, towerH);
    g.fillRect(GAP_RIGHT, DECK_Y - towerH, 5, towerH);
    // Caps.
    g.fillStyle(0x6b4c3a, 1);
    g.fillRect(GAP_LEFT - 16, DECK_Y - towerH - 4, 18, 6);
    g.fillRect(GAP_RIGHT - 2, DECK_Y - towerH - 4, 18, 6);
    // Cross braces.
    g.lineStyle(3, 0x3a2a1e, 1);
    g.lineBetween(GAP_LEFT - 14, DECK_Y - 30, GAP_LEFT, DECK_Y - 60);
    g.lineBetween(GAP_RIGHT, DECK_Y - 60, GAP_RIGHT + 14, DECK_Y - 30);

    // Grain overlay across the cliffs + hills for the painterly feel.
    for (let gx = 0; gx < W; gx += 160) {
      for (let gy = 240; gy < H; gy += 160) {
        this.add.image(gx + 80, gy + 80, 'grain').setAlpha(0.5).setDepth(-9.5);
      }
    }
  }

  private addAmbientLife() {
    // Drifting parallax clouds.
    const cloudSpecs = [
      { x: 120, y: 70, scale: 1.1, alpha: 0.5, speed: 0.1 },
      { x: 420, y: 130, scale: 0.7, alpha: 0.35, speed: 0.16 },
      { x: 650, y: 190, scale: 0.5, alpha: 0.3, speed: 0.24 },
    ];
    for (const c of cloudSpecs) {
      const img = this.add.image(c.x, c.y, 'cloud').setScale(c.scale).setAlpha(c.alpha).setDepth(-9);
      this.clouds.push({ img, speed: c.speed });
    }

    // A few birds drifting near the sun.
    for (let i = 0; i < 3; i++) {
      const b = this.add
        .image(480 + i * 46, 120 + (i % 2) * 18, 'bird')
        .setDepth(-8)
        .setAlpha(0.8);
      this.tweens.add({
        targets: b,
        x: b.x + 60 + i * 20,
        y: b.y - 14,
        duration: 6000 + i * 1400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Floating dust motes.
    this.add
      .particles(0, 0, 'px', {
        x: { min: 40, max: W - 40 },
        y: { min: 100, max: 420 },
        lifespan: 6000,
        speedY: { min: -8, max: -3 },
        speedX: { min: -6, max: 6 },
        scale: { start: 0.35, end: 0 },
        alpha: { start: 0.3, end: 0 },
        tint: 0xfff3c4,
        frequency: 420,
      })
      .setDepth(-7);
  }

  private addVignette() {
    this.add.image(W / 2, H / 2, 'vignette').setDisplaySize(W, H).setDepth(40);
  }

  // ---------- HUD (mute, countdown, help) ----------

  private addHud() {
    // Mute toggle.
    this.muteBtn = this.mkText(W - 26, 24, sound.muted ? '🔇' : '🔊', 22, '#ffffff')
      .setOrigin(0.5)
      .setDepth(95)
      .setInteractive({ useHandCursor: true });
    this.muteBtn.on('pointerdown', () => {
      sound.ensure();
      const muted = sound.toggle();
      this.muteBtn?.setText(muted ? '🔇' : '🔊');
    });

    // Help button.
    const help = this.mkText(W - 62, 24, '?', 20, '#3c2415')
      .setOrigin(0.5)
      .setDepth(95)
      .setBackgroundColor('#ffd98a')
      .setPadding(8, 2, 8, 2)
      .setInteractive({ useHandCursor: true });
    help.on('pointerdown', () => {
      sound.click();
      this.showHowTo();
    });

    // Countdown to the next daily bridge (00:00 UTC).
    const chipBg = this.add.graphics().setDepth(94);
    chipBg.fillStyle(0x2e2622, 0.75);
    chipBg.fillRoundedRect(W - 240, 44, 214, 26, 13);
    this.countdownText = this.mkText(W - 133, 57, '', 13, '#ffd98a', {
      fontFamily: 'Arial, sans-serif',
    })
      .setOrigin(0.5)
      .setDepth(95);
    this.updateCountdown();
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.updateCountdown() });
  }

  private updateCountdown() {
    if (!this.countdownText || !this.countdownText.active) return;
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(24, 0, 0, 0);
    const ms = next.getTime() - now.getTime();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    this.countdownText.setText(`⏳ next bridge in ${pad(h)}:${pad(m)}:${pad(s)}`);
  }

  // ---------- how to play ----------

  private showHowTo() {
    try {
      localStorage.setItem('wih-howto', '1');
    } catch {
      /* fine */
    }
    const layer = this.add.container(0, 0).setDepth(120);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x1a120c, 0.55).setInteractive();
    layer.add(dim);
    const card = this.add.graphics();
    card.fillStyle(0x2e2622, 0.97);
    card.fillRoundedRect(120, 110, W - 240, 380, 24);
    card.lineStyle(2, 0xe8892c, 0.6);
    card.strokeRoundedRect(120, 110, W - 240, 380, 24);
    layer.add(card);
    layer.add(this.mkText(W / 2, 152, 'HOW TO PLAY', 30, '#ffd98a').setOrigin(0.5));

    const rows: [string, string][] = [
      ['🔍', 'Study the bridge. Sketchy planks? Missing hangers?'],
      ['🟢🔴', 'Call it: HOLD or COLLAPSE. One call per day.'],
      ['⚙️', 'Physics decides. No tricks, no scripts.'],
      ['🔥', 'Nail it daily to build your streak.'],
    ];
    rows.forEach(([icon, text], i) => {
      const y = 210 + i * 56;
      layer.add(this.mkText(172, y, icon, 22, '#ffffff').setOrigin(0.5));
      layer.add(
        this.mkText(206, y, text, 17, '#ffffff', {
          fontFamily: 'Arial, sans-serif',
          wordWrap: { width: W - 350 },
        }).setOrigin(0, 0.5)
      );
    });

    const gotIt = this.makeButton(
      W / 2,
      448,
      'GOT IT',
      0xe8892c,
      0xb5661c,
      () => {
        gotIt.destroy();
        layer.destroy();
      },
      220,
      52,
      22
    );
    gotIt.setDepth(121);
    dim.on('pointerdown', () => {
      gotIt.destroy();
      layer.destroy();
    });
  }

  // ---------- sim progress pill ----------

  private showSimPill() {
    const pillW = 320;
    const pillH = 44;
    const g = this.add.graphics();
    g.fillStyle(0x2e2622, 0.88);
    g.fillRoundedRect(-pillW / 2, -pillH / 2, pillW, pillH, 22);
    g.lineStyle(1.5, 0xe8892c, 0.5);
    g.strokeRoundedRect(-pillW / 2, -pillH / 2, pillW, pillH, 22);
    const icon = this.mkText(-pillW / 2 + 26, 0, '🚚', 18, '#ffffff').setOrigin(0.5);
    const label = this.mkText(6, -6, 'SIMULATION RUNNING…', 14, '#ffd98a').setOrigin(0.5);
    this.simBar = this.add.graphics();
    this.simBar.y = 10;
    const track = this.add.graphics();
    track.fillStyle(0x1a120c, 1);
    track.fillRoundedRect(-100, 6, 240, 8, 4);
    this.simPill = this.add
      .container(W / 2, H - 44, [g, track, this.simBar, icon, label])
      .setDepth(65);
  }

  private updateSimPill() {
    if (!this.simBar || !this.chassis) return;
    // Progress = how far across the truck is.
    const p = Phaser.Math.Clamp((this.chassis.position.x - 70) / (GAP_RIGHT + 60 - 70), 0, 1);
    this.simBar.clear();
    this.simBar.fillStyle(0xe8892c, 1);
    this.simBar.fillRoundedRect(-100, -4, Math.max(10, 240 * p), 8, 4);
  }

  private destroySimPill() {
    this.simPill?.destroy();
    this.simPill = null;
    this.simBar = null;
  }

  // ---------- bridge generation ----------

  private buildBridge() {
    const rand = this.rand;
    const plankCount = 7 + Math.floor(rand() * 4); // 7-10
    // ~40% of days the bridge is doomed: one deck joint is simply missing,
    // and the whole build is floppier.
    const doomed = rand() < 0.42;
    const brokenJoint = 1 + Math.floor(rand() * (plankCount - 2));
    const stiffness = doomed ? 0.15 + rand() * 0.2 : 0.5 + rand() * 0.4;
    const supportChance = doomed ? 0.15 + rand() * 0.3 : 0.45 + rand() * 0.45;
    const plankGap = 2;
    const span = GAP_RIGHT - GAP_LEFT;
    const plankW = (span - plankGap * (plankCount - 1)) / plankCount;
    const plankH = 14;

    // Static abutments at deck level either side of the gap.
    const leftPier = this.matter.add.rectangle(GAP_LEFT / 2, DECK_Y + plankH / 2, GAP_LEFT, plankH, {
      isStatic: true,
      friction: 1,
    });
    const rightPier = this.matter.add.rectangle(
      GAP_RIGHT + (W - GAP_RIGHT) / 2,
      DECK_Y + plankH / 2,
      W - GAP_RIGHT,
      plankH,
      { isStatic: true, friction: 1 }
    );
    const ledgeL = this.add.image(
      leftPier.position.x,
      leftPier.position.y,
      this.plankTextureKey(GAP_LEFT, plankH)
    );
    ledgeL.setTint(0x9f8265);
    this.pairs.push({ body: leftPier, obj: ledgeL });
    const ledgeR = this.add.image(
      rightPier.position.x,
      rightPier.position.y,
      this.plankTextureKey(W - GAP_RIGHT, plankH)
    );
    ledgeR.setTint(0x9f8265);
    this.pairs.push({ body: rightPier, obj: ledgeR });

    // Deck planks joined by point constraints.
    const plankKey = this.plankTextureKey(plankW, plankH);
    let prev: MatterJS.BodyType = leftPier;
    let prevHalf = GAP_LEFT / 2;
    for (let i = 0; i < plankCount; i++) {
      const cx = GAP_LEFT + plankW / 2 + i * (plankW + plankGap);
      const weak = rand() < 0.18;
      const plank = this.matter.add.rectangle(cx, DECK_Y + plankH / 2, plankW, plankH, {
        density: 0.004,
        friction: 1,
        frictionStatic: 1,
      });
      this.planks.push(plank);
      const pImg = this.add.image(cx, plank.position.y, plankKey);
      if (weak) pImg.setTint(0xb08968);
      this.pairs.push({ body: plank, obj: pImg });

      const s = weak ? stiffness * 0.35 : stiffness;
      if (doomed && i === brokenJoint) {
        // Missing joint - the subtle tell is a slightly dropped plank.
        this.matter.body.setPosition(plank, { x: cx, y: DECK_Y + plankH / 2 + 3 });
      } else {
        this.matter.add.constraint(prev, plank, plankGap, s, {
          pointA: { x: prevHalf, y: 0 },
          pointB: { x: -plankW / 2, y: 0 },
        });
      }
      prev = plank;
      prevHalf = plankW / 2;
    }
    // Attach the last plank to the right abutment.
    this.matter.add.constraint(prev, rightPier, plankGap, stiffness, {
      pointA: { x: prevHalf, y: 0 },
      pointB: { x: -(W - GAP_RIGHT) / 2, y: 0 },
    });

    // Diagonal support cables from the tower tops to some planks -
    // randomly missing ones are what make weak bridges fold.
    const leftAnchor = { x: GAP_LEFT - 7, y: DECK_Y - 94 };
    const rightAnchor = { x: GAP_RIGHT + 7, y: DECK_Y - 94 };
    const addSupport = (i: number, s: number) => {
      const plank = this.planks[i];
      if (!plank) return;
      if (this.supports.some((sp) => sp.plank === plank)) return;
      const anchor = i < this.planks.length / 2 ? leftAnchor : rightAnchor;
      const dx = plank.position.x - anchor.x;
      const dy = plank.position.y - anchor.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      this.matter.add.worldConstraint(plank, len, s, {
        pointA: new Phaser.Math.Vector2(anchor.x, anchor.y),
        pointB: new Phaser.Math.Vector2(0, 0),
      });
      this.supports.push({ plank, ax: anchor.x, ay: anchor.y });
    };
    for (let i = 0; i < this.planks.length; i++) {
      if (rand() > supportChance) continue;
      addSupport(i, 0.6 + rand() * 0.3);
    }
    if (doomed) {
      // Weak cables prop up the broken joint so the deck LOOKS mostly fine -
      // it gives way under the truck's weight, not before.
      addSupport(brokenJoint - 1, 0.06 + rand() * 0.05);
      addSupport(brokenJoint, 0.06 + rand() * 0.05);
    }
    this.cableG = this.add.graphics().setDepth(-2);
    this.drawCables();
  }

  /** Suspension-bridge rendering: main catenary + hangers, every frame. */
  private drawCables() {
    if (!this.cableG) return;
    const g = this.cableG;
    g.clear();

    const lx = GAP_LEFT - 7;
    const rx = GAP_RIGHT + 7;
    const towerY = DECK_Y - 96;
    const sagY = DECK_Y - 26;
    const catY = (x: number) => {
      // Parabola through both tower tops, dipping to sagY at midspan.
      const mid = (lx + rx) / 2;
      const half = (rx - lx) / 2;
      const t = (x - mid) / half; // -1..1
      return sagY + (towerY - sagY) * t * t;
    };

    // Main catenary cable (doubled line for weight).
    g.lineStyle(3.5, 0x3a2a1e, 1);
    g.beginPath();
    g.moveTo(lx, towerY);
    for (let x = lx; x <= rx; x += 12) g.lineTo(x, catY(x));
    g.lineTo(rx, towerY);
    g.strokePath();
    g.lineStyle(1, 0x8f6a49, 0.7);
    g.beginPath();
    g.moveTo(lx, towerY - 2);
    for (let x = lx; x <= rx; x += 12) g.lineTo(x, catY(x) - 2);
    g.lineTo(rx, towerY - 2);
    g.strokePath();

    // Anchor cables from the tower tops back to the cliff tops.
    g.lineStyle(2.5, 0x3a2a1e, 1);
    g.lineBetween(lx, towerY, GAP_LEFT - 70, DECK_Y - 2);
    g.lineBetween(rx, towerY, GAP_RIGHT + 70, DECK_Y - 2);

    // Vertical hangers to each plank. Planks with a real (physics) support
    // cable get a full hanger; unsupported planks show a frayed stub - the
    // engineering tell.
    const supported = new Set(this.supports.map((s) => s.plank));
    for (const plank of this.planks) {
      const px = plank.position.x;
      const py = plank.position.y - 6;
      const cy = catY(Phaser.Math.Clamp(px, lx, rx));
      if (supported.has(plank)) {
        g.lineStyle(2, 0x4a3527, 1);
        g.lineBetween(px, cy, px, py);
        // Clamp dot at the deck.
        g.fillStyle(0x2e2622, 1);
        g.fillCircle(px, py, 1.8);
      } else if (!this.resolved && this.phase !== 'running') {
        // Frayed stub dangling from the main cable.
        g.lineStyle(2, 0x4a3527, 0.9);
        g.lineBetween(px, cy, px + 2, cy + 12);
        g.lineStyle(1.5, 0x4a3527, 0.7);
        g.lineBetween(px + 2, cy + 12, px - 1, cy + 17);
      }
    }
  }

  // ---------- truck ----------

  private buildTruck() {
    const rand = this.rand;
    const x = 70;
    const wheelbase = 30; // wide stance, hard to flip
    const wheelR = 11;
    const wheelY = DECK_Y - wheelR; // rest wheels on the deck
    const chassisY = wheelY - 15; // low chassis center of mass
    const weight = 0.006 + rand() * 0.006; // daily truck weight variance

    const chassis = this.matter.add.rectangle(x, chassisY, 78, 20, {
      density: weight,
      friction: 0.8,
      chamfer: { radius: 4 },
    });
    const mkWheel = (wx: number) =>
      this.matter.add.circle(wx, wheelY, wheelR, {
        density: weight * 1.4,
        friction: 0.95,
        frictionStatic: 1,
        restitution: 0,
      });
    const wheelA = mkWheel(x - wheelbase);
    const wheelB = mkWheel(x + wheelbase);

    // Stiff pin axles (Matter car-composite pattern).
    this.matter.add.constraint(chassis, wheelA, 0, 1, {
      pointA: { x: -wheelbase, y: 15 },
      pointB: { x: 0, y: 0 },
    });
    this.matter.add.constraint(chassis, wheelB, 0, 1, {
      pointA: { x: wheelbase, y: 15 },
      pointB: { x: 0, y: 0 },
    });

    this.chassis = chassis;
    this.wheels = [wheelA, wheelB];

    this.truckImg = this.add.image(x, chassisY, 'truck');
    this.truckImg.setOrigin(0.5, 0.62);
    this.pairs.push({ body: chassis, obj: this.truckImg });
    for (const w of this.wheels) {
      const wi = this.add.image(w.position.x, w.position.y, 'wheel');
      this.pairs.push({ body: w, obj: wi });
    }

    // Exhaust puffs from the back of the truck.
    this.exhaust = this.add.particles(0, 0, 'px', {
      speedX: { min: -30, max: -12 },
      speedY: { min: -24, max: -8 },
      lifespan: 700,
      scale: { start: 0.9, end: 0 },
      alpha: { start: 0.45, end: 0 },
      tint: 0x8c8378,
      frequency: 90,
    });
    this.exhaust.setDepth(1);
    this.exhaust.startFollow(this.truckImg, -44, -2);
    this.exhaust.stop();
  }

  // ---------- UI ----------

  private makeButton(
    x: number,
    y: number,
    label: string,
    color: number,
    shadow: number,
    onTap: () => void,
    w = 300,
    h = 78,
    fontSize = 30
  ): Phaser.GameObjects.Container {
    const g = this.add.graphics();
    // Soft drop shadow.
    g.fillStyle(0x000000, 0.18);
    g.fillRoundedRect(-w / 2 + 3, -h / 2 + 9, w, h, 20);
    g.fillStyle(shadow, 1);
    g.fillRoundedRect(-w / 2, -h / 2 + 5, w, h, 20);
    g.fillStyle(color, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 20);
    const t = this.mkText(0, 0, label, fontSize, '#ffffff').setOrigin(0.5);
    const c = this.add.container(x, y, [g, t]).setDepth(60);
    c.setSize(w, h);
    c.setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => {
      sound.ensure();
      sound.click();
      // Press-down effect, then act.
      c.y += 4;
      this.time.delayedCall(90, () => {
        c.y -= 4;
        onTap();
      });
    });
    return c;
  }

  private showChoiceButtons() {
    const title = this.mkText(W / 2, 66, this.practice ? 'PRACTICE BRIDGE' : 'WILL IT HOLD?', 42, '#3c2415').setOrigin(0.5);
    const caption = this.mkText(
      W / 2,
      104,
      this.practice
        ? 'No stakes. Call it anyway.'
        : 'Lock in your call before the truck crosses.',
      17,
      '#6b4226',
      { fontFamily: 'Arial, sans-serif' }
    ).setOrigin(0.5);

    const holdBtn = this.makeButton(W / 2, 470, '🟢  HOLD', 0x3f9d5a, 0x2c6e3f, () => {
      void this.choose('hold');
    });
    const collapseBtn = this.makeButton(W / 2, 560, '🔴  COLLAPSE', 0xd64545, 0xa83232, () => {
      void this.choose('collapse');
    });
    this.buttonItems = [title, caption, holdBtn, collapseBtn];

    if (this.practice) {
      const best = Number(this.registry.get('practiceBest') ?? 0);
      const run = Number(this.registry.get('practiceStreak') ?? 0);
      const info = this.mkText(W / 2, 140, `Practice run: ${run}   Best: ${best}`, 16, '#6b4226').setOrigin(0.5);
      this.buttonItems.push(info);
    }
  }

  private showReplayBanner(guess: Guess) {
    this.phase = 'banner';
    const g = this.add.graphics().setDepth(70);
    g.fillStyle(0x2e2622, 0.9);
    g.fillRoundedRect(70, 60, W - 140, 120, 18);
    const icon = guess === 'hold' ? '🟢' : '🔴';
    const line1 = this.mkText(
      W / 2,
      100,
      `You already called today's bridge: ${icon} ${guess.toUpperCase()}`,
      21,
      '#ffffff'
    )
      .setOrigin(0.5)
      .setDepth(71);
    const line2 = this.mkText(W / 2, 140, 'Watch the replay…', 18, '#ffd98a')
      .setOrigin(0.5)
      .setDepth(71);

    this.time.delayedCall(1800, () => {
      this.tweens.add({
        targets: [g, line1, line2],
        alpha: 0,
        duration: 400,
        onComplete: () => {
          g.destroy();
          line1.destroy();
          line2.destroy();
        },
      });
      this.startSim();
    });
  }

  private async choose(guess: Guess) {
    if (this.phase !== 'choosing') return;
    this.guess = guess;
    this.buttonItems.forEach((i) => i.destroy());
    this.buttonItems = [];

    if (!this.practice) {
      try {
        const res = await fetch('/api/guess', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guess }),
        });
        const data = (await res.json()) as { type?: string; crowd?: Crowd };
        if (data.type === 'guess' && data.crowd && this.initData) {
          this.initData.crowd = data.crowd;
        }
      } catch {
        // Play on regardless - the verdict call will reconcile.
      }
    }
    this.startSim();
  }

  private startSim() {
    this.phase = 'running';
    this.simStartedAt = this.time.now;
    this.matter.world.resume();
    this.exhaust?.start();
    this.showSimPill();
    sound.creak();
  }

  override update(time: number) {
    // Sync visuals to bodies.
    for (const { body, obj } of this.pairs) {
      obj.setPosition(body.position.x, body.position.y);
      obj.setRotation(body.angle);
    }
    // Cab bounce while driving.
    if (this.truckImg && this.phase === 'running') {
      this.truckImg.y += Math.sin(time * 0.03) * 1.2;
    }
    this.drawCables();

    // Parallax cloud drift.
    for (const c of this.clouds) {
      c.img.x += c.speed;
      if (c.img.x > W + 70) c.img.x = -70;
    }

    if (this.phase !== 'running' || this.resolved) return;

    this.updateSimPill();

    const truckY = this.chassis?.position.y ?? 0;
    const truckX = this.chassis?.position.x ?? 0;
    const elapsed = this.time.now - this.simStartedAt;

    // Drive: wheel torque only (angular velocity on the wheels), ramped up
    // over the first second so the chassis doesn't wheelie off the line.
    // The chassis is never pushed directly, so it can't fishtail.
    if (this.chassis) {
      const wheelSpeed = Math.min(0.26, 0.06 + (elapsed / 1200) * 0.2);
      if (this.chassis.velocity.x < 3.2) {
        for (const w of this.wheels) {
          this.matter.body.setAngularVelocity(w, wheelSpeed);
        }
      }
      // Stability assist while on the deck: damp chassis spin so plank seams
      // can't flip the truck. Once it's falling, let it tumble for real.
      if (truckY < DECK_Y + 30) {
        const av = this.chassis.angularVelocity;
        const ang = this.chassis.angle;
        this.matter.body.setAngularVelocity(
          this.chassis,
          Phaser.Math.Clamp(av, -0.06, 0.06) * 0.92 - ang * 0.004
        );
      }
    }

    // Splash when something hits the water.
    if (!this.splashed) {
      const wet = truckY > WATER_Y - 20 || this.planks.some((p) => p.position.y > WATER_Y - 12);
      if (wet) {
        this.splashed = true;
        sound.splash();
        const sx = truckY > WATER_Y - 20 ? truckX : W / 2;
        this.add
          .particles(sx, WATER_Y, 'px', {
            speed: { min: 60, max: 200 },
            angle: { min: 220, max: 320 },
            lifespan: 700,
            scale: { start: 1.1, end: 0 },
            tint: [0x6d8d9a, 0x9fc3d0, 0x40616f],
            emitting: false,
          })
          .explode(36, sx, WATER_Y);
      }
    }

    // Outcome detection. Plank drops only count once the truck has reached
    // the gap - otherwise we let it drive into the hole for the drama.
    const anyPlankFell =
      truckX > GAP_LEFT - 20 && this.planks.some((p) => p.position.y > COLLAPSE_Y);
    const truckFell = truckY > COLLAPSE_Y;

    if (anyPlankFell || truckFell) {
      this.resolve('collapse');
    } else if (truckX > GAP_RIGHT + 60) {
      this.resolve('hold');
    } else if (elapsed > SIM_TIMEOUT_MS) {
      // Stuck mid-span sagging forever counts as a failure to cross.
      this.resolve(truckY > DECK_Y + 30 ? 'collapse' : 'hold');
    }
  }

  // ---------- verdict ----------

  private resolve(outcome: Outcome) {
    if (this.resolved) return;
    this.resolved = true;
    this.phase = 'done';
    this.exhaust?.stop();
    this.destroySimPill();

    if (outcome === 'collapse') {
      sound.crack();
      sound.rumble();
      this.cameras.main.shake(400, 0.012);
      this.add
        .particles(W / 2, DECK_Y, 'px', {
          speed: { min: 60, max: 260 },
          angle: { min: 200, max: 340 },
          lifespan: 900,
          scale: { start: 1.4, end: 0 },
          tint: [0x8f6242, 0xa5744f, 0x5b4232],
          emitting: false,
        })
        .explode(40, W / 2, DECK_Y);
    } else {
      sound.chime();
      sound.honk();
      this.add
        .particles(W / 2, 120, 'px', {
          speed: { min: 80, max: 240 },
          angle: { min: 0, max: 360 },
          lifespan: 1200,
          scale: { start: 1.2, end: 0 },
          tint: [0xffe066, 0x3f9d5a, 0xd64545, 0x4a90d9],
          emitting: false,
        })
        .explode(50, W / 2, 120);
    }

    // Let the physics settle in view for a beat before the verdict card.
    this.time.delayedCall(900, () => {
      void this.showVerdict(outcome);
    });
  }

  private async showVerdict(outcome: Outcome) {
    let result: ResultResponse | null = null;
    if (!this.practice) {
      try {
        const res = await fetch('/api/result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ outcome }),
        });
        const data = (await res.json()) as ResultResponse | { status: string };
        if ('type' in data && data.type === 'result') result = data;
      } catch {
        result = null;
      }
    }

    const finalOutcome: Outcome = result?.outcome ?? outcome;
    const crowd: Crowd = result?.crowd ?? this.initData?.crowd ?? { hold: 0, collapse: 0 };
    const correct = result ? result.correct : this.guess === finalOutcome;

    let streak = result?.streak ?? this.initData?.streak ?? 0;
    if (this.practice) {
      const run = correct ? Number(this.registry.get('practiceStreak') ?? 0) + 1 : 0;
      this.registry.set('practiceStreak', run);
      const best = Math.max(run, Number(this.registry.get('practiceBest') ?? 0));
      this.registry.set('practiceBest', best);
      streak = run;
    }

    const layer = this.add.container(0, 0).setDepth(80);

    // Confetti burst behind the card on a correct call.
    if (correct && this.guess) {
      this.add
        .particles(W / 2, 80, 'px', {
          speed: { min: 120, max: 320 },
          angle: { min: 40, max: 140 },
          lifespan: 1600,
          gravityY: 300,
          quantity: 2,
          scale: { start: 1.3, end: 0 },
          rotate: { start: 0, end: 360 },
          tint: [0xffe066, 0x3f9d5a, 0xd64545, 0x4a90d9, 0xe8892c],
          emitting: true,
          frequency: 40,
          stopAfter: 60,
        })
        .setDepth(79);
    }

    const bg = this.add.graphics();
    bg.fillStyle(0x241c16, 0.93);
    bg.fillRoundedRect(60, 84, W - 120, 436, 24);
    bg.lineStyle(2, 0xe8892c, 0.55);
    bg.strokeRoundedRect(60, 84, W - 120, 436, 24);
    layer.add(bg);

    if (this.practice) {
      const badge = this.mkText(W / 2, 108, 'PRACTICE', 14, '#2e2622');
      badge.setOrigin(0.5).setBackgroundColor('#ffd98a').setPadding(8, 3, 8, 3);
      layer.add(badge);
    }

    const held = finalOutcome === 'hold';
    const title = this.mkText(
      W / 2,
      150,
      held ? 'IT HELD!' : 'IT COLLAPSED!',
      50,
      held ? '#7fe08a' : '#ff7a7a'
    ).setOrigin(0.5);
    layer.add(title);
    title.setScale(2.6).setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 420, ease: 'Back.easeOut' });

    const youLine = this.guess
      ? correct
        ? this.practice
          ? `Called it. Practice run: ${streak}`
          : `You called it. Streak: ${streak}`
        : this.practice
          ? 'Nope. Practice run reset.'
          : 'You did NOT call it. Streak reset.'
      : 'You watched from a safe distance.';
    const you = this.mkText(W / 2, 198, youLine, 21, '#ffffff', {
      fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);
    layer.add(you);

    if (correct && streak > 0) {
      const flame = this.mkText(W / 2 + you.width / 2 + 20, 198, '🔥', 21, '#ffffff').setOrigin(0.5);
      layer.add(flame);
      this.tweens.add({
        targets: flame,
        scale: 1.35,
        duration: 460,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    const roasts = held ? ROASTS_HOLD : ROASTS_COLLAPSE;
    const roast = roasts[this.runSeed % roasts.length] ?? roasts[0] ?? '';
    layer.add(
      this.mkText(W / 2, 234, `“${roast}”`, 17, '#ffd98a', {
        fontFamily: 'Georgia, serif',
        fontStyle: 'italic',
        wordWrap: { width: W - 220 },
        align: 'center',
      }).setOrigin(0.5)
    );

    if (!this.practice) {
      // Community split as an animated donut chart.
      const total = crowd.hold + crowd.collapse;
      const holdPct = total > 0 ? Math.round((crowd.hold / total) * 100) : 50;
      const cx = W / 2;
      const cy = 318;
      const radius = 44;
      const donut = this.add.graphics();
      layer.add(donut);
      const centerLabel = this.mkText(cx, cy - 8, '', 15, '#ffffff').setOrigin(0.5);
      const centerSub = this.mkText(cx, cy + 12, total > 0 ? `${total} calls` : 'first!', 12, '#b8a88f', {
        fontFamily: 'Arial, sans-serif',
      }).setOrigin(0.5);
      layer.add(centerLabel);
      layer.add(centerSub);
      const holdLabel = this.mkText(cx - 150, cy, '', 18, '#7fe08a').setOrigin(0.5);
      const collapseLabel = this.mkText(cx + 158, cy, '', 18, '#ff7a7a').setOrigin(0.5);
      layer.add(holdLabel);
      layer.add(collapseLabel);
      const counter = { v: 0 };
      this.tweens.add({
        targets: counter,
        v: 1,
        duration: 900,
        ease: 'Cubic.easeOut',
        onUpdate: () => {
          const t = counter.v;
          const sweepHold = Phaser.Math.DegToRad(360 * (holdPct / 100) * t);
          const sweepAll = Phaser.Math.DegToRad(360 * t);
          const start = -Math.PI / 2;
          donut.clear();
          donut.lineStyle(16, 0x3f9d5a, 1);
          donut.beginPath();
          donut.arc(cx, cy, radius, start, start + sweepHold, false);
          donut.strokePath();
          donut.lineStyle(16, 0xd64545, 1);
          donut.beginPath();
          donut.arc(cx, cy, radius, start + sweepHold, start + sweepAll, false);
          donut.strokePath();
          const p = Math.round(holdPct * t);
          centerLabel.setText(`${p}%`);
          holdLabel.setText(`HOLD ${p}%`);
          collapseLabel.setText(`COLLAPSE ${Math.round(100 * t) - p}%`);
        },
      });

      // Accuracy + rank row.
      const acc = result?.accuracy ?? null;
      const rank = result?.rankTopPct ?? null;
      if (acc !== null) {
        const rankStr = rank !== null ? `   ·   Rank: Top ${rank}%` : '';
        layer.add(
          this.mkText(W / 2, 392, `Your accuracy: ${acc}%${rankStr}`, 16, '#ffffff', {
            fontFamily: 'Arial, sans-serif',
          }).setOrigin(0.5)
        );
      }

      // Recent results: last 9 games as H/C dots.
      const recent = result?.recent ?? '';
      if (recent.length > 0) {
        const startX = W / 2 - ((recent.length - 1) * 26) / 2;
        for (let i = 0; i < recent.length; i++) {
          const ch = recent[i] ?? 'h';
          const wasCorrect = ch === ch.toUpperCase();
          const dot = this.add.circle(startX + i * 26, 422, 10, wasCorrect ? 0x3f9d5a : 0xd64545);
          layer.add(dot);
          layer.add(
            this.mkText(startX + i * 26, 422, ch.toUpperCase(), 11, '#ffffff').setOrigin(0.5)
          );
        }
      }

      layer.add(
        this.mkText(W / 2, 508, 'Come back tomorrow - new bridge daily.', 14, '#ffd98a', {
          fontFamily: 'Arial, sans-serif',
        }).setOrigin(0.5)
      );
    }

    // Action buttons (top-level so hit areas work).
    if (this.practice) {
      this.makeButton(
        W / 2,
        420,
        '▶  NEXT BRIDGE',
        0xe8892c,
        0xb5661c,
        () => this.scene.restart({ practice: true }),
        340,
        58,
        22
      ).setDepth(85);
      const best = Number(this.registry.get('practiceBest') ?? 0);
      layer.add(
        this.mkText(W / 2, 470, `Session best: ${best}`, 15, '#b8a88f', {
          fontFamily: 'Arial, sans-serif',
        }).setOrigin(0.5)
      );
    } else {
      this.makeButton(
        W / 2 - 108,
        466,
        '▶  PRACTICE',
        0xe8892c,
        0xb5661c,
        () => this.scene.restart({ practice: true }),
        200,
        52,
        18
      ).setDepth(85);
      this.makeButton(
        W / 2 + 112,
        466,
        '🏆  LEADERBOARD',
        0x6b4c3a,
        0x4a3527,
        () => void this.showLeaderboard(),
        220,
        52,
        16
      ).setDepth(85);
    }

    if (!this.practice && !this.initData?.loggedIn) {
      layer.add(
        this.mkText(W / 2, 540, 'Log in to Reddit to keep a streak.', 14, '#cccccc', {
          fontFamily: 'Arial, sans-serif',
        }).setOrigin(0.5)
      );
    }
  }

  // ---------- leaderboard ----------

  private async showLeaderboard() {
    let data: LeaderboardResponse | null = null;
    try {
      const res = await fetch('/api/leaderboard');
      const json = (await res.json()) as LeaderboardResponse | { status: string };
      if ('type' in json && json.type === 'leaderboard') data = json;
    } catch {
      data = null;
    }

    const layer = this.add.container(0, 0).setDepth(130);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x1a120c, 0.6).setInteractive();
    layer.add(dim);
    const card = this.add.graphics();
    card.fillStyle(0x241c16, 0.97);
    card.fillRoundedRect(170, 120, W - 340, 360, 22);
    card.lineStyle(2, 0xe8892c, 0.6);
    card.strokeRoundedRect(170, 120, W - 340, 360, 22);
    layer.add(card);
    layer.add(this.mkText(W / 2, 158, '🏆 STREAK LEADERBOARD', 22, '#ffd98a').setOrigin(0.5));

    if (!data || data.top.length === 0) {
      layer.add(
        this.mkText(W / 2, 280, data ? 'No streaks yet.\nBe the first!' : 'Could not load.', 18, '#ffffff', {
          fontFamily: 'Arial, sans-serif',
          align: 'center',
        }).setOrigin(0.5)
      );
    } else {
      data.top.forEach((row, i) => {
        const y = 200 + i * 40;
        const isYou = data?.you?.username === row.username;
        if (isYou) {
          const hl = this.add.graphics();
          hl.fillStyle(0xe8892c, 0.18);
          hl.fillRoundedRect(190, y - 16, W - 380, 32, 8);
          layer.add(hl);
        }
        layer.add(this.mkText(212, y, `${i + 1}.`, 17, '#b8a88f').setOrigin(0, 0.5));
        layer.add(
          this.mkText(244, y, `u/${row.username}`, 17, isYou ? '#ffd98a' : '#ffffff', {
            fontFamily: 'Arial, sans-serif',
          }).setOrigin(0, 0.5)
        );
        layer.add(this.mkText(W - 212, y, `${row.streak} 🔥`, 17, '#ffffff').setOrigin(1, 0.5));
      });
      if (data.you && !data.top.some((r) => r.username === data?.you?.username)) {
        const y = 200 + 5 * 40;
        layer.add(
          this.mkText(244, y, `u/${data.you.username} - you`, 16, '#ffd98a', {
            fontFamily: 'Arial, sans-serif',
          }).setOrigin(0, 0.5)
        );
        layer.add(this.mkText(W - 212, y, `${data.you.streak} 🔥`, 16, '#ffd98a').setOrigin(1, 0.5));
      }
    }

    const close = this.makeButton(
      W / 2,
      440,
      'CLOSE',
      0x6b4c3a,
      0x4a3527,
      () => {
        close.destroy();
        layer.destroy();
      },
      180,
      46,
      17
    );
    close.setDepth(131);
    dim.on('pointerdown', () => {
      close.destroy();
      layer.destroy();
    });
  }
}
