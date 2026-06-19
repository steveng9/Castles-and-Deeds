/*
Castles & Deeds
Main.js  —  bootstrap. Builds the AssetManager, loads any queued art, then
launches the engine.

v1 draws pieces/deeds with Unicode glyphs + canvas, so the asset queue is empty
and the game starts immediately. When real downloaded art lands (see TODOS —
asset pipeline), queue it here and PieceRenderer swaps glyph draws for images.

AssetManager mirrors Zerlin's blob-URL loader so canvas.getImageData never trips
a CORS taint (needed if we later recolor sprite art per player).
*/

class AssetManager {
  constructor() { this.cache = {}; this.queue = []; this.success = 0; this.error = 0; }
  queueDownload(path) { this.queue.push(path); }
  isDone() { return this.queue.length === this.success + this.error; }
  downloadAll(cb) {
    // Empty queue → defer to DOM-ready so the canvas exists (scripts run in <head>).
    if (this.queue.length === 0) {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cb);
      else cb();
      return;
    }
    for (const path of this.queue) {
      const img = new Image();
      img.addEventListener('load', () => { this.success++; if (this.isDone()) cb(); });
      img.addEventListener('error', () => { console.warn('asset load failed: ' + path); this.error++; if (this.isDone()) cb(); });
      fetch(path).then(r => r.blob()).then(b => img.src = URL.createObjectURL(b)).catch(() => img.src = path);
      this.cache[path] = img;
    }
  }
  get(path) { return this.cache[path]; }
}

(function () {
  const AM = new AssetManager();

  // ── Queue real art here when available ──
  // AM.queueDownload('img/pieces/castle_white.png');  // etc.

  AM.downloadAll(function () {
    const canvas = document.getElementById('gameWorld');
    const game = new GameEngine();
    game.assetManager = AM;
    window.game = game;            // expose for console diagnostics
    game.init(canvas);
    game.start();
    console.log('Castles & Deeds running');
  });
})();
