/**
 * HUD / UI
 * =========
 * Draws all UI elements on top of the game world (not camera-transformed):
 *   • Health masks (hearts)
 *   • Soul / Mana bar
 *   • Focus charge ring
 *   • Equipped relics
 *   • Boss HP bar (when boss is visible)
 *   • Death / Game-Over overlay
 *   • Boss phase announcements
 */
const UI = (() => {
  // ── Boss phase announce ────────────────────────────────────────────────
  let phaseAnnounce      = '';
  let phaseAnnounceTimer = 0;

  function showPhaseAnnounce(text) {
    phaseAnnounce      = text;
    phaseAnnounceTimer = 120;
  }

  // ── Main draw ──────────────────────────────────────────────────────────
  function draw(ctx, player, boss, viewW, viewH) {
    _drawHealth(ctx, player);
    _drawSoul(ctx, player, viewH);
    _drawRelics(ctx, player, viewW, viewH);
    if (boss && !boss.defeated) {
      _drawBossBar(ctx, boss, viewW, viewH);
    }
    if (phaseAnnounceTimer > 0) {
      _drawPhaseAnnounce(ctx, viewW, viewH);
      phaseAnnounceTimer--;
    }
    if (player.dead) {
      _drawDeath(ctx, viewW, viewH, player.deathTimer);
    }
  }

  // ── Health masks ──────────────────────────────────────────────────────
  function _drawHealth(ctx, player) {
    const PAD    = 14;
    const SIZE   = 22;
    const GAP    = 4;
    for (let i = 0; i < player.maxHealth; i++) {
      const x = PAD + i * (SIZE + GAP);
      const y = PAD;
      ctx.save();
      ctx.fillStyle   = i < player.health ? '#ff4060' : '#3a1028';
      ctx.shadowBlur  = i < player.health ? 8 : 0;
      ctx.shadowColor = '#ff4060';
      ctx.font        = `${SIZE}px serif`;
      ctx.fillText('♥', x, y + SIZE * 0.9);
      ctx.restore();
    }
  }

  // ── Soul bar ──────────────────────────────────────────────────────────
  function _drawSoul(ctx, player, viewH) {
    const PAD   = 14;
    const W     = 100;
    const H     = 8;
    const y     = viewH - PAD - H;

    ctx.save();

    // Background
    ctx.fillStyle = '#0a0015';
    ctx.fillRect(PAD, y, W, H);

    // Fill
    const fillW = W * (player.soul / player.maxSoul);
    const grad = ctx.createLinearGradient(PAD, 0, PAD + W, 0);
    grad.addColorStop(0, '#2060c0');
    grad.addColorStop(1, '#40c0ff');
    ctx.fillStyle   = grad;
    ctx.shadowBlur  = 6;
    ctx.shadowColor = '#40c0ff';
    ctx.fillRect(PAD, y, fillW, H);

    // Border
    ctx.strokeStyle = '#304080';
    ctx.lineWidth   = 1;
    ctx.strokeRect(PAD, y, W, H);

    // Label
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = '#6090c0';
    ctx.font        = '9px monospace';
    ctx.fillText('SOUL', PAD, y - 3);

    // Spell cost indicators
    const costs = [
      { label: 'Fireball (V)', cost: 33, color: '#40c0ff' },
      { label: 'Wave (B)',     cost: 50, color: '#8040ff' },
    ];
    costs.forEach((sp, i) => {
      const px = PAD + W + 10 + i * 80;
      const canCast = player.soul >= sp.cost;
      ctx.fillStyle  = canCast ? sp.color : '#303030';
      ctx.font       = '9px monospace';
      ctx.fillText(sp.label, px, y + H - 1);
      ctx.fillStyle  = canCast ? sp.color : '#202020';
      ctx.fillRect(px, y, 60 * (sp.cost / 100), H);
    });

    ctx.restore();
  }

  // ── Equipped relics ───────────────────────────────────────────────────
  function _drawRelics(ctx, player, viewW, viewH) {
    const equipped = RelicSystem.getEquipped();
    if (equipped.length === 0) return;

    const PAD  = 14;
    const SIZE = 24;
    const GAP  = 6;
    const startX = viewW - PAD - (equipped.length * (SIZE + GAP));
    const y      = PAD;

    ctx.save();
    ctx.font = `${SIZE - 4}px serif`;
    equipped.forEach((id, i) => {
      const def = RelicSystem.getAll().find(r => r.id === id);
      if (!def) return;
      const x = startX + i * (SIZE + GAP);
      ctx.fillStyle   = '#1a0830';
      ctx.strokeStyle = '#6040a0';
      ctx.lineWidth   = 1;
      ctx.fillRect(x, y, SIZE, SIZE);
      ctx.strokeRect(x, y, SIZE, SIZE);
      ctx.fillStyle  = '#ffd060';
      ctx.shadowBlur = 4;
      ctx.shadowColor = '#ffd060';
      ctx.fillText(def.icon, x + 4, y + SIZE - 4);
    });
    ctx.restore();
  }

  // ── Boss HP bar ───────────────────────────────────────────────────────
  function _drawBossBar(ctx, boss, viewW, viewH) {
    const W   = viewW * 0.5;
    const H   = 14;
    const x   = (viewW - W) / 2;
    const y   = viewH - 50;

    ctx.save();

    // Background
    ctx.fillStyle = '#0a0015';
    ctx.fillRect(x - 2, y - 2, W + 4, H + 4);

    // Fill
    const hpRatio = Math.max(0, boss.health / boss.maxHealth);
    const col     = boss.phase === 2 ? '#ff2060' : '#8040ff';
    const grad    = ctx.createLinearGradient(x, 0, x + W, 0);
    grad.addColorStop(0,   col);
    grad.addColorStop(0.5, '#ffffff');
    grad.addColorStop(1,   col);
    ctx.fillStyle   = grad;
    ctx.shadowBlur  = 8;
    ctx.shadowColor = col;
    ctx.fillRect(x, y, W * hpRatio, H);

    // 50% marker
    ctx.strokeStyle = '#606060';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(x + W * 0.5, y);
    ctx.lineTo(x + W * 0.5, y + H);
    ctx.stroke();

    // Border
    ctx.strokeStyle = '#503070';
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(x - 2, y - 2, W + 4, H + 4);

    // Name
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = boss.phase === 2 ? '#ff80c0' : '#b080ff';
    ctx.font        = 'bold 12px monospace';
    ctx.textAlign   = 'center';
    const label     = boss.phase === 2 ? 'VOID BEAST  [PHASE II]' : 'VOID BEAST';
    ctx.fillText(label, viewW / 2, y - 6);

    ctx.restore();
  }

  // ── Phase announce banner ─────────────────────────────────────────────
  function _drawPhaseAnnounce(ctx, viewW, viewH) {
    const t     = phaseAnnounceTimer / 120;
    const alpha = t < 0.2 ? t / 0.2 : t > 0.8 ? (t - 0.8) / 0.2 : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, viewH * 0.4 - 30, viewW, 60);
    ctx.fillStyle   = '#ff40a0';
    ctx.shadowBlur  = 20;
    ctx.shadowColor = '#ff40a0';
    ctx.font        = 'bold 28px monospace';
    ctx.textAlign   = 'center';
    ctx.fillText(phaseAnnounce, viewW / 2, viewH * 0.4 + 10);
    ctx.restore();
  }

  // ── Death overlay ─────────────────────────────────────────────────────
  function _drawDeath(ctx, viewW, viewH, deathTimer) {
    if (deathTimer < 30) return;
    const t     = Math.min(1, (deathTimer - 30) / 60);
    ctx.save();
    ctx.globalAlpha = t * 0.85;
    ctx.fillStyle   = '#000000';
    ctx.fillRect(0, 0, viewW, viewH);

    ctx.globalAlpha = t;
    ctx.fillStyle   = '#ff2040';
    ctx.shadowBlur  = 20;
    ctx.shadowColor = '#ff2040';
    ctx.font        = 'bold 42px monospace';
    ctx.textAlign   = 'center';
    ctx.fillText('YOU DIED', viewW / 2, viewH / 2 - 10);

    ctx.shadowBlur = 0;
    ctx.fillStyle  = '#808080';
    ctx.font       = '16px monospace';
    ctx.fillText('Press R to respawn', viewW / 2, viewH / 2 + 36);
    ctx.restore();
  }

  return { draw, showPhaseAnnounce };
})();
