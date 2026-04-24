/**
 * VoidBeast Boss — Cyber-Knight of the Hollow
 * ============================================
 * Full state machine with:
 *   • IDLE          — stands still, scanning
 *   • TELEGRAPH_*   — wind-up animation before each attack (fair warning)
 *   • SLASH         — fast horizontal sword swing
 *   • LEAP          — jumps at player, lands with shockwave
 *   • BULLET_HELL   — Phase 2 only: fires ring of void orbs
 *   • LASER         — Phase 2 only: charges and fires a laser beam
 *   • STAGGER       — brief stun after taking damage
 *   • PHASE_TRANS   — cinematic transition at 50% HP
 *   • DEAD          — death animation
 *
 * Phase 1  (HP > 50%): SLASH and LEAP
 * Phase 2  (HP ≤ 50%): faster SLASH, LEAP, BULLET_HELL, LASER
 *
 * Every attack is preceded by a TELEGRAPH_ state for ~40 frames so the
 * player can react.
 *
 * Telegraphing is shown via a glowing warning indicator and a charging aura.
 */

const BOSS_STATES = {
  IDLE:          'idle',
  TELEGRAPH_SLASH: 'telegraph_slash',
  SLASH:         'slash',
  TELEGRAPH_LEAP:'telegraph_leap',
  LEAP:          'leap',
  TELEGRAPH_BH:  'telegraph_bh',
  BULLET_HELL:   'bullet_hell',
  TELEGRAPH_LASER:'telegraph_laser',
  LASER:         'laser',
  STAGGER:       'stagger',
  PHASE_TRANS:   'phase_trans',
  DEAD:          'dead',
};

class VoidBeast {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.w = 80;
    this.h = 96;

    this.vx = 0;
    this.vy = 0;
    this.onGround = false;

    this.maxHealth = 30;
    this.health    = this.maxHealth;
    this.phase     = 1;            // 1 or 2
    this.dead      = false;
    this.defeated  = false;

    this.dir       = -1;           // facing direction

    // ── State Machine ─────────────────────────────────────────────────────
    this.state      = BOSS_STATES.IDLE;
    this.stateTimer = 0;           // frames remaining in current state
    this.idleTimer  = 60;          // countdown before choosing next attack

    // ── Hit-Flash ─────────────────────────────────────────────────────────
    this.hitFlash   = false;

    // ── Attack parameters ─────────────────────────────────────────────────
    // Slash hitbox (active only during SLASH state for a brief window)
    this.slashActive  = false;
    this.slashHitbox  = { x:0, y:0, w:0, h:0 };
    this.slashDamage  = 2;
    this.slashTimer   = 0;

    // Leap
    this.leaping      = false;

    // Bullet Hell — array of { x, y, vx, vy }
    this.orbs         = [];

    // Laser — { x1, y1, x2, y2, active, chargeTimer, fireTimer }
    this.laser        = { active: false, chargeTimer: 0, fireTimer: 0,
                          x: 0, y: 0, angle: 0 };

    // Phase transition animation
    this.phaseFlash   = 0;

    // Visual
    this.glowing      = false;     // turns on in Phase 2
    this.deathTimer   = 0;

    // Telegraph charge aura
    this.telegraphAura = 0;       // 0-1 intensity

    // Stagger
    this.staggerDuration = 40;

    // Attack cooldowns per attack type
    this._lastAttack = null;
  }

  // ════════════════════════════════════════════════════════════════════════
  // UPDATE
  // ════════════════════════════════════════════════════════════════════════
  update(world, player, particles) {
    if (this.dead) {
      this._updateDead(particles);
      return;
    }

    // Gravity
    this.vy += 0.4;
    this.x  += this.vx;
    this.y  += this.vy;
    world.resolvePlatformCollision(this);
    this.vx *= 0.85;

    // Face the player
    const dx = player.x + player.w/2 - (this.x + this.w/2);
    if (Math.abs(dx) > 4) this.dir = dx > 0 ? 1 : -1;

    switch (this.state) {
      case BOSS_STATES.IDLE:          this._updateIdle(player, particles); break;
      case BOSS_STATES.TELEGRAPH_SLASH: this._updateTelegraph('slash', particles); break;
      case BOSS_STATES.SLASH:         this._updateSlash(player, particles); break;
      case BOSS_STATES.TELEGRAPH_LEAP: this._updateTelegraph('leap', particles); break;
      case BOSS_STATES.LEAP:          this._updateLeap(player, particles); break;
      case BOSS_STATES.TELEGRAPH_BH:  this._updateTelegraph('bh', particles); break;
      case BOSS_STATES.BULLET_HELL:   this._updateBulletHell(player, particles); break;
      case BOSS_STATES.TELEGRAPH_LASER: this._updateTelegraph('laser', particles); break;
      case BOSS_STATES.LASER:         this._updateLaser(player, particles); break;
      case BOSS_STATES.STAGGER:       this._updateStagger(); break;
      case BOSS_STATES.PHASE_TRANS:   this._updatePhaseTransition(particles); break;
    }

    this._updateOrbs(player, particles, world);
  }

  // ── Idle ─────────────────────────────────────────────────────────────────
  _updateIdle(player) {
    this.idleTimer--;
    if (this.idleTimer <= 0) {
      this._chooseNextAttack(player);
    }
  }

  _chooseNextAttack(player) {
    const dx  = Math.abs(player.x - this.x);
    const available = ['slash', 'leap'];
    if (this.phase === 2) {
      available.push('bh', 'laser');
    }

    // Avoid repeating the same attack twice in a row
    let choices = available.filter(a => a !== this._lastAttack);
    if (choices.length === 0) choices = available;

    // Prefer leap when player is far
    let attack;
    if (dx > 300 && choices.includes('leap')) {
      attack = 'leap';
    } else {
      attack = choices[Math.floor(Math.random() * choices.length)];
    }

    this._lastAttack = attack;
    this._enterTelegraph(attack);
  }

  _enterTelegraph(attack) {
    const stateMap = {
      slash:  BOSS_STATES.TELEGRAPH_SLASH,
      leap:   BOSS_STATES.TELEGRAPH_LEAP,
      bh:     BOSS_STATES.TELEGRAPH_BH,
      laser:  BOSS_STATES.TELEGRAPH_LASER,
    };
    this.state        = stateMap[attack];
    this.stateTimer   = this.phase === 2 ? 28 : 42;  // Phase 2 telegraphs faster
    this.telegraphAura = 0;
    this._pendingAttack = attack;
  }

  // ── Generic Telegraph ─────────────────────────────────────────────────────
  _updateTelegraph(attack, particles) {
    this.stateTimer--;
    this.telegraphAura = 1 - this.stateTimer / 42;

    // Emit charge aura particles
    if (this.stateTimer % 4 === 0) {
      const cx = this.x + this.w/2, cy = this.y + this.h/2;
      particles.void(cx, cy, 2);
    }

    if (this.stateTimer <= 0) {
      this.telegraphAura = 0;
      this._enterAttack(attack);
    }
  }

  _enterAttack(attack) {
    const stateMap = {
      slash:  BOSS_STATES.SLASH,
      leap:   BOSS_STATES.LEAP,
      bh:     BOSS_STATES.BULLET_HELL,
      laser:  BOSS_STATES.LASER,
    };
    this.state      = stateMap[attack];
    this.stateTimer = 60;

    if (attack === 'slash') {
      this.slashActive = true;
      this.slashTimer  = 14;   // how many frames the hitbox is live
      const speed = this.phase === 2 ? 9 : 6;
      this.vx = this.dir * speed;
    }
    if (attack === 'leap') {
      this.vy = -14;
      this.vx = this.dir * 5;
    }
    if (attack === 'bh') {
      this._fireBulletHell();
    }
    if (attack === 'laser') {
      this.laser.active      = false;
      this.laser.chargeTimer = 40;
      this.laser.fireTimer   = 0;
    }
  }

  // ── Slash ─────────────────────────────────────────────────────────────────
  _updateSlash(player, particles) {
    this.stateTimer--;

    if (this.slashActive && this.slashTimer > 0) {
      this.slashTimer--;
      // Build slash hitbox in front of boss
      const reach = 90;
      this.slashHitbox = {
        x: this.dir > 0 ? this.x + this.w - 10 : this.x - reach + 10,
        y: this.y + 10,
        w: reach,
        h: this.h - 20,
      };

      // Emit sword-trail particles along hitbox
      if (this.slashTimer % 2 === 0) {
        particles.sparks(this.slashHitbox.x + this.slashHitbox.w/2,
                          this.slashHitbox.y + this.slashHitbox.h/2,
                          this.dir, 5);
      }

      // Damage player
      if (overlapsRect(this.slashHitbox, player) && !player.invulnerable) {
        player.takeDamage(this.slashDamage, this.dir, particles);
      }
    } else {
      this.slashActive = false;
    }

    if (this.stateTimer <= 0) this._returnToIdle();
  }

  // ── Leap ──────────────────────────────────────────────────────────────────
  _updateLeap(player, particles) {
    this.stateTimer--;

    // When boss lands (was in air, now on ground)
    if (this.onGround && this.stateTimer < 55) {
      this._leapLanding(player, particles);
      this._returnToIdle();
    }

    if (this.stateTimer <= 0) this._returnToIdle();
  }

  _leapLanding(player, particles) {
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h;
    // Shockwave radius
    const shockRange = this.phase === 2 ? 180 : 130;
    const dx = Math.abs(player.x + player.w/2 - cx);
    const dy = Math.abs(player.y + player.h/2 - cy);

    GameFeel.shake(this.phase === 2 ? 10 : 7, 0.6);
    particles.explosion(cx, cy, 15);

    if (dx < shockRange && dy < 60 && !player.invulnerable) {
      player.takeDamage(1, this.dir, particles);
      // Launch player upward
      player.vy = -8;
    }
  }

  // ── Bullet Hell ───────────────────────────────────────────────────────────
  _fireBulletHell() {
    const cx = this.x + this.w/2;
    const cy = this.y + this.h/2;
    const count = this.phase === 2 ? 12 : 8;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i;
      const speed = this.phase === 2 ? 4.5 : 3;
      this.orbs.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 8,
        life: 120,
        damage: 1,
      });
    }
  }

  _updateBulletHell(player, particles) {
    this.stateTimer--;
    if (this.stateTimer <= 0) this._returnToIdle();
  }

  _updateOrbs(player, particles, world) {
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.x += o.vx;
      o.y += o.vy;
      o.life--;

      // Emit a trail
      if (o.life % 3 === 0) {
        particles.void(o.x, o.y, 1);
      }

      // Hit player
      const orbHitbox = { x: o.x - o.r, y: o.y - o.r, w: o.r*2, h: o.r*2 };
      if (overlapsRect(orbHitbox, player) && !player.invulnerable) {
        player.takeDamage(o.damage, 0, particles);
        particles.explosion(o.x, o.y, 6);
        this.orbs.splice(i, 1);
        continue;
      }

      // Check platform collision (destroy on hit)
      for (const p of world.platforms) {
        if (overlapsRect(orbHitbox, p)) {
          particles.explosion(o.x, o.y, 4);
          this.orbs.splice(i, 1);
          break;
        }
      }

      if (o.life <= 0) {
        this.orbs.splice(i, 1);
      }
    }
  }

  // ── Laser ─────────────────────────────────────────────────────────────────
  _updateLaser(player, particles) {
    this.stateTimer--;

    if (this.laser.chargeTimer > 0) {
      this.laser.chargeTimer--;
      if (this.laser.chargeTimer % 5 === 0) {
        particles.void(this.x + this.w/2, this.y + this.h/2, 3);
      }
      if (this.laser.chargeTimer === 0) {
        // Fire!
        this.laser.active    = true;
        this.laser.fireTimer = 50;
        this.laser.x         = this.x + (this.dir > 0 ? this.w : 0);
        this.laser.y         = this.y + this.h * 0.35;
        this.laser.angle     = this.dir > 0 ? 0 : Math.PI;
        GameFeel.shake(6, 0.4);
      }
    }

    if (this.laser.active) {
      this.laser.fireTimer--;
      if (this.laser.fireTimer <= 0) {
        this.laser.active = false;
      }

      // Check laser vs player (AABB of laser beam)
      const laserW = 600;
      const laserH = 16;
      const laserBox = {
        x: this.dir > 0 ? this.laser.x          : this.laser.x - laserW,
        y: this.laser.y - laserH/2,
        w: laserW,
        h: laserH,
      };
      if (overlapsRect(laserBox, player) && !player.invulnerable) {
        player.takeDamage(2, this.dir, particles);
      }
      // Emit laser sparks
      if (this.laser.fireTimer % 3 === 0) {
        particles.sparks(laserBox.x + laserBox.w*0.7,
                          laserBox.y + laserBox.h/2, this.dir, 4);
      }
    }

    if (this.stateTimer <= 0) {
      this.laser.active = false;
      this._returnToIdle();
    }
  }

  // ── Stagger ───────────────────────────────────────────────────────────────
  _updateStagger() {
    this.stateTimer--;
    this.vx *= 0.8;
    if (this.stateTimer <= 0) this._returnToIdle();
  }

  // ── Phase Transition ──────────────────────────────────────────────────────
  _updatePhaseTransition(particles) {
    this.stateTimer--;
    this.phaseFlash = Math.sin(this.stateTimer * 0.4) * 0.5 + 0.5;

    if (this.stateTimer % 8 === 0) {
      particles.bossPhase(
        this.x + Math.random() * this.w,
        this.y + Math.random() * this.h
      );
    }

    if (this.stateTimer === 60) {
      GameFeel.shake(14, 0.5);
    }

    if (this.stateTimer <= 0) {
      this.phase       = 2;
      this.glowing     = true;
      this.phaseFlash  = 0;
      this.staggerDuration = 28;  // faster recovery in Phase 2
      this._returnToIdle(20);
    }
  }

  _returnToIdle(delay = 80) {
    this.state      = BOSS_STATES.IDLE;
    this.idleTimer  = delay;
    this.slashActive = false;
  }

  // ── Death ─────────────────────────────────────────────────────────────────
  _updateDead(particles) {
    this.deathTimer++;
    if (this.deathTimer % 6 === 0) {
      particles.explosion(
        this.x + Math.random() * this.w,
        this.y + Math.random() * this.h,
        8
      );
    }
    if (this.deathTimer > 90) {
      this.defeated = true;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // TAKE HIT (called by player attack)
  // ════════════════════════════════════════════════════════════════════════
  takeHit(damage, knockbackDir, particles) {
    // Invulnerable during phase transition and death
    if (this.state === BOSS_STATES.PHASE_TRANS || this.dead) return;

    this.health -= damage;
    GameFeel.hitStop(5);
    GameFeel.hitFlash(this, 7);
    GameFeel.shake(4, 0.5);
    particles.sparks(this.x + this.w/2, this.y + this.h/3, knockbackDir, 12);
    particles.void(this.x + this.w/2, this.y + this.h/3, 6);

    // Check phase transition at 50% HP (only once)
    if (this.phase === 1 && this.health <= this.maxHealth * 0.5) {
      this.health = Math.max(1, this.health);   // don't die during transition
      this._enterPhaseTransition(particles);
      return;
    }

    if (this.health <= 0) {
      this.dead  = true;
      this.state = BOSS_STATES.DEAD;
      GameFeel.shake(16, 0.4);
      particles.bossPhase(this.x + this.w/2, this.y + this.h/2);
      return;
    }

    // Stagger (only if not mid-transition or already staggering)
    if (this.state !== BOSS_STATES.STAGGER && this.state !== BOSS_STATES.PHASE_TRANS) {
      this.state      = BOSS_STATES.STAGGER;
      this.stateTimer = this.staggerDuration;
      this.vx         = knockbackDir * 4;
      this.vy         = -2;
    }
  }

  _enterPhaseTransition(particles) {
    this.state      = BOSS_STATES.PHASE_TRANS;
    this.stateTimer = 120;    // 2 seconds of cinematic
    GameFeel.shake(14, 0.5);
    particles.bossPhase(this.x + this.w/2, this.y + this.h/2);
    // Clear any active projectiles
    this.orbs        = [];
    this.laser.active = false;
    this.slashActive  = false;
  }

  // ── Getters ───────────────────────────────────────────────────────────────
  get isTelegraphing() {
    return this.state.startsWith('telegraph');
  }

  get attackHitbox() {
    if (this.slashActive) return this.slashHitbox;
    return null;
  }

  // ════════════════════════════════════════════════════════════════════════
  // DRAW
  // ════════════════════════════════════════════════════════════════════════
  draw(ctx) {
    if (this.defeated) return;

    ctx.save();

    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;

    // ── Phase transition flash ─────────────────────────────────────────────
    if (this.phaseFlash > 0) {
      ctx.globalAlpha = this.phaseFlash;
      ctx.fillStyle   = '#ff40a0';
      ctx.shadowBlur  = 40;
      ctx.shadowColor = '#ff40a0';
      ctx.fillRect(this.x - 10, this.y - 10, this.w + 20, this.h + 20);
      ctx.globalAlpha = 1;
    }

    // ── Telegraph aura ────────────────────────────────────────────────────
    if (this.telegraphAura > 0) {
      ctx.globalAlpha = this.telegraphAura * 0.6;
      ctx.strokeStyle = '#ffe040';
      ctx.lineWidth   = 4;
      ctx.shadowBlur  = 20;
      ctx.shadowColor = '#ffe040';
      ctx.strokeRect(this.x - 6, this.y - 6, this.w + 12, this.h + 12);
      // Warning text above boss
      ctx.globalAlpha = this.telegraphAura;
      ctx.fillStyle   = '#ffe040';
      ctx.font        = 'bold 14px monospace';
      ctx.textAlign   = 'center';
      const warnLabels = {
        telegraph_slash: '⚔ SLASH!',
        telegraph_leap:  '▲ LEAP!',
        telegraph_bh:    '✦ VOID BURST!',
        telegraph_laser: '◈ LASER!',
      };
      if (warnLabels[this.state]) {
        ctx.fillText(warnLabels[this.state], cx, this.y - 14);
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur  = 0;
    }

    // ── Body ──────────────────────────────────────────────────────────────
    if (this.hitFlash) {
      ctx.fillStyle   = '#ffffff';
      ctx.shadowBlur  = 16;
      ctx.shadowColor = '#ffffff';
    } else if (this.phase === 2 || this.glowing) {
      ctx.fillStyle   = '#2a0050';
      ctx.shadowBlur  = 20;
      ctx.shadowColor = '#ff40a0';
    } else {
      ctx.fillStyle   = '#1a1030';
      ctx.shadowBlur  = 10;
      ctx.shadowColor = '#8040ff';
    }
    ctx.fillRect(this.x, this.y, this.w, this.h);

    if (!this.hitFlash) {
      // Armour plates
      const armColour = this.phase === 2 ? '#600030' : '#302060';
      ctx.fillStyle = armColour;
      ctx.fillRect(this.x + 8,  this.y + 8,  this.w - 16, 20);  // chest
      ctx.fillRect(this.x + 4,  this.y + 30, 16,          30);  // l shoulder
      ctx.fillRect(this.x + this.w - 20, this.y + 30, 16, 30);  // r shoulder

      // Eyes — single cyclopean visor
      const eyeCol = this.phase === 2 ? '#ff2060' : '#a060ff';
      ctx.fillStyle   = eyeCol;
      ctx.shadowBlur  = 12;
      ctx.shadowColor = eyeCol;
      ctx.fillRect(this.x + 12, this.y + 18, this.w - 24, 8);

      // Phase 2: glowing rune on chest
      if (this.phase === 2) {
        ctx.fillStyle   = '#ff80c0';
        ctx.shadowBlur  = 16;
        ctx.shadowColor = '#ff80c0';
        ctx.font        = 'bold 22px serif';
        ctx.textAlign   = 'center';
        ctx.fillText('⚝', cx, this.y + 55);
      }
    }

    // ── Slash arc ─────────────────────────────────────────────────────────
    if (this.slashActive && this.slashTimer > 0) {
      ctx.globalAlpha = this.slashTimer / 14;
      ctx.strokeStyle = '#c0a0ff';
      ctx.shadowBlur  = 14;
      ctx.shadowColor = '#c0a0ff';
      ctx.lineWidth   = 5;
      const swingX = this.dir > 0 ? this.x + this.w : this.x;
      ctx.beginPath();
      ctx.arc(swingX, this.y + this.h/2,
              70, this.dir > 0 ? -Math.PI*0.6 : Math.PI*0.4,
              this.dir > 0 ? Math.PI*0.6 : Math.PI*1.6);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // ── Laser beam ────────────────────────────────────────────────────────
    if (this.laser.active && this.laser.fireTimer > 0) {
      const alpha = Math.min(1, this.laser.fireTimer / 10);
      ctx.globalAlpha = alpha;
      const lx  = this.laser.x;
      const ly  = this.laser.y;
      const end = this.dir > 0 ? lx + 600 : lx - 600;

      // Outer glow
      ctx.strokeStyle = 'rgba(255,100,200,0.4)';
      ctx.lineWidth   = 24;
      ctx.shadowBlur  = 30;
      ctx.shadowColor = '#ff40a0';
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(end, ly);
      ctx.stroke();

      // Core beam
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 4;
      ctx.shadowBlur  = 10;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(end, ly);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Laser charge glow
    if (this.laser.chargeTimer > 0 && !this.laser.active) {
      const t = 1 - this.laser.chargeTimer / 40;
      ctx.globalAlpha = t;
      ctx.fillStyle   = '#ff40a0';
      ctx.shadowBlur  = 30 * t;
      ctx.shadowColor = '#ff40a0';
      ctx.beginPath();
      ctx.arc(cx, cy, 20 * t, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // ── Void orbs ─────────────────────────────────────────────────────────
    ctx.shadowBlur = 0;
    for (const o of this.orbs) {
      const t = o.life / 120;
      ctx.globalAlpha = Math.min(1, t * 2);
      ctx.fillStyle   = '#a030e0';
      ctx.shadowBlur  = 10;
      ctx.shadowColor = '#d060ff';
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;

    // ── HP bar ────────────────────────────────────────────────────────────
    if (!this.dead) {
      const barY  = this.y - 18;
      const barW  = this.w + 20;
      const barX  = this.x - 10;
      ctx.fillStyle = '#1a0020';
      ctx.fillRect(barX, barY, barW, 8);
      const hpColor = this.phase === 2 ? '#ff2060' : '#8040ff';
      ctx.fillStyle = hpColor;
      ctx.shadowBlur  = 6;
      ctx.shadowColor = hpColor;
      ctx.fillRect(barX, barY, barW * (this.health / this.maxHealth), 8);
      ctx.shadowBlur = 0;

      // Phase indicator pip
      ctx.fillStyle = this.phase === 2 ? '#ff2060' : '#404040';
      ctx.beginPath();
      ctx.arc(barX + barW / 2, barY - 4, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
