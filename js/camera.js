/**
 * Camera
 * Follows the player with smooth lerp and carries the screen-shake offset
 * injected by GameFeelManager.
 */
class Camera {
  constructor(viewW, viewH) {
    this.x = 0;          // world position of top-left corner
    this.y = 0;
    this.viewW = viewW;
    this.viewH = viewH;
    this.shakeX = 0;     // current shake offset (set by GameFeelManager)
    this.shakeY = 0;
    this.lerpSpeed = 0.12;
  }

  /** Smoothly follow a target (player). Call every update frame. */
  follow(target, worldW, worldH) {
    const targetX = target.x + target.w / 2 - this.viewW / 2;
    const targetY = target.y + target.h / 2 - this.viewH / 2;

    this.x += (targetX - this.x) * this.lerpSpeed;
    this.y += (targetY - this.y) * this.lerpSpeed;

    // Clamp to world bounds
    this.x = Math.max(0, Math.min(this.x, worldW - this.viewW));
    this.y = Math.max(0, Math.min(this.y, worldH - this.viewH));
  }

  /** Apply camera transform to ctx. Call before drawing world objects. */
  begin(ctx) {
    ctx.save();
    ctx.translate(
      -Math.round(this.x) + Math.round(this.shakeX),
      -Math.round(this.y) + Math.round(this.shakeY)
    );
  }

  /** Restore ctx after drawing world objects. */
  end(ctx) {
    ctx.restore();
  }

  /** Convert world coordinates to screen coordinates. */
  worldToScreen(wx, wy) {
    return {
      x: wx - this.x + this.shakeX,
      y: wy - this.y + this.shakeY,
    };
  }
}
