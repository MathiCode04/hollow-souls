/**
 * World / Level
 * =============
 * Manages:
 *   • Static platforms (solid tiles)
 *   • Destructible walls (cracked walls that can be broken to reveal secrets)
 *   • Secret rooms unlocked after wall destruction
 *   • Loot / pickups spawned from destroyed walls
 *
 * Collision helpers used by Player and Boss:
 *   world.resolvePlatformCollision(entity)
 *   world.resolveWallCollision(entity)
 */

// Tile size for all geometry
const TILE = 32;

class World {
  constructor() {
    this.width  = 3200;
    this.height = 720;

    // Flat ground platform
    this.platforms = [];

    // Destructible walls – { x, y, w, h, hp, maxHp, revealed }
    this.destructibleWalls = [];

    // Pickups spawned from secrets – { x, y, type, collected }
    //   types: 'health', 'soul', 'relic'
    this.pickups = [];

    this._buildLevel();
  }

  _buildLevel() {
    const W = this.width;
    const H = this.height;

    // ── Ground ────────────────────────────────────────────────────────────
    // Main floor
    this._addPlatform(0, H - TILE, W, TILE);

    // ── Platforms ─────────────────────────────────────────────────────────
    // Left starting area
    this._addPlatform(200, H - 4*TILE, 160, TILE);
    this._addPlatform(420, H - 6*TILE, 160, TILE);
    this._addPlatform(640, H - 4*TILE, 160, TILE);

    // Mid arena (where boss is)
    this._addPlatform(1200, H - 4*TILE, 128, TILE);
    this._addPlatform(1400, H - 6*TILE, 128, TILE);
    this._addPlatform(1600, H - 4*TILE, 128, TILE);

    // Right exploration zone
    this._addPlatform(2100, H - 5*TILE, 192, TILE);
    this._addPlatform(2400, H - 8*TILE, 128, TILE);
    this._addPlatform(2600, H - 5*TILE, 160, TILE);
    this._addPlatform(2850, H - 6*TILE, 128, TILE);

    // ── Walls / Ceilings ──────────────────────────────────────────────────
    // Left wall
    this._addPlatform(0, 0, TILE, H);
    // Right wall
    this._addPlatform(W - TILE, 0, TILE, H);
    // Ceiling
    this._addPlatform(0, 0, W, TILE);

    // ── Destructible Walls ────────────────────────────────────────────────
    // Each cracked wall has 3 HP
    this._addDestructibleWall(900,  H - 5*TILE, TILE*2, TILE*4, 3);   // before mid-arena
    this._addDestructibleWall(2000, H - TILE,   TILE*3, TILE,   3);   // floor crack (secret pit)
    this._addDestructibleWall(3000, H - 6*TILE, TILE*2, TILE*5, 3);   // far-right wall

    // ── Spikes (drawn as damage tiles, not blocking geometry) ─────────────
    this.spikes = [
      { x: 800,  y: H - TILE, w: 96,  h: 12 },
      { x: 1800, y: H - TILE, w: 64,  h: 12 },
      { x: 2750, y: H - TILE, w: 128, h: 12 },
    ];

    // ── Boss arena wall (blocks passage until boss is defeated) ───────────
    this.bossGate = { x: 1050, y: H - TILE*10, w: TILE, h: TILE*9, broken: false };
  }

  _addPlatform(x, y, w, h) {
    this.platforms.push({ x, y, w, h });
  }

  _addDestructibleWall(x, y, w, h, hp) {
    this.destructibleWalls.push({ x, y, w, h, hp, maxHp: hp, revealed: false });
  }

  // ── Collision Helpers ─────────────────────────────────────────────────────

  /**
   * Resolve AABB collision between an entity and all solid platforms.
   * Entity must have: { x, y, w, h, vx, vy, onGround }
   */
  resolvePlatformCollision(entity) {
    entity.onGround = false;
    const solids = [...this.platforms];
    if (!this.bossGate.broken) solids.push(this.bossGate);

    for (const p of solids) {
      if (!this._overlaps(entity, p)) continue;

      const overlapX = this._overlapX(entity, p);
      const overlapY = this._overlapY(entity, p);

      if (overlapY < overlapX) {
        // Vertical resolution
        if (entity.y + entity.h / 2 < p.y + p.h / 2) {
          entity.y  = p.y - entity.h;
          entity.vy = 0;
          entity.onGround = true;
        } else {
          entity.y  = p.y + p.h;
          entity.vy = 0;
        }
      } else {
        // Horizontal resolution
        if (entity.x + entity.w / 2 < p.x + p.w / 2) {
          entity.x  = p.x - entity.w;
        } else {
          entity.x  = p.x + p.w;
        }
        entity.vx = 0;
      }
    }
  }

  /**
   * Check if an attack hitbox overlaps a destructible wall.
   * If it does, deal 1 damage to the wall.
   * Returns the wall that was hit (or null).
   */
  hitDestructibleWall(hitbox) {
    for (const wall of this.destructibleWalls) {
      if (wall.hp <= 0) continue;
      if (this._overlaps(hitbox, wall)) {
        wall.hp--;
        if (wall.hp <= 0) {
          this._revealSecret(wall);
        }
        return wall;
      }
    }
    return null;
  }

  _revealSecret(wall) {
    wall.revealed = true;
    // Spawn loot near the wall
    this.pickups.push({
      x:         wall.x + wall.w / 2 - 12,
      y:         wall.y - 40,
      type:      'relic',
      collected: false,
    });
    this.pickups.push({
      x:         wall.x + wall.w / 2 + 20,
      y:         wall.y - 40,
      type:      'soul',
      collected: false,
    });
  }

  /** Collect pickups that the player overlaps. Returns array of collected types. */
  collectPickups(player) {
    const collected = [];
    for (const pk of this.pickups) {
      if (pk.collected) continue;
      if (this._overlaps(player, { x: pk.x, y: pk.y, w: 24, h: 24 })) {
        pk.collected = true;
        collected.push(pk.type);
      }
    }
    return collected;
  }

  /** Returns true if entity overlaps any spike region. */
  onSpike(entity) {
    for (const sp of this.spikes) {
      if (this._overlaps(entity, sp)) return true;
    }
    return false;
  }

  // ── Geometry Helpers ──────────────────────────────────────────────────────
  _overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
  }
  _overlapX(a, b) {
    const rightA = a.x + a.w, rightB = b.x + b.w;
    return Math.min(rightA, rightB) - Math.max(a.x, b.x);
  }
  _overlapY(a, b) {
    const botA = a.y + a.h, botB = b.y + b.h;
    return Math.min(botA, botB) - Math.max(a.y, b.y);
  }

  // ── Draw ──────────────────────────────────────────────────────────────────
  draw(ctx) {
    const H = this.height;

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0,   '#0a0515');
    grad.addColorStop(0.5, '#0f0a1e');
    grad.addColorStop(1,   '#050210');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, H);

    // Draw ambient "stars"
    ctx.fillStyle = 'rgba(200,180,255,0.4)';
    // (seeded deterministic stars)
    for (let i = 0; i < 80; i++) {
      const sx = ((i * 397 + 13)  % this.width);
      const sy = ((i * 251 + 7)   % (H * 0.7));
      ctx.fillRect(sx, sy, 1, 1);
    }

    // Platforms
    for (const p of this.platforms) {
      this._drawPlatform(ctx, p);
    }

    // Boss gate
    if (!this.bossGate.broken) {
      const g = this.bossGate;
      ctx.fillStyle = '#1a0830';
      ctx.fillRect(g.x, g.y, g.w, g.h);
      ctx.strokeStyle = '#6020a0';
      ctx.lineWidth = 2;
      ctx.strokeRect(g.x, g.y, g.w, g.h);
      // Rune decoration
      ctx.fillStyle = '#a040ff';
      ctx.font = 'bold 20px serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚔', g.x + g.w/2, g.y + g.h/2);
    }

    // Destructible walls
    for (const wall of this.destructibleWalls) {
      if (wall.hp <= 0) continue;
      const dmgRatio = 1 - wall.hp / wall.maxHp;
      const col = dmgRatio > 0.5 ? '#4a2010' : '#2a1520';
      ctx.fillStyle = col;
      ctx.fillRect(wall.x, wall.y, wall.w, wall.h);

      // Crack lines based on damage
      ctx.strokeStyle = `rgba(200,100,50,${0.3 + dmgRatio * 0.7})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(wall.x + wall.w*0.3, wall.y);
      ctx.lineTo(wall.x + wall.w*0.5, wall.y + wall.h*0.4);
      ctx.lineTo(wall.x + wall.w*0.7, wall.y + wall.h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(wall.x + wall.w*0.6, wall.y);
      ctx.lineTo(wall.x + wall.w*0.4, wall.y + wall.h*0.6);
      ctx.stroke();

      // HP indicator
      ctx.fillStyle = '#ff6030';
      const barW = wall.w * (wall.hp / wall.maxHp);
      ctx.fillRect(wall.x, wall.y - 6, barW, 3);
    }

    // Spikes
    for (const sp of this.spikes) {
      ctx.fillStyle = '#c04020';
      const spCount = Math.floor(sp.w / 12);
      for (let i = 0; i < spCount; i++) {
        const sx = sp.x + i * 12 + 6;
        ctx.beginPath();
        ctx.moveTo(sx - 5, sp.y + sp.h);
        ctx.lineTo(sx,     sp.y);
        ctx.lineTo(sx + 5, sp.y + sp.h);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Pickups
    for (const pk of this.pickups) {
      if (pk.collected) continue;
      ctx.save();
      if (pk.type === 'relic') {
        ctx.fillStyle = '#ffd060';
        ctx.shadowBlur  = 10;
        ctx.shadowColor = '#ffd060';
        ctx.font = '20px serif';
        ctx.textAlign = 'center';
        ctx.fillText('◈', pk.x + 12, pk.y + 18);
      } else if (pk.type === 'soul') {
        ctx.fillStyle = '#40c0ff';
        ctx.shadowBlur  = 8;
        ctx.shadowColor = '#40c0ff';
        ctx.beginPath();
        ctx.arc(pk.x + 12, pk.y + 12, 6, 0, Math.PI * 2);
        ctx.fill();
      } else if (pk.type === 'health') {
        ctx.fillStyle = '#ff4060';
        ctx.shadowBlur  = 8;
        ctx.shadowColor = '#ff4060';
        ctx.font = '18px serif';
        ctx.textAlign = 'center';
        ctx.fillText('♥', pk.x + 12, pk.y + 16);
      }
      ctx.restore();
    }
  }

  _drawPlatform(ctx, p) {
    // Surface (top 4px)
    ctx.fillStyle = '#2a1540';
    ctx.fillRect(p.x, p.y, p.w, p.h);

    // Top edge highlight
    ctx.fillStyle = '#5a3080';
    ctx.fillRect(p.x, p.y, p.w, 4);

    // Subtle inner glow on top edge
    ctx.fillStyle = 'rgba(160,80,255,0.15)';
    ctx.fillRect(p.x, p.y + 4, p.w, 6);
  }
}
