/**
 * Input Handler
 * Tracks keyboard state and provides helpers for single-frame triggers.
 */
const Input = (() => {
  const held = {};
  const _justPressed = {};
  const _justReleased = {};

  window.addEventListener('keydown', (e) => {
    if (!held[e.code]) {
      _justPressed[e.code] = true;
    }
    held[e.code] = true;
    // Prevent arrow-key page scrolling
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) {
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', (e) => {
    held[e.code] = false;
    _justReleased[e.code] = true;
  });

  return {
    /** True every frame the key is held */
    isHeld(code) { return !!held[code]; },

    /** True only on the first frame the key was pressed */
    justPressed(code) { return !!_justPressed[code]; },

    /** True only on the first frame the key was released */
    justReleased(code) { return !!_justReleased[code]; },

    /** Clear per-frame state. Call once at the end of each update tick. */
    flush() {
      for (const k in _justPressed)  delete _justPressed[k];
      for (const k in _justReleased) delete _justReleased[k];
    },

    /** Convenience: check multiple codes (OR logic) */
    anyHeld(...codes)         { return codes.some(c => this.isHeld(c)); },
    anyJustPressed(...codes)  { return codes.some(c => this.justPressed(c)); },
  };
})();
