/**
 * Particle System
 * ===============
 * Lightweight, pooled particle emitter.
 *
 * Particle types:
 *   'spark'   – bright glinting sparks from sword hits / parries
 *   'void'    – dark purple void motes that linger
 *   'blood'   – red/orange burst (enemy damage)
 *   'soul'    – glowing blue soul shards (soul pickup)
 *   'trail'   – sword-swing light trail segments
 *   'dust'    – grey dust from landing / dashing
 *   'explosion' – large fiery burst
 */
class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  // ── Emitters ──────────────────────────────────────────────────────────────

  /** Generic emit. Most emitters call this internally. */
  emit(x, y, opts = {}) {
    const count = opts.count ?? 1;
    for (let i = 0; i < count; i++) {
      const angle  = (opts.angle ?? Math.random() * Math.PI * 2) +
                     (Math.random() - 0.5) * (opts.spread ?? Math.PI * 2);
      const speed  = (opts.speed ?? 3) * (0.5 + Math.random() * 0.5);
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life:     opts.life    ?? 30,
        maxLife:  opts.life    ?? 30,
        size:     opts.size    ?? 3,
        color:    opts.color   ?? '#ffffff',
        color2:   opts.color2  ?? null,   // fade-to colour (optional)
        gravity:  opts.gravity ?? 0.15,
        friction: opts.friction ?? 0.92,
        glow:     opts.glow    ?? false,
        type:     opts.type    ?? 'generic',
      });
    }
  }

  /** Sparks flying from a sword hit or parry */
  sparks(x, y, dir = 1, count = 10) {
    this.emit(x, y, {
      count,
      angle:   dir > 0 ? 0 : Math.PI,
      spread:  Math.PI * 0.9,
      speed:   5,
      life:    20,
      size:    2,
      color:   '#ffe080',
      color2:  '#ff8020',
      gravity: 0.2,
      friction: 0.88,
      glow:    true,
      type:    'spark',
    });
  }

  /** Void / dark-magic particles */
  void(x, y, count = 8) {
    this.emit(x, y, {
      count,
      speed:   2,
      life:    40,
      size:    4,
      color:   '#8040d0',
      color2:  '#200030',
      gravity: -0.03,   // float upward slightly
      friction: 0.96,
      glow:    true,
      type:    'void',
    });
  }

  /** Damage burst – red/orange shards */
  blood(x, y, count = 12) {
    this.emit(x, y, {
      count,
      speed:   4,
      life:    25,
      size:    3,
      color:   '#ff4020',
      color2:  '#800010',
      gravity: 0.25,
      friction: 0.88,
      type:    'blood',
    });
  }

  /** Soul / mana pickup */
  soul(x, y, count = 6) {
    this.emit(x, y, {
      count,
      speed:   2,
      life:    35,
      size:    3,
      color:   '#40c0ff',
      color2:  '#0050a0',
      gravity: -0.05,
      friction: 0.95,
      glow:    true,
      type:    'soul',
    });
  }

  /** Landing / dash dust puffs */
  dust(x, y, count = 6) {
    this.emit(x, y, {
      count,
      angle:   -Math.PI / 2,
      spread:  Math.PI * 0.8,
      speed:   2,
      life:    20,
      size:    4,
      color:   '#888888',
      color2:  '#333333',
      gravity: -0.02,
      friction: 0.94,
      type:    'dust',
    });
  }

  /** Explosion – large burst */
  explosion(x, y, count = 20) {
    this.emit(x, y, {
      count,
      speed:   7,
      life:    40,
      size:    5,
      color:   '#ff9020',
      color2:  '#ff2000',
      gravity: 0.1,
      friction: 0.90,
      glow:    true,
      type:    'explosion',
    });
    // Add some void motes too
    this.void(x, y, 6);
  }

  /** Sword-swing trail segment */
  trail(x, y, color = '#c0a0ff') {
    this.emit(x, y, {
      count:   1,
      speed:   0.5,
      life:    12,
      size:    6,
      color,
      gravity: 0,
      friction: 1.0,
      glow:    true,
      type:    'trail',
    });
  }

  /** Boss phase-transition burst */
  bossPhase(x, y) {
    this.explosion(x, y, 30);
    this.emit(x, y, {
      count:   20,
      speed:   5,
      life:    60,
      size:    6,
      color:   '#ff4080',
      color2:  '#400020',
      gravity: -0.05,
      friction: 0.94,
      glow:    true,
      type:    'bossPhase',
    });
  }

  // ── Update & Draw ─────────────────────────────────────────────────────────

  update() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x  += p.vx;
      p.y  += p.vy;
      p.vy += p.gravity;
      p.vx *= p.friction;
      p.vy *= p.friction;
      p.life--;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  draw(ctx) {
    ctx.save();
    for (const p of this.particles) {
      const t     = p.life / p.maxLife;          // 1→0 as particle dies
      const alpha = t;
      const size  = p.size * (p.type === 'trail' ? t : Math.max(0.3, t));

      // Lerp colour if color2 specified
      let color = p.color;
      if (p.color2) {
        color = lerpColor(p.color, p.color2, 1 - t);
      }

      ctx.globalAlpha = alpha;

      if (p.glow) {
        ctx.shadowBlur  = size * 3;
        ctx.shadowColor = color;
      } else {
        ctx.shadowBlur = 0;
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, size), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

// ── Helper ────────────────────────────────────────────────────────────────

/** Linear interpolate between two hex colours. */
function lerpColor(hex1, hex2, t) {
  const r1 = parseInt(hex1.slice(1,3),16), g1 = parseInt(hex1.slice(3,5),16), b1 = parseInt(hex1.slice(5,7),16);
  const r2 = parseInt(hex2.slice(1,3),16), g2 = parseInt(hex2.slice(3,5),16), b2 = parseInt(hex2.slice(5,7),16);
  const r  = Math.round(r1 + (r2-r1)*t);
  const g  = Math.round(g1 + (g2-g1)*t);
  const b  = Math.round(b1 + (b2-b1)*t);
  return `rgb(${r},${g},${b})`;
}
