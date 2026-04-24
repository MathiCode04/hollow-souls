/**
 * Player
 * =======
 * Core player logic including:
 *   • Movement (run, jump, double-jump, coyote time)
 *   • Dash with Invincibility Frames (I-frames)
 *   • Attack / Combo (up to 3-hit chain)
 *   • Pogo Bounce (down-attack in air on enemy/spike)
 *   • Parry (attack exactly when enemy swings → parry window)
 *   • Mana/Soul system (collect soul on hits, spend on spells)
 *   • Spells: Fireball, Shockwave
 *   • Focus / Heal (hold to restore HP, costs soul)
 *   • Charm/Relic integration
 *   • Hit-flash, I-frame blink, knockback / invulnerability
 */
class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.w = 28;
    this.h = 42;

    this.vx = 0;
    this.vy = 0;
    this.onGround = false;

    // ── Health ──────────────────────────────────────────────────────────
    this.maxHealth = 5;
    this.health    = 5;
    this.dead      = false;
    this.deathTimer = 0;

    // ── Movement ────────────────────────────────────────────────────────
    this.speed         = 3.8;
    this.jumpForce     = -12;
    this.gravity       = 0.55;
    this.maxFallSpeed  = 14;
    this.hasDoubleJump = true;
    this.usedDoubleJump = false;
    this.coyoteFrames  = 0;    // frames after leaving ground where jump still allowed
    this.COYOTE_MAX    = 6;
    this.dir           = 1;    // 1=right, -1=left

    // ── Dash + I-Frames ─────────────────────────────────────────────────
    this.dashSpeed       = 10;
    this.dashDuration    = 14;   // frames the dash lasts
    this.dashCooldownMax = 28;   // frames between dashes
    this.dashTimer       = 0;    // frames remaining in dash
    this.dashCooldown    = 0;
    this.isDashing       = false;
    // I-frames during dash
    this.iFrames         = 0;    // frames of invulnerability remaining
    this.invulnerable    = false;
    // I-frames after taking damage
    this.damageIFrames   = 60;

    // ── Attack / Combo ───────────────────────────────────────────────────
    this.attackRange   = 54;     // sword reach in pixels
    this.attackDamage  = 1;
    this.attacking     = false;
    this.attackTimer   = 0;
    this.attackDur     = 18;     // frames per swing
    this.comboStep     = 0;      // 0,1,2 → 3 hit combo
    this.comboCooldown = 0;      // frames until combo resets
    this.COMBO_WINDOW  = 28;     // frames player has to continue combo

    // Attack hitbox (relative to player + dir)
    this.attackHitbox  = { x:0, y:0, w:0, h:0 };

    // Swing arc animation
    this.swingAngle    = 0;

    // ── Pogo ────────────────────────────────────────────────────────────
    this.pogoForce     = -11;

    // ── Parry ────────────────────────────────────────────────────────────
    // A parry occurs when the player attacks within the parry window
    // AND an enemy is also in their active attack state.
    // The parry window is the first PARRY_WINDOW_FRAMES of the attack animation.
    this.PARRY_WINDOW_FRAMES = 6;
    this.parried             = false;  // flag to signal to game loop

    // ── Soul / Mana ──────────────────────────────────────────────────────
    this.maxSoul     = 100;
    this.soul        = 0;
    this.soulPerHit  = 8;       // soul gained per successful hit

    // Spell costs
    this.FIREBALL_COST   = 33;
    this.SHOCKWAVE_COST  = 50;

    // Spells in flight { type, x, y, vx, vy, w, h, damage, life }
    this.spells = [];

    // ── Focus / Heal ─────────────────────────────────────────────────────
    this.focusing       = false;
    this.focusTimer     = 0;
    this.focusDuration  = 120;  // frames of focus to heal 1 mask
    this.focusHealAmount = 1;

    // ── Hit-Flash (set by GameFeelManager) ───────────────────────────────
    this.hitFlash = false;

    // ── Visual ───────────────────────────────────────────────────────────
    this.animFrame  = 0;
    this.animTimer  = 0;
    this.landDust   = false;
    this._wasOnGround = false;
  }

  // ══════════════════════════════════════════════════════════════════════
  // UPDATE
  // ══════════════════════════════════════════════════════════════════════
  update(world, enemies, boss, particles) {
    if (this.dead) {
      this.deathTimer++;
      return;
    }

    this._handleInput(particles);
    this._applyPhysics(world);
    this._updateAttack(enemies, boss, world, particles);
    this._updateSpells(enemies, boss, world, particles);
    this._updateFocus(particles);
    this._updateIFrames();
    this._updateAnimation(particles);
    this._checkSpikes(world, particles);
    this._collectPickups(world, particles);
  }

  // ── Input ─────────────────────────────────────────────────────────────
  _handleInput(particles) {
    const left  = Input.anyHeld('ArrowLeft',  'KeyA');
    const right = Input.anyHeld('ArrowRight', 'KeyD');
    const jumpP = Input.anyJustPressed('ArrowUp', 'KeyW', 'Space');
    const downH = Input.anyHeld('ArrowDown', 'KeyS');
    const atkP  = Input.anyJustPressed('KeyZ', 'KeyJ');
    const dashP = Input.anyJustPressed('KeyX', 'KeyK');
    const focH  = Input.anyHeld('KeyC', 'KeyL');
    const spell1 = Input.anyJustPressed('KeyV');
    const spell2 = Input.anyJustPressed('KeyB');

    // Horizontal movement
    if (!this.isDashing) {
      if (left)  { this.vx = -this.speed; this.dir = -1; }
      else if (right) { this.vx = this.speed; this.dir = 1; }
      else { this.vx *= 0.72; }
    }

    // Jump
    if (jumpP) {
      if (this.onGround || this.coyoteFrames > 0) {
        this.vy = this.jumpForce;
        this.coyoteFrames = 0;
        this.usedDoubleJump = false;
        particles.dust(this.x + this.w/2, this.y + this.h);
      } else if (this.hasDoubleJump && !this.usedDoubleJump) {
        this.vy = this.jumpForce * 0.9;
        this.usedDoubleJump = true;
        particles.dust(this.x + this.w/2, this.y + this.h/2);
        particles.void(this.x + this.w/2, this.y + this.h/2, 4);
      }
    }

    // Dash
    if (dashP && !this.isDashing && this.dashCooldown <= 0) {
      this._startDash(particles);
    }

    // Attack
    if (atkP && !this.attacking && !this.focusing) {
      this._startAttack(downH, particles);
    }

    // Focus (hold to heal)
    if (focH && !this.attacking && !this.isDashing && this.onGround) {
      this.focusing = true;
    } else {
      this.focusing = false;
      this.focusTimer = 0;
    }

    // Spells
    if (spell1) this._castFireball(particles);
    if (spell2) this._castShockwave(particles);
  }

  // ── Dash ─────────────────────────────────────────────────────────────────
  _startDash(particles) {
    this.isDashing   = true;
    this.dashTimer   = this.dashDuration;
    this.dashCooldown = this.dashCooldownMax;
    this.vy          = 0;

    // ── I-FRAMES: player is invulnerable for the entire dash duration ──
    this.iFrames     = this.dashDuration + 4;  // slight extra buffer
    this.invulnerable = true;

    particles.dust(this.x + this.w/2, this.y + this.h/2, 8);
    particles.void(this.x + this.w/2, this.y + this.h/2, 3);
  }

  // ── Attack ───────────────────────────────────────────────────────────────
  _startAttack(downH, particles) {
    this.attacking   = true;
    this.attackTimer = this.attackDur;
    this.parried     = false;

    // Advance combo step
    if (this.comboCooldown > 0) {
      this.comboStep = (this.comboStep + 1) % 3;
    } else {
      this.comboStep = 0;
    }
    this.comboCooldown = this.COMBO_WINDOW;

    // Pogo: down + attack while airborne
    this._pogoMode = (!this.onGround && downH);

    // Build hitbox
    this._refreshAttackHitbox();

    // Emit sword trail
    particles.trail(
      this.x + (this.dir > 0 ? this.w + 10 : -10),
      this.y + this.h * 0.4
    );

    // Combo-3: emit extra void particles
    if (this.comboStep === 2) {
      particles.void(
        this.x + this.w/2 + this.dir * this.attackRange * 0.5,
        this.y + this.h * 0.4,
        6
      );
    }
  }

  _refreshAttackHitbox() {
    if (this._pogoMode) {
      // Pogo: below the player
      this.attackHitbox = {
        x: this.x - 4,
        y: this.y + this.h - 4,
        w: this.w + 8,
        h: 36,
      };
    } else {
      this.attackHitbox = {
        x: this.dir > 0 ? this.x + this.w - 8 : this.x - this.attackRange + 8,
        y: this.y + 4,
        w: this.attackRange,
        h: this.h - 8,
      };
    }
  }

  // ── Attack Update ─────────────────────────────────────────────────────────
  _updateAttack(enemies, boss, world, particles) {
    if (this.dashCooldown > 0) this.dashCooldown--;

    if (!this.attacking) {
      if (this.comboCooldown > 0) this.comboCooldown--;
      return;
    }
    if (this.comboCooldown > 0) this.comboCooldown--;

    this.attackTimer--;
    this._refreshAttackHitbox();

    // Swing animation
    const progress  = 1 - this.attackTimer / this.attackDur;
    this.swingAngle = Math.sin(progress * Math.PI) * (this.dir > 0 ? 1 : -1);

    // ── Check for PARRY ───────────────────────────────────────────────────
    const inParryWindow = this.attackTimer > (this.attackDur - this.PARRY_WINDOW_FRAMES);
    if (inParryWindow && boss && !boss.dead) {
      if (boss.slashActive && overlapsRect(this.attackHitbox, boss)) {
        this._doParry(boss, particles);
        this.attackTimer = 0;
        return;
      }
    }

    // ── Damage window: middle portion of swing ─────────────────────────
    const inDmgWindow = this.attackTimer < this.attackDur * 0.8 &&
                        this.attackTimer > this.attackDur * 0.2;
    if (!inDmgWindow) {
      if (this.attackTimer <= 0) this.attacking = false;
      return;
    }

    // ── Hit enemies ───────────────────────────────────────────────────────
    for (const e of enemies) {
      if (e.dead) continue;
      if (overlapsRect(this.attackHitbox, e)) {
        const dmg = this.comboStep === 2 ? this.attackDamage + 1 : this.attackDamage;
        e.takeHit(dmg, this.dir, particles);
        this.soul = Math.min(this.maxSoul, this.soul + this.soulPerHit);
        // Pogo: bounce up
        if (this._pogoMode) this.vy = this.pogoForce;
      }
    }

    // ── Hit boss ──────────────────────────────────────────────────────────
    if (boss && !boss.dead && overlapsRect(this.attackHitbox, boss)) {
      boss.takeHit(this.attackDamage, this.dir, particles);
      this.soul = Math.min(this.maxSoul, this.soul + this.soulPerHit);
      if (this._pogoMode) this.vy = this.pogoForce;
    }

    // ── Hit destructible walls ────────────────────────────────────────────
    const hitWall = world.hitDestructibleWall(this.attackHitbox);
    if (hitWall) {
      particles.sparks(
        hitWall.x + hitWall.w/2,
        hitWall.y + hitWall.h/2,
        this.dir, 6
      );
      GameFeel.shake(2, 0.3);
    }

    if (this.attackTimer <= 0) this.attacking = false;
  }

  // ── Parry ─────────────────────────────────────────────────────────────────
  /**
   * Parry mechanics:
   *   Player attacks during the first PARRY_WINDOW_FRAMES of their swing,
   *   at the same moment the boss/enemy has an active attack hitbox that
   *   overlaps the player.
   *
   *   Result:
   *   • Both are pushed apart (no damage)
   *   • Massive spark burst + strong screen shake
   *   • Boss is put into stagger
   *   • Player gains full soul bar
   */
  _doParry(boss, particles) {
    this.parried = true;

    // Repulsion
    const bDir = this.x < boss.x ? -1 : 1;
    this.vx   = -bDir * 6;
    this.vy   = -5;
    boss.vx   =  bDir * 8;
    boss.vy   = -3;

    // Soul reward
    this.soul = this.maxSoul;

    // Stagger the boss
    boss.state      = BOSS_STATES.STAGGER;
    boss.stateTimer = 60;
    boss.slashActive = false;

    // BIG game-feel burst
    const mx = (this.x + boss.x) / 2;
    const my = (this.y + boss.y) / 2;
    particles.sparks(mx, my, 0, 24);
    particles.explosion(mx, my, 10);
    GameFeel.hitStop(8);
    GameFeel.shake(10, 0.5);
    GameFeel.hitFlash(boss, 12);
  }

  // ── Spells ───────────────────────────────────────────────────────────────
  _castFireball(particles) {
    if (this.soul < this.FIREBALL_COST) return;
    this.soul -= this.FIREBALL_COST;
    const spellX = this.x + (this.dir > 0 ? this.w + 4 : -24);
    this.spells.push({
      type: 'fireball',
      x: spellX, y: this.y + this.h * 0.35,
      vx: this.dir * 8, vy: 0,
      w: 20, h: 20,
      damage: 3, life: 90,
    });
    particles.soul(this.x + this.w/2, this.y + this.h/2, 4);
    GameFeel.shake(2, 0.3);
  }

  _castShockwave(particles) {
    if (this.soul < this.SHOCKWAVE_COST) return;
    this.soul -= this.SHOCKWAVE_COST;
    // Shockwave fans out in both directions on the ground level
    for (const dir of [-1, 1]) {
      this.spells.push({
        type: 'shockwave',
        x: this.x + this.w/2 - 10, y: this.y + this.h - 16,
        vx: dir * 5, vy: 0,
        w: 20, h: 32,
        damage: 2, life: 50,
        dir,
      });
    }
    particles.explosion(this.x + this.w/2, this.y + this.h, 8);
    GameFeel.shake(5, 0.4);
  }

  _updateSpells(enemies, boss, world, particles) {
    for (let i = this.spells.length - 1; i >= 0; i--) {
      const sp = this.spells[i];
      sp.x += sp.vx;
      sp.y += sp.vy;
      sp.vy += 0.08;   // gentle gravity on fireball
      sp.life--;

      // Emit particles
      if (sp.type === 'fireball' && sp.life % 3 === 0) {
        particles.soul(sp.x + sp.w/2, sp.y + sp.h/2, 2);
      }
      if (sp.type === 'shockwave' && sp.life % 4 === 0) {
        particles.void(sp.x + sp.w/2, sp.y + sp.h/2, 1);
      }

      let hit = false;

      // Hit enemies
      for (const e of enemies) {
        if (!e.dead && overlapsRect(sp, e)) {
          e.takeHit(sp.damage, sp.vx > 0 ? 1 : -1, particles);
          particles.explosion(sp.x + sp.w/2, sp.y + sp.h/2, 6);
          hit = true; break;
        }
      }

      // Hit boss
      if (!hit && boss && !boss.dead && overlapsRect(sp, boss)) {
        boss.takeHit(sp.damage, sp.vx > 0 ? 1 : -1, particles);
        particles.explosion(sp.x + sp.w/2, sp.y + sp.h/2, 8);
        hit = true;
      }

      // Hit platforms
      if (!hit) {
        for (const p of world.platforms) {
          if (overlapsRect(sp, p)) {
            particles.explosion(sp.x + sp.w/2, sp.y + sp.h/2, 5);
            hit = true; break;
          }
        }
      }

      if (hit || sp.life <= 0) {
        this.spells.splice(i, 1);
      }
    }
  }

  // ── Focus (Heal) ──────────────────────────────────────────────────────────
  _updateFocus(particles) {
    if (!this.focusing) return;
    if (this.soul <= 0) { this.focusing = false; return; }

    this.focusTimer++;
    if (this.focusTimer % 8 === 0) {
      particles.soul(this.x + this.w/2, this.y - 10, 2);
    }
    if (this.focusTimer >= this.focusDuration) {
      this.focusTimer = 0;
      if (this.health < this.maxHealth) {
        this.health = Math.min(this.maxHealth, this.health + this.focusHealAmount);
        this.soul -= 33;
        if (this.soul < 0) this.soul = 0;
        particles.soul(this.x + this.w/2, this.y + this.h/2, 6);
        GameFeel.hitFlash(this, 4);
      }
    }
  }

  // ── I-Frames ──────────────────────────────────────────────────────────────
  /**
   * iFrames tracks total invulnerability frames remaining.
   * invulnerable is the boolean checked by enemy/boss attack code.
   *
   * Sources of I-frames:
   *   • Dash:         dashDuration + 4 frames  (_startDash)
   *   • Taking damage: damageIFrames frames     (takeDamage)
   */
  _updateIFrames() {
    if (this.iFrames > 0) {
      this.iFrames--;
      this.invulnerable = true;
    } else {
      this.invulnerable = false;
    }

    // Dash movement
    if (this.isDashing) {
      this.dashTimer--;
      this.vx = this.dir * this.dashSpeed;
      this.vy = 0;
      if (this.dashTimer <= 0) {
        this.isDashing = false;
        this.vx *= 0.3;
      }
    }
  }

  // ── Take Damage ───────────────────────────────────────────────────────────
  takeDamage(amount, knockbackDir, particles) {
    if (this.invulnerable || this.dead) return;

    this.health -= amount;
    GameFeel.hitFlash(this, 8);
    GameFeel.shake(5, 0.5);
    GameFeel.hitStop(3);
    particles.blood(this.x + this.w/2, this.y + this.h/3, 8);

    // Knockback
    this.vx = knockbackDir * 6;
    this.vy = -4;

    // Grant damage I-frames
    this.iFrames     = this.damageIFrames;
    this.invulnerable = true;

    if (this.health <= 0) {
      this.health = 0;
      this.dead   = true;
      particles.explosion(this.x + this.w/2, this.y + this.h/2, 15);
      GameFeel.shake(12, 0.4);
    }
  }

  // ── Physics ───────────────────────────────────────────────────────────────
  _applyPhysics(world) {
    // Coyote time
    if (this.onGround) {
      this.coyoteFrames    = this.COYOTE_MAX;
      this.usedDoubleJump  = false;
    } else if (this.coyoteFrames > 0) {
      this.coyoteFrames--;
    }

    if (!this.isDashing) {
      this.vy += this.gravity;
      this.vy  = Math.min(this.vy, this.maxFallSpeed);
    }

    this.x += this.vx;
    this.y += this.vy;
    world.resolvePlatformCollision(this);

    // Land dust
    if (!this._wasOnGround && this.onGround && Math.abs(this.vy) > 3) {
      this.landDust = true;
    }
    this._wasOnGround = this.onGround;
  }

  // ── Spike collision ───────────────────────────────────────────────────────
  _checkSpikes(world, particles) {
    if (world.onSpike(this)) {
      this.takeDamage(1, this.dir, particles);
    }
  }

  // ── Collect pickups ───────────────────────────────────────────────────────
  _collectPickups(world, particles) {
    const types = world.collectPickups(this);
    for (const t of types) {
      if (t === 'health') {
        this.health = Math.min(this.maxHealth, this.health + 1);
        particles.soul(this.x + this.w/2, this.y, 4);
      } else if (t === 'soul') {
        this.soul = Math.min(this.maxSoul, this.soul + 30);
        particles.soul(this.x + this.w/2, this.y, 4);
      } else if (t === 'relic') {
        // Auto-equip next available relic
        const allRelics = RelicSystem.getAll();
        for (const r of allRelics) {
          if (!RelicSystem.isEquipped(r.id)) {
            RelicSystem.equip(r.id);
            RelicSystem.applyToPlayer(this);
            break;
          }
        }
        particles.explosion(this.x + this.w/2, this.y, 6);
      }
    }
  }

  // ── Animation ─────────────────────────────────────────────────────────────
  _updateAnimation(particles) {
    this.animTimer++;
    if (this.animTimer % 8 === 0) this.animFrame = (this.animFrame + 1) % 4;

    if (this.landDust) {
      particles.dust(this.x + this.w/2, this.y + this.h);
      this.landDust = false;
    }

    // Dash afterimage particles
    if (this.isDashing && this.dashTimer % 3 === 0) {
      particles.trail(this.x + this.w/2, this.y + this.h/2, '#6040c0');
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // DRAW
  // ══════════════════════════════════════════════════════════════════════
  draw(ctx) {
    if (this.dead && this.deathTimer > 60) return;

    ctx.save();

    // I-frame blink (after damage)
    const blinkOff = this.invulnerable && !this.isDashing && Math.floor(this.iFrames / 4) % 2 === 0;
    if (blinkOff) {
      ctx.restore();
      return;
    }

    const cx = this.x + this.w / 2;

    // ── Body ─────────────────────────────────────────────────────────────
    if (this.hitFlash) {
      ctx.fillStyle   = '#ffffff';
      ctx.shadowBlur  = 14;
      ctx.shadowColor = '#ffffff';
    } else if (this.isDashing) {
      ctx.fillStyle   = '#a060ff';
      ctx.shadowBlur  = 16;
      ctx.shadowColor = '#a060ff';
      ctx.globalAlpha = 0.8;
    } else if (this.focusing) {
      ctx.fillStyle   = '#40c0ff';
      ctx.shadowBlur  = 12;
      ctx.shadowColor = '#40c0ff';
    } else {
      ctx.fillStyle   = '#c0d0f0';
      ctx.shadowBlur  = 4;
      ctx.shadowColor = '#8090d0';
    }

    // Cape / cloak (trapezoid)
    ctx.fillStyle = this.hitFlash ? '#ffffff' : (this.phase2 ? '#400060' : '#1a0840');
    ctx.beginPath();
    ctx.moveTo(this.x + 4, this.y + 10);
    ctx.lineTo(this.x + this.w - 4, this.y + 10);
    ctx.lineTo(this.x + this.w + 4, this.y + this.h);
    ctx.lineTo(this.x - 4, this.y + this.h);
    ctx.closePath();
    ctx.fill();

    // Head
    ctx.fillStyle = this.hitFlash ? '#ffffff' : '#c0d0f0';
    ctx.fillRect(this.x + 6, this.y, this.w - 12, this.h * 0.35);

    // Mask / helmet
    ctx.fillStyle = this.hitFlash ? '#ffffff' : '#1a0840';
    ctx.fillRect(this.x + 8, this.y + 4, this.w - 16, 10);

    // Eyes
    if (!this.hitFlash) {
      ctx.fillStyle   = this.focusing ? '#40ffff' : '#a0ffff';
      ctx.shadowBlur  = 6;
      ctx.shadowColor = '#a0ffff';
      const eyeY = this.y + 7;
      if (this.dir > 0) {
        ctx.fillRect(cx + 2, eyeY, 5, 4);
      } else {
        ctx.fillRect(cx - 7, eyeY, 5, 4);
      }
    }

    ctx.shadowBlur = 0;

    // ── Sword ─────────────────────────────────────────────────────────────
    if (!this.hitFlash) {
      ctx.save();
      ctx.translate(
        this.dir > 0 ? this.x + this.w - 4 : this.x + 4,
        this.y + this.h * 0.4
      );
      ctx.rotate(this.attacking ? this.swingAngle * 1.5 : 0);

      // Blade
      const bladeLen = this.attackRange * 0.75;
      ctx.fillStyle   = '#d0e0ff';
      ctx.shadowBlur  = this.attacking ? 14 : 4;
      ctx.shadowColor = '#a0c0ff';
      if (this.dir > 0) {
        ctx.fillRect(0, -3, bladeLen, 6);
      } else {
        ctx.fillRect(-bladeLen, -3, bladeLen, 6);
      }

      // Combo-3 extra glow
      if (this.comboStep === 2 && this.attacking) {
        ctx.shadowBlur  = 20;
        ctx.shadowColor = '#c040ff';
        ctx.strokeStyle = '#c040ff';
        ctx.lineWidth   = 2;
        if (this.dir > 0) {
          ctx.strokeRect(0, -3, bladeLen, 6);
        } else {
          ctx.strokeRect(-bladeLen, -3, bladeLen, 6);
        }
      }
      ctx.restore();
    }

    // ── Pogo indicator ────────────────────────────────────────────────────
    if (this._pogoMode && this.attacking) {
      ctx.fillStyle   = '#ffe040';
      ctx.shadowBlur  = 8;
      ctx.shadowColor = '#ffe040';
      ctx.fillRect(this.x + this.w*0.1, this.y + this.h - 4, this.w * 0.8, 8);
    }

    // ── Focus aura ────────────────────────────────────────────────────────
    if (this.focusing) {
      const t = this.focusTimer / this.focusDuration;
      ctx.globalAlpha = 0.4 * t;
      ctx.fillStyle   = '#40c0ff';
      ctx.shadowBlur  = 20;
      ctx.shadowColor = '#40c0ff';
      ctx.beginPath();
      ctx.arc(cx, this.y + this.h/2, 28 * t, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // ── Draw spells ───────────────────────────────────────────────────────
    ctx.shadowBlur = 0;
    for (const sp of this.spells) {
      if (sp.type === 'fireball') {
        ctx.fillStyle   = '#40c0ff';
        ctx.shadowBlur  = 12;
        ctx.shadowColor = '#40c0ff';
        ctx.beginPath();
        ctx.arc(sp.x + sp.w/2, sp.y + sp.h/2, sp.w/2, 0, Math.PI*2);
        ctx.fill();
      } else if (sp.type === 'shockwave') {
        const t = 1 - sp.life / 50;
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle   = '#8040ff';
        ctx.shadowBlur  = 10;
        ctx.shadowColor = '#8040ff';
        ctx.fillRect(sp.x, sp.y, sp.w, sp.h);
        ctx.globalAlpha = 1;
      }
    }

    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
