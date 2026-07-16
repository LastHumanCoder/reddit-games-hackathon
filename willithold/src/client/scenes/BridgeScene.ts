import * as Phaser from 'phaser';
import type {
  Crowd,
  Guess,
  InitResponse,
  Outcome,
  ResultResponse,
} from '../../shared/api';

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
  }

  create() {
    this.makeTextures();
    this.drawBackdrop();
    this.addAmbientLife();

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
      // Cargo bed (left 2/3).
      g.fillStyle(0xb03a3a, 1);
      g.fillRoundedRect(0, 10, 52, 24, 3);
      g.fillStyle(0xc94747, 1);
      g.fillRoundedRect(2, 12, 48, 12, 2);
      // Cab (right 1/3), slightly taller.
      g.fillStyle(0xd64545, 1);
      g.fillRoundedRect(50, 2, 32, 32, 4);
      // Window.
      g.fillStyle(0xbfe3ef, 1);
      g.fillRoundedRect(58, 6, 18, 12, 3);
      // Bumper.
      g.fillStyle(0x8a2f2f, 1);
      g.fillRect(78, 26, 6, 8);
      g.generateTexture('truck', 84, 36);
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

    // Water at the bottom of the ravine.
    g.fillStyle(0x40616f, 1);
    g.fillRect(GAP_LEFT - 30, WATER_Y, GAP_RIGHT - GAP_LEFT + 60, H - WATER_Y);
    g.lineStyle(2, 0x6d8d9a, 0.7);
    g.lineBetween(GAP_LEFT, WATER_Y + 8, GAP_LEFT + 120, WATER_Y + 8);
    g.lineBetween(GAP_LEFT + 190, WATER_Y + 16, GAP_LEFT + 330, WATER_Y + 16);
    g.lineBetween(GAP_LEFT + 90, WATER_Y + 26, GAP_LEFT + 240, WATER_Y + 26);

    // Cliff columns with stone joints.
    const cliffTop = DECK_Y + 14;
    g.fillStyle(0x5b4232, 1);
    g.fillRect(0, cliffTop, GAP_LEFT, H - cliffTop);
    g.fillRect(GAP_RIGHT, cliffTop, W - GAP_RIGHT, H - cliffTop);
    g.lineStyle(2, 0x4a3527, 0.6);
    const stoneRand = mulberry32(7);
    for (let y = cliffTop + 22; y < H - 20; y += 26) {
      const jL = stoneRand() * 14;
      const jR = stoneRand() * 14;
      g.lineBetween(0, y + jL, GAP_LEFT - 6, y + jL * 0.6);
      g.lineBetween(GAP_RIGHT + 6, y + jR * 0.6, W, y + jR);
      g.lineBetween(40 + stoneRand() * 90, y + jL, 40 + stoneRand() * 90, y + jL + 20);
      g.lineBetween(
        GAP_RIGHT + 30 + stoneRand() * 100,
        y + jR,
        GAP_RIGHT + 30 + stoneRand() * 100,
        y + jR + 20
      );
    }
    // Bedrock strip.
    g.fillStyle(0x35261b, 1);
    g.fillRect(0, H - 34, W, 34);

    // Grass tufts along cliff edges.
    g.fillStyle(0x7d8f4e, 1);
    const tuftRand = mulberry32(13);
    const tuft = (x: number) => {
      const s = 3 + tuftRand() * 3;
      g.fillTriangle(x, DECK_Y, x - s, DECK_Y + 1, x - s * 0.4, DECK_Y - s * 2);
      g.fillTriangle(x, DECK_Y, x + s, DECK_Y + 1, x + s * 0.4, DECK_Y - s * 1.6);
    };
    for (let x = 14; x < GAP_LEFT - 20; x += 22 + tuftRand() * 26) tuft(x);
    for (let x = GAP_RIGHT + 18; x < W - 10; x += 22 + tuftRand() * 26) tuft(x);

    // Cable towers.
    g.fillStyle(0x4a3527, 1);
    g.fillRect(GAP_LEFT - 14, DECK_Y - 96, 14, 96);
    g.fillRect(GAP_RIGHT, DECK_Y - 96, 14, 96);
    g.fillStyle(0x6b4c3a, 1);
    g.fillRect(GAP_LEFT - 16, DECK_Y - 100, 18, 6);
    g.fillRect(GAP_RIGHT - 2, DECK_Y - 100, 18, 6);
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

  /** Cables drawn with a slight sag curve, re-drawn every frame. */
  private drawCables() {
    if (!this.cableG) return;
    this.cableG.clear();
    this.cableG.lineStyle(2.5, 0x4a3527, 1);
    for (const { plank, ax, ay } of this.supports) {
      const px = plank.position.x;
      const py = plank.position.y - 5;
      const midX = (ax + px) / 2;
      const midY = (ay + py) / 2 + 8; // sag
      this.cableG.beginPath();
      this.cableG.moveTo(ax, ay);
      for (let t = 0.125; t <= 1.001; t += 0.125) {
        const it = 1 - t;
        const x = it * it * ax + 2 * it * t * midX + t * t * px;
        const y = it * it * ay + 2 * it * t * midY + t * t * py;
        this.cableG.lineTo(x, y);
      }
      this.cableG.strokePath();
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
    const promptStr = this.practice
      ? 'PRACTICE BRIDGE\nNo stakes. Call it anyway.'
      : 'The truck is about to cross.\nCall it.';
    const prompt = this.mkText(W / 2, 90, promptStr, 30, '#3c2415', { align: 'center' }).setOrigin(
      0.5
    );

    const holdBtn = this.makeButton(W / 2, 470, '🟢  HOLD', 0x3f9d5a, 0x2c6e3f, () => {
      void this.choose('hold');
    });
    const collapseBtn = this.makeButton(W / 2, 560, '🔴  COLLAPSE', 0xd64545, 0xa83232, () => {
      void this.choose('collapse');
    });
    this.buttonItems = [prompt, holdBtn, collapseBtn];

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

    if (outcome === 'collapse') {
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

    const bg = this.add.graphics();
    bg.fillStyle(0x2e2622, 0.85);
    bg.fillRoundedRect(60, 88, W - 120, 424, 24);
    layer.add(bg);

    if (this.practice) {
      const badge = this.mkText(W / 2, 112, 'PRACTICE', 14, '#2e2622');
      badge.setOrigin(0.5).setBackgroundColor('#ffd98a').setPadding(8, 3, 8, 3);
      layer.add(badge);
    }

    const held = finalOutcome === 'hold';
    const title = this.mkText(
      W / 2,
      166,
      held ? 'IT HELD' : 'IT COLLAPSED',
      54,
      held ? '#7fe08a' : '#ff7a7a'
    ).setOrigin(0.5);
    layer.add(title);
    // Slam-in.
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
    const you = this.mkText(W / 2, 226, youLine, 22, '#ffffff', {
      fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);
    layer.add(you);

    // Pulsing streak flame.
    if (correct && streak > 0) {
      const flame = this.mkText(W / 2 + you.width / 2 + 20, 226, '🔥', 22, '#ffffff').setOrigin(0.5);
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
      this.mkText(W / 2, 266, `“${roast}”`, 18, '#ffd98a', {
        fontFamily: 'Georgia, serif',
        fontStyle: 'italic',
        wordWrap: { width: W - 200 },
        align: 'center',
      }).setOrigin(0.5)
    );

    // Crowd split bar with animated fill + count-up (daily mode only).
    if (!this.practice) {
      const total = crowd.hold + crowd.collapse;
      const holdPct = total > 0 ? Math.round((crowd.hold / total) * 100) : 50;
      const barX = 140;
      const barW = W - 280;
      const barY = 326;
      const bar = this.add.graphics();
      layer.add(bar);
      const label = this.mkText(W / 2, barY - 20, '', 16, '#ffffff', {
        fontFamily: 'Arial, sans-serif',
      }).setOrigin(0.5);
      layer.add(label);
      const counter = { v: 0 };
      this.tweens.add({
        targets: counter,
        v: holdPct,
        duration: 900,
        ease: 'Cubic.easeOut',
        onUpdate: () => {
          const pct = counter.v;
          bar.clear();
          bar.fillStyle(0x3f9d5a, 1);
          bar.fillRoundedRect(barX, barY, Math.max(8, (barW * pct) / 100), 26, 8);
          bar.fillStyle(0xd64545, 1);
          bar.fillRoundedRect(
            barX + (barW * pct) / 100,
            barY,
            Math.max(8, barW * (1 - pct / 100)),
            26,
            8
          );
          label.setText(
            total > 0
              ? `${Math.round(pct)}% of the crowd said HOLD (${total} calls)`
              : 'You were first on the scene.'
          );
        },
      });

      layer.add(
        this.mkText(W / 2, 386, 'Come back tomorrow - new bridge daily.', 18, '#ffd98a', {
          fontFamily: 'Arial, sans-serif',
        }).setOrigin(0.5)
      );
    }

    // Practice loop button (kept top-level so its hit area works).
    const btnLabel = this.practice ? '▶  NEXT BRIDGE' : '▶  PLAY PRACTICE BRIDGES';
    this.makeButton(
      W / 2,
      452,
      btnLabel,
      0xe8892c,
      0xb5661c,
      () => {
        this.scene.restart({ practice: true });
      },
      380,
      58,
      22
    ).setDepth(85);

    if (!this.practice && !this.initData?.loggedIn) {
      layer.add(
        this.mkText(W / 2, 496, 'Log in to Reddit to keep a streak.', 14, '#cccccc', {
          fontFamily: 'Arial, sans-serif',
        }).setOrigin(0.5)
      );
    }
  }
}
