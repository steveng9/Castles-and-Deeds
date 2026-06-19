/*
Castles & Deeds
GameEngine.js  —  game loop, input handling, and the SceneManager hand-off.

Mirrors Zerlin's engine shape (timer → update → draw, requestAnimationFrame),
adapted for a board game: the camera supports drag-to-pan and wheel-zoom, and
input exposes a `wheel` delta and `dragging` state that scenes can read.

Scenes own all gameplay. The engine just feeds them input + clock and asks them
to update/draw. Keep gameplay OUT of this file.
*/

window.requestAnimFrame = window.requestAnimationFrame ||
  function (cb) { window.setTimeout(cb, 1000 / 60); };

class GameEngine {
  constructor() {
    this.ctx = null;
    this.canvas = null;
    this.mouse = { x: 0, y: 0 };
    this.click = null;          // {x,y} on left-click release (consumed each frame)
    this.mouseDown = null;      // {x,y} on left press (one-shot, consumed each frame)
    this.leftHeld = false;      // left button currently held (for drag tools)
    this.rightClick = null;
    this.wheel = 0;             // accumulated wheel delta (consumed each frame)
    this.keys = {};
    this.dragging = false;      // middle/right-drag pan in progress
    this._lastDrag = null;
    this.clockTick = 0;
    this._lastTime = 0;
  }

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = new Camera(canvas);
    this.sceneManager = new SceneManager(this);
    this.network = (typeof NetworkManager !== 'undefined') ? new NetworkManager() : null;
    this._startInput();
    this.sceneManager.init();
    console.log('Castles & Deeds initialized');
  }

  start() {
    const loop = () => { this._loop(); requestAnimationFrame(loop); };
    this._lastTime = performance.now();
    loop();
  }

  _loop() {
    const now = performance.now();
    this.clockTick = Math.min((now - this._lastTime) / 1000, 0.05);
    this._lastTime = now;
    this.sceneManager.update();
    this.draw();
    // Consume one-shot inputs.
    this.click = null;
    this.mouseDown = null;
    this.rightClick = null;
    this.wheel = 0;
  }

  draw() {
    this.ctx.fillStyle = Constants.UI.BG;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.sceneManager.draw();
  }

  // ── Input ──────────────────────────────────────────────────────────────
  _startInput() {
    const canvas = this.canvas;
    const rel = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    canvas.addEventListener('mousemove', (e) => {
      this.mouse = rel(e);
      if (this.dragging && this._lastDrag) {
        // Pan: convert screen delta to world delta (divide by zoom).
        const dx = (this.mouse.x - this._lastDrag.x) / this.camera.zoom;
        const dy = (this.mouse.y - this._lastDrag.y) / this.camera.zoom;
        this.camera.panBy(-dx, -dy);
        this._lastDrag = { x: this.mouse.x, y: this.mouse.y };
      }
    });

    canvas.addEventListener('mousedown', (e) => {
      const p = rel(e);
      if (e.button === 1 || e.button === 2) {  // middle or right → pan
        this.dragging = true;
        this._lastDrag = p;
        e.preventDefault();
      } else if (e.button === 0) {             // left → press (drag tools / click)
        this.mouseDown = p;
        this.leftHeld = true;
      }
    });

    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 1 || e.button === 2) { this.dragging = false; this._lastDrag = null; }
      else if (e.button === 0) { this.click = rel(e); this.leftHeld = false; }
    });
    // A left-release outside the canvas still ends the drag.
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.leftHeld = false; });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      // Exponential zoom proportional to wheel delta → smooth and controllable on
      // both notched mice and high-frequency trackpads. Clamp per event so a
      // single large delta can't jump the view.
      let factor = Math.exp(-e.deltaY * Constants.Camera.ZOOM_SENSITIVITY);
      factor = Math.max(0.85, Math.min(1.18, factor));
      const p = rel(e);
      this.camera.zoomAt(p.x, p.y, factor);
    }, { passive: false });

    canvas.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    canvas.addEventListener('keyup',   (e) => { this.keys[e.code] = false; });
    // Make the canvas focusable for keyboard input.
    canvas.setAttribute('tabindex', '1');
    canvas.addEventListener('mouseenter', () => canvas.focus());
  }
}

if (typeof window !== 'undefined') window.GameEngine = GameEngine;
