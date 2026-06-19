/*
Castles & Deeds
Camera.js  —  pan + zoom viewport over an effectively-infinite board.

Holds the world→screen transform. (x, y) is the world-space point shown at the
TOP-LEFT of the canvas; `zoom` scales world units to pixels. The board is
infinite in every direction, so there are no hard pan bounds — a player *can*
march off to flank, it just takes time (low threat, by design).

Conversions:
  screen = (world - cam) * zoom
  world  = screen / zoom + cam
*/

const cc = () => Constants.Camera;

class Camera {
  constructor(canvas) {
    this.canvas = canvas;
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
  }

  get viewW() { return this.canvas.width; }
  get viewH() { return this.canvas.height; }

  // ── Transforms ─────────────────────────────────────────────────────────
  worldToScreenX(wx) { return (wx - this.x) * this.zoom; }
  worldToScreenY(wy) { return (wy - this.y) * this.zoom; }
  screenToWorldX(sx) { return sx / this.zoom + this.x; }
  screenToWorldY(sy) { return sy / this.zoom + this.y; }

  // ── Controls ───────────────────────────────────────────────────────────
  panBy(dxWorld, dyWorld) { this.x += dxWorld; this.y += dyWorld; }

  // Zoom toward a screen-space anchor (so the point under the cursor stays put).
  zoomAt(screenX, screenY, factor) {
    const wx = this.screenToWorldX(screenX);
    const wy = this.screenToWorldY(screenY);
    this.zoom = Math.max(cc().MIN_ZOOM, Math.min(cc().MAX_ZOOM, this.zoom * factor));
    // Re-anchor so (wx, wy) maps back to (screenX, screenY).
    this.x = wx - screenX / this.zoom;
    this.y = wy - screenY / this.zoom;
  }

  // Center the view on a world point.
  centerOn(wx, wy) {
    this.x = wx - this.viewW / (2 * this.zoom);
    this.y = wy - this.viewH / (2 * this.zoom);
  }

  // Keyboard pan (speed is zoom-compensated so it feels constant on screen).
  updateKeyboardPan(keys, dt) {
    const sp = cc().PAN_SPEED * dt / this.zoom;
    if (keys[Constants.Keys.PAN_UP])    this.y -= sp;
    if (keys[Constants.Keys.PAN_DOWN])  this.y += sp;
    if (keys[Constants.Keys.PAN_LEFT])  this.x -= sp;
    if (keys[Constants.Keys.PAN_RIGHT]) this.x += sp;
  }
}

if (typeof window !== 'undefined') window.Camera = Camera;
