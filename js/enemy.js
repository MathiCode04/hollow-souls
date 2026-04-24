/**
 * Enemy – base class for non-boss enemies.
 * ==========================================
 * Provides:
 *   • Simple patrol AI (walk back and forth between patrol bounds)
 *   • Attack detection (if player walks into attack range)
 *   • Hit-flash support (hitFlash boolean toggled by GameFeelManager)
 *   • Health / death
 *
 * To create a concrete enemy, just instantiate Enemy with an opts object.
 */
class Enemy {
  constructor(x, y, opts = {}) {
    this.x = x;
    this.y = y;
    this.w = opts.w ?? 36;
    this.h = opts.h ?? 44;

    this.vx = 0;
    this.vy = 0;
    this.onGround = false;

    this.maxHealth = opts.hp  ?? 4;
    this.health    = this.maxHealth;
    this.dead      = false;

    this.speed      = opts.speed    ?? 1.2;
    this.patrolDist = opts.patrol   ?? 120;   // pixels from spawn to turn around
    this.spawnX     = x;
    this.dir        = 1;                       // 1 = right, -1 = left

    this.attackDamage = opts.dmg     ?? 1;
    this.attackRange  = opts.range   ?? 60;    // horizontal proximity

    // AI state
    this.state         = 'patrol';   // patrol | attack | stagger | dead
    this.staggerTimer  = 0;
    this.attackCooldown = 0;

    // Game feel
    this.hitFlash = false;

    // Visual
    this.color  = opts.color  ?? '#a03020';
    this.eyeCol = opts.eyeCol ?? '#ff8040';
    this.name   = opts.name   ?? 'Shade';

    // Soul reward on death
    this.soulReward = opts.soul ?? 4;
  }

  // ── Update ────────────────────────────────────────────────────────────────
  update(world, player, particles) {
    if (this.dead) return;

    // Gravity
    this.vy += 0.5;
    this.x  += this.vx;
    this.y  += this.vy;
    world.resolvePlatformCollision(this);

    if (this.staggerTimer > 0) {
      this.staggerTimer--;
      this.vx *= 0.8;
      return;
    }

    if (this.attackCooldown > 0) this.attackCooldown--;

    const distX = Math.abs(player.x - this.x);

    if (distX < this.attackRange) {
      this.state = 'attack';
      this._doAttack(player, particles);
    } else {
      this.state = 'patrol';
      this._patrol();
    }
  }

  _patrol() {
    this.vx = this.dir * this.speed;
    if (this.x > this.spawnX + this.patrolDist)  this.dir = -1;
    if (this.x < this.spawnX - this.patrolDist)  this.dir =  1;
  }

  _doAttack(player, particles) {
    if (this.attackCooldown > 0) return;
    const dx = player.x - this.x;
    this.dir = dx > 0 ? 1 : -1;

    // Check if player is inside attack hitbox and not invulnerable
    const hitbox = {
      x: this.x + (this.dir > 0 ? this.w : -this.attackRange),
      y: this.y,
      w: this.attackRange,
      h: this.h,
    };

    if (overlapsRect(hitbox, player) && !player.invulnerable) {
      player.takeDamage(this.attackDamage, this.dir, particles);
      this.attackCooldown = 80;
    }
    this.attackCooldown = Math.max(this.attackCooldown, 40);
  }

  /** Called when player's attack lands on this enemy. */
  takeHit(damage, knockbackDir, particles) {
    if (this.dead) return;
    this.health -= damage;
    GameFeel.hitStop(4);
    GameFeel.hitFlash(this, 6);
    GameFeel.shake(3, 0.4);
    particles.sparks(this.x + this.w / 2, this.y + this.h / 3, knockbackDir);
    particles.blood(this.x + this.w / 2, this.y + this.h / 3);

    // Knockback
    this.vx = knockbackDir * 5;
    this.vy = -3;
    this.staggerTimer = 18;

    if (this.health <= 0) this._die(particles);
  }

  _die(particles) {
    this.dead = true;
    this.state = 'dead';
    particles.void(this.x + this.w/2, this.y + this.h/2, 12);
    particles.explosion(this.x + this.w/2, this.y + this.h/2, 8);
  }

  // ── Draw ──────────────────────────────────────────────────────────────────
  draw(ctx) {
    if (this.dead) return;

    ctx.save();

    if (this.hitFlash) {
      // White flash
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur  = 12;
      ctx.shadowColor = '#ffffff';
    } else {
      ctx.fillStyle   = this.color;
      ctx.shadowBlur  = 6;
      ctx.shadowColor = this.eyeCol;
    }

    // Body
    ctx.fillRect(this.x, this.y, this.w, this.h);

    if (!this.hitFlash) {
      // Eyes
      ctx.fillStyle  = this.eyeCol;
      ctx.shadowBlur = 8;
      const eyeY = this.y + this.h * 0.25;
      if (this.dir > 0) {
        ctx.fillRect(this.x + this.w*0.55, eyeY, 6, 6);
      } else {
        ctx.fillRect(this.x + this.w*0.15, eyeY, 6, 6);
      }

      // HP bar
      ctx.shadowBlur = 0;
      ctx.fillStyle  = '#300';
      ctx.fillRect(this.x, this.y - 10, this.w, 5);
      ctx.fillStyle  = '#e03030';
      ctx.fillRect(this.x, this.y - 10, this.w * (this.health / this.maxHealth), 5);
    }

    ctx.restore();
  }
}

// ── Simple AABB helper (also used by Player, Boss) ───────────────────────────
function overlapsRect(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}
