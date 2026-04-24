/**
 * main.js — Game Loop & Scene Management
 * ========================================
 * Orchestrates:
 *   • Canvas / context setup
 *   • Game state (TITLE, PLAYING, DEAD)
 *   • Main update / render loop with hit-stop integration
 *   • Enemy + Boss spawning
 *   • Respawn / restart
 */

// ── Canvas Setup ──────────────────────────────────────────────────────────
const canvas  = document.getElementById('gameCanvas');
const ctx     = canvas.getContext('2d');
const VIEW_W  = canvas.width;   // 960
const VIEW_H  = canvas.height;  // 540

// ── Game Objects ──────────────────────────────────────────────────────────
let world, camera, player, boss, enemies, particles;
let bossArenaEntered = false;
let bossFightActive  = false;
let bossPrevPhase    = 1;
let gameRunning      = false;

// ── Overlay (start screen) ────────────────────────────────────────────────
const overlay  = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
startBtn.addEventListener('click', startGame);

// ── Respawn ───────────────────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && player && player.dead && player.deathTimer > 60) {
    respawn();
  }
});

// ── Init / Start ──────────────────────────────────────────────────────────
function startGame() {
  overlay.style.display = 'none';
  _initScene();
  gameRunning = true;
  requestAnimationFrame(gameLoop);
}

function _initScene() {
  world     = new World();
  camera    = new Camera(VIEW_W, VIEW_H);
  particles = new ParticleSystem();

  // Player spawns left side
  player = new Player(120, world.height - 80);
  // Pre-equip a starter relic for demonstration
  RelicSystem.equip('soulHarvest');
  RelicSystem.applyToPlayer(player);

  // Enemies scattered across the level
  enemies = [
    new Enemy(350, world.height - 96, { color: '#803020', eyeCol: '#ff6030', name: 'Shade Minion',  hp: 3, speed: 1.2, patrol: 100 }),
    new Enemy(600, world.height - 96, { color: '#602040', eyeCol: '#ff3060', name: 'Void Shade',    hp: 4, speed: 1.6, patrol: 130, dmg: 1 }),
    new Enemy(850, world.height - 96, { color: '#403060', eyeCol: '#a040ff', name: 'Dark Stalker',  hp: 5, speed: 1.4, patrol: 80,  dmg: 2 }),
    new Enemy(2200, world.height - 96, { color: '#206040', eyeCol: '#40ff80', name: 'Hollow Shade',  hp: 6, speed: 1.8, patrol: 160, dmg: 1 }),
    new Enemy(2600, world.height - 96, { color: '#604020', eyeCol: '#ffa040', name: 'Burning Shade', hp: 4, speed: 2.0, patrol: 90,  dmg: 2 }),
    new Enemy(2850, world.height - 96, { color: '#204060', eyeCol: '#40a0ff', name: 'Ice Shade',     hp: 5, speed: 1.5, patrol: 120, dmg: 1 }),
  ];

  // Boss spawns in the arena (around x=1200)
  boss = new VoidBeast(1180, world.height - 200);

  bossArenaEntered = false;
  bossFightActive  = false;
  bossPrevPhase    = 1;

  // Start camera on player
  camera.x = Math.max(0, player.x - VIEW_W / 2);
  camera.y = Math.max(0, player.y - VIEW_H / 2);
}

function respawn() {
  _initScene();
}

// ══════════════════════════════════════════════════════════════════════════
// GAME LOOP
// ══════════════════════════════════════════════════════════════════════════
function gameLoop() {
  if (!gameRunning) return;

  // ── 1. GameFeel tick (hit-stop + flash timers) ───────────────────────
  const frozen = GameFeel.update();

  // ── 2. Update (skip if frozen) ───────────────────────────────────────
  if (!frozen) {
    _update();
  }

  // ── 3. Render (always runs) ──────────────────────────────────────────
  GameFeel.applyShake(camera);
  _render();

  // ── 4. Flush per-frame input ─────────────────────────────────────────
  Input.flush();

  requestAnimationFrame(gameLoop);
}

// ── Update ────────────────────────────────────────────────────────────────
function _update() {
  // Update player
  player.update(world, enemies, boss, particles);

  // Update enemies
  for (const e of enemies) {
    e.update(world, player, particles);
  }

  // Boss arena gate: open after player crosses threshold
  if (!bossArenaEntered && player.x > 1050) {
    bossArenaEntered = true;
    bossFightActive  = true;
    world.bossGate.broken = true;  // gate opens permanently now
  }

  // Update boss
  if (bossFightActive && !boss.defeated) {
    boss.update(world, player, particles);

    // Phase 2 transition announcement
    if (boss.phase !== bossPrevPhase) {
      bossPrevPhase = boss.phase;
      UI.showPhaseAnnounce('⚝ PHASE II — VOID AWAKENED ⚝');
    }
  }

  // Open boss gate (destroy it) when boss is defeated
  if (boss.defeated && !world.bossGate.broken) {
    world.bossGate.broken = true;
  }

  // Update particles
  particles.update();

  // Camera follow
  camera.follow(player, world.width, world.height);
}

// ── Render ────────────────────────────────────────────────────────────────
function _render() {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);

  // Camera world transform
  camera.begin(ctx);

  world.draw(ctx);
  particles.draw(ctx);

  for (const e of enemies) e.draw(ctx);
  if (!boss.defeated) boss.draw(ctx);
  player.draw(ctx);

  camera.end(ctx);

  // HUD (screen-space, no camera transform)
  UI.draw(ctx, player, boss, VIEW_W, VIEW_H);

  // Parry flash overlay
  if (player.parried) {
    ctx.save();
    ctx.fillStyle   = 'rgba(255,255,100,0.25)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle   = '#ffe040';
    ctx.shadowBlur  = 20;
    ctx.shadowColor = '#ffe040';
    ctx.font        = 'bold 22px monospace';
    ctx.textAlign   = 'center';
    ctx.fillText('⚔ PARRY! ⚔', VIEW_W / 2, VIEW_H * 0.3);
    ctx.restore();
    // Clear parried flag after one render frame
    setTimeout(() => { player.parried = false; }, 500);
  }
}
