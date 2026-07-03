import * as Phaser from 'phaser';
import type { TownSnapshotResponse } from '../../shared/api';
import type { Citizen } from '../../shared/types';
import { CitizenSprite, createCitizenSprite } from '../world/CitizenSprite';
import { BUILDINGS, PALETTE, TREES, WORLD_H, WORLD_W, mulberry32 } from '../world/layout';
import { initUi, setSnapshot, showError } from '../ui';

const BUILDING_LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'Georgia, serif',
  fontSize: '19px',
  fontStyle: 'italic',
  color: '#5c4f3f',
};

export class Town extends Phaser.Scene {
  private citizenSprites = new Map<string, CitizenSprite>();
  private dragStart: { x: number; y: number; sx: number; sy: number } | null = null;

  constructor() {
    super('Town');
  }

  create() {
    this.drawWorld();
    this.setupCamera();

    initUi({
      onClaimed: (citizen) => this.spawnCitizen(citizen, true),
    });

    void this.loadTown();
  }

  private async loadTown(): Promise<void> {
    try {
      const res = await fetch('/api/town');
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = (await res.json()) as TownSnapshotResponse;
      setSnapshot(data);
      for (const citizen of data.citizens) {
        this.spawnCitizen(citizen, false);
      }
    } catch (error) {
      console.error('Failed to load town:', error);
      showError('The town is napping. Pull to refresh.');
    }
  }

  private spawnCitizen(citizen: Citizen, isMine: boolean): void {
    if (this.citizenSprites.has(citizen.id)) return;
    createCitizenSprite(this, citizen, (sprite) => {
      this.citizenSprites.set(citizen.id, sprite);
      if (isMine) {
        this.cameras.main.pan(sprite.x, sprite.y, 900, 'Sine.easeInOut');
        this.celebrateAt(sprite.x, sprite.y - 40);
      }
    });
  }

  /** Confetti burst when a citizen is claimed. */
  private celebrateAt(x: number, y: number): void {
    const colors = [0xe8a15c, 0x7fb069, 0xb08968, 0x9d6b9e, 0xf2c14e];
    for (let i = 0; i < 24; i++) {
      const color = colors[i % colors.length] ?? 0xf2c14e;
      const bit = this.add.rectangle(x, y, 8, 8, color).setDepth(10000);
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 160;
      this.tweens.add({
        targets: bit,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed + 60,
        angle: Math.random() * 360,
        alpha: 0,
        duration: 900 + Math.random() * 500,
        ease: 'Cubic.easeOut',
        onComplete: () => bit.destroy(),
      });
    }
  }

  private drawWorld(): void {
    const rng = mulberry32(7);

    // Ground
    this.add.rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, PALETTE.ground);

    // Sky band + rolling hills at the top
    this.add.rectangle(WORLD_W / 2, 130, WORLD_W, 260, PALETTE.sky);
    const hills = this.add.graphics();
    hills.fillStyle(PALETTE.hillFar, 1);
    hills.fillEllipse(220, 290, 620, 220);
    hills.fillEllipse(820, 300, 700, 260);
    hills.fillStyle(PALETTE.hillNear, 1);
    hills.fillEllipse(520, 350, 900, 260);

    // Grass patches for texture
    const grass = this.add.graphics();
    grass.fillStyle(PALETTE.grassPatch, 0.6);
    for (let i = 0; i < 40; i++) {
      grass.fillEllipse(rng() * WORLD_W, 380 + rng() * (WORLD_H - 420), 50 + rng() * 90, 18 + rng() * 14);
    }

    // Paths: plaza to each building door
    const paths = this.add.graphics();
    paths.lineStyle(30, PALETTE.path, 1);
    const plaza = BUILDINGS.plaza;
    for (const b of Object.values(BUILDINGS)) {
      if (b.id === 'plaza' || b.id === 'well') continue;
      const curve = new Phaser.Curves.QuadraticBezier(
        new Phaser.Math.Vector2(plaza.x, plaza.y + 20),
        new Phaser.Math.Vector2((plaza.x + b.door.x) / 2 + (rng() - 0.5) * 120, (plaza.y + b.door.y) / 2),
        new Phaser.Math.Vector2(b.door.x, b.door.y)
      );
      curve.draw(paths, 24);
    }

    // Buildings (depth-sorted by base y so citizens can pass in front/behind)
    for (const b of Object.values(BUILDINGS)) {
      const img = this.add.image(b.x, b.y, b.texture).setOrigin(0.5, 1);
      img.setDepth(b.id === 'plaza' ? 1 : b.y);
      if (b.id !== 'plaza' && b.id !== 'well') {
        this.add
          .text(b.x, b.y + 8, b.label, BUILDING_LABEL_STYLE)
          .setOrigin(0.5, 0)
          .setDepth(b.y);
        this.addChimneySmoke(b.x + 60, b.y - 200);
      }
    }

    // Trees
    for (const t of TREES) {
      this.add.image(t.x, t.y, 'tree').setOrigin(0.5, 1).setScale(t.s).setDepth(t.y);
    }

    // Drifting clouds
    for (let i = 0; i < 3; i++) {
      const cloud = this.add
        .image(rng() * WORLD_W, 60 + rng() * 120, 'cloud')
        .setAlpha(0.85)
        .setDepth(5)
        .setScale(0.8 + rng() * 0.6);
      this.tweens.add({
        targets: cloud,
        x: `+=${WORLD_W}`,
        duration: 90000 + rng() * 60000,
        repeat: -1,
        onRepeat: () => cloud.setX(-120),
      });
    }
  }

  private addChimneySmoke(x: number, y: number): void {
    this.time.addEvent({
      delay: 1400,
      loop: true,
      callback: () => {
        const puff = this.add.image(x, y, 'puff').setAlpha(0.5).setScale(0.5).setDepth(9000);
        this.tweens.add({
          targets: puff,
          y: y - 70 - Math.random() * 30,
          x: x + 14 + Math.random() * 18,
          scale: 1.4,
          alpha: 0,
          duration: 2600,
          ease: 'Sine.easeOut',
          onComplete: () => puff.destroy(),
        });
      },
    });
  }

  private setupCamera(): void {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.setBackgroundColor(PALETTE.sky);

    const applyZoom = () => {
      const zoom = Math.max(this.scale.width / WORLD_W, this.scale.height / WORLD_H);
      cam.setZoom(zoom);
    };
    applyZoom();
    cam.centerOn(WORLD_W / 2, BUILDINGS.plaza.y - 60);
    this.scale.on('resize', applyZoom);

    // Drag to pan
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragStart = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || !this.dragStart) return;
      cam.setScroll(
        this.dragStart.sx - (p.x - this.dragStart.x) / cam.zoom,
        this.dragStart.sy - (p.y - this.dragStart.y) / cam.zoom
      );
    });
    this.input.on('pointerup', () => {
      this.dragStart = null;
    });
  }

  override update(time: number, delta: number): void {
    for (const sprite of this.citizenSprites.values()) {
      sprite.tick(time, delta);
    }
  }
}
