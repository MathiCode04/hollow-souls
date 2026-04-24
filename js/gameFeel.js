/**
 * GameFeelManager
 * ================
 * Centralises all "juice" effects:
 *   • Hit-Stop  — freezes game logic for N frames without breaking render
 *   • Screen Shake — decaying sinusoidal camera trauma
 *   • Hit-Flash — temporarily overrides an entity's draw colour to white
 *
 * Usage:
 *   GameFeel.hitStop(5);          // freeze for 5 frames
 *   GameFeel.shake(8, 0.6);       // magnitude 8, decay 0.6/frame
 *   GameFeel.hitFlash(enemy, 6);  // flash entity white for 6 frames
 *
 * In the main game loop:
 *   const frozen = GameFeel.update(camera);   // returns true while frozen
 *   if (!frozen) { ... update game logic ... }
 *   GameFeel.applyShake(camera);              // always apply shake to camera
 */
const GameFeel = (() => {
  // ── Hit-Stop ─────────────────────────────────────────────────────────────
  let stopFrames = 0;

  /**
   * Freeze game logic for `frames` ticks.
   * Existing freeze is extended if the new value is larger.
   */
  function hitStop(frames) {
    stopFrames = Math.max(stopFrames, frames);
  }

  // ── Screen Shake ──────────────────────────────────────────────────────────
  let shakeMag   = 0;   // current maximum offset in pixels
  let shakeDecay = 0;   // how fast magnitude decreases per frame
  let shakeTime  = 0;   // accumulator for sine wave

  /**
   * Start a screen shake.
   * @param {number} magnitude  Peak pixel offset (e.g. 8 for heavy, 3 for light)
   * @param {number} decay      Amount subtracted from magnitude each frame (0–1)
   */
  function shake(magnitude, decay = 0.5) {
    // Only upgrade if the new shake is stronger
    if (magnitude > shakeMag) {
      shakeMag   = magnitude;
      shakeDecay = decay;
    }
  }

  /** Apply the current shake offset to a Camera object. */
  function applyShake(camera) {
    if (shakeMag <= 0.1) {
      camera.shakeX = 0;
      camera.shakeY = 0;
      shakeMag = 0;
      return;
    }
    shakeTime += 1;
    camera.shakeX = Math.sin(shakeTime * 1.7) * shakeMag;
    camera.shakeY = Math.cos(shakeTime * 2.3) * shakeMag;
    shakeMag -= shakeDecay;
  }

  // ── Hit-Flash ─────────────────────────────────────────────────────────────
  // Each entry: { entity, framesLeft }
  const flashList = [];

  /**
   * Make an entity flash white for `frames` ticks.
   * The entity must expose a `hitFlash` boolean property that its draw()
   * method uses to decide whether to render white.
   */
  function hitFlash(entity, frames = 6) {
    // Remove any existing flash for this entity
    const idx = flashList.findIndex(f => f.entity === entity);
    if (idx !== -1) flashList.splice(idx, 1);
    flashList.push({ entity, framesLeft: frames });
    entity.hitFlash = true;
  }

  // ── Update (call once per render frame) ──────────────────────────────────
  /**
   * Tick all GameFeel timers.
   * Returns `true` while the game is frozen (hit-stop active).
   * Render should still run every frame; only game logic should be skipped.
   */
  function update() {
    // Advance flash timers regardless of hit-stop
    for (let i = flashList.length - 1; i >= 0; i--) {
      const f = flashList[i];
      f.framesLeft--;
      if (f.framesLeft <= 0) {
        f.entity.hitFlash = false;
        flashList.splice(i, 1);
      }
    }

    if (stopFrames > 0) {
      stopFrames--;
      return true; // frozen
    }
    return false;  // not frozen
  }

  return { hitStop, shake, applyShake, hitFlash, update };
})();
