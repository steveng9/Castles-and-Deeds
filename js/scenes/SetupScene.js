/*
Castles & Deeds
SetupScene.js  —  the board-master sandbox.

Goal (Steven's "very first" deliverable):
  1. A randomly-generated board that changes per play, with configurable
     dimensions and free pan/zoom over an infinite field.
  2. Display all pieces + deeds, and let the board master place pieces, paint
     terrain, and inspect the deck before a game is instantiated.

UI is drawn on the canvas itself (no DOM dependency beyond the cols/rows inputs),
so hit-testing and drawing share one layout. Tools:
  • Place   — drop the selected piece (for the selected player) on a cell
  • Paint   — set the selected terrain on a cell
  • Erase   — remove a piece (or, if empty, clear the cell to undefined)

All gameplay rules live elsewhere; this scene only edits GameState + draws it.
*/

class SetupScene {
  constructor(sm) {
    this.sm = sm;
    this.game = sm.game;
    this.state = sm.state;

    // Tool state.
    this.tool = 'place';                 // 'place' | 'paint' | 'erase'
    this.selectedPiece = 'company';
    this.selectedPlayer = 0;
    this.selectedTerrain = 'mountain';
    this.showDeeds = false;
    this.hoverCell = null;
    this._dragMode = null;               // 'ui' | 'board' for the current left-press
    this._strokeTouched = null;          // cells already acted on this drag stroke

    // Build the deck (for the deed tray) and generate the first map.
    this.state.buildDeck(GameConfig);
    this._regenerate();

    // UI hot-rects, rebuilt each draw so layout follows canvas size.
    this._buttons = [];
  }

  _regenerate() {
    const cols = this._readDim('boardCols', GameConfig.board.defaultCols);
    const rows = this._readDim('boardRows', GameConfig.board.defaultRows);
    const info = BoardGenerator.generate(this.state, GameConfig, { cols, rows });
    this.lastSeed = info.seed;
    this.genCols = info.cols;
    this.genRows = info.rows;
    // Center camera on the generated playfield.
    const s = GameConfig.board.cellSize;
    this.game.camera.zoom = 1;
    this.game.camera.centerOn((cols * s) / 2, (rows * s) / 2);
    // Fit zoom so the whole field is comfortably visible.
    const fit = Math.min(
      this.game.canvas.width / (cols * s + 4 * s),
      this.game.canvas.height / (rows * s + 4 * s)
    );
    this.game.camera.zoom = Math.max(Constants.Camera.MIN_ZOOM, Math.min(1, fit));
    this.game.camera.centerOn((cols * s) / 2, (rows * s) / 2);
  }

  _readDim(id, fallback) {
    const el = document.getElementById(id);
    const v = el ? parseInt(el.value) : NaN;
    return (!isNaN(v) && v > 0 && v <= 60) ? v : fallback;
  }

  _clearPieces() {
    this.state.pieces.clear();
    this.state.pieceByCell.clear();
    Piece._nextId = 1;
  }

  // ── Update ───────────────────────────────────────────────────────────────
  update() {
    const g = this.game;
    g.camera.updateKeyboardPan(g.keys, g.clockTick);

    // Hover cell (skip while drag-panning).
    if (!g.dragging) {
      const wx = g.camera.screenToWorldX(g.mouse.x);
      const wy = g.camera.screenToWorldY(g.mouse.y);
      this.hoverCell = this.sm.boardRenderer.cellAtWorld(wx, wy);
    }

    // On a fresh left press, decide what the press is acting on: a palette/UI
    // hot-rect, or the board. This gates drag-painting so a press that started on
    // a button never paints the cells behind it.
    if (g.mouseDown) {
      this._dragMode = this._hitUI(g.mouseDown.x, g.mouseDown.y) ? 'ui' : 'board';
      this._strokeTouched = new Set();   // start a fresh stroke
    }

    // Drag-paint / drag-erase: apply continuously to the hovered cell while the
    // left button is held over the board. Both terrain and pieces are affected.
    if (g.leftHeld && this._dragMode === 'board' &&
        (this.tool === 'paint' || this.tool === 'erase')) {
      this._applyTool();
    }

    // On release: run the UI action, or (for Place) a single-shot application.
    if (g.click) {
      if (this._dragMode === 'ui') this._handleUIClick(g.click.x, g.click.y);
      else if (this.tool === 'place') this._applyTool();
      this._dragMode = null;
    }
  }

  _applyTool() {
    if (!this.hoverCell) return;
    const { col, row } = this.hoverCell;
    // One action per cell per stroke: dragging over a piece-cell with Erase
    // removes only the piece; the terrain stays until a *separate* press erases it.
    const key = cellKey(col, row);
    if (this._strokeTouched) {
      if (this._strokeTouched.has(key)) return;
      this._strokeTouched.add(key);
    }
    if (this.tool === 'place') {
      // One piece per cell: replace whatever is there.
      this.state.removePieceAt(col, row);
      // Ensure the cell exists so placed pieces sit on real terrain.
      if (!this.state.getCell(col, row)) this.state.setCell(col, row, 'plains', null);
      this.state.addPiece(this.selectedPiece, this.selectedPlayer, col, row);
    } else if (this.tool === 'paint') {
      if (!this.state.getCell(col, row)) this.state.setCell(col, row, this.selectedTerrain, null);
      else this.state.getCell(col, row).terrain = this.selectedTerrain;
    } else if (this.tool === 'erase') {
      const removed = this.state.removePieceAt(col, row);
      if (!removed) this.state.cells.delete(cellKey(col, row)); // clear terrain → undefined
    }
  }

  // ── Draw ─────────────────────────────────────────────────────────────────
  draw() {
    const ctx = this.game.ctx;
    // Board + pieces.
    this.sm.boardRenderer.draw(this.state, this.game.camera, { hover: this.hoverCell });
    for (const piece of this.state.pieces.values()) {
      this.sm.pieceRenderer.drawPiece(piece, this.game.camera);
    }

    // UI overlay.
    this._buttons = [];
    this._drawPalette(ctx);
    if (this.showDeeds) this._drawDeedTray(ctx);
    this._drawHud(ctx);
  }

  // ── UI: palette panel (top-left) ───────────────────────────────────────
  _drawPalette(ctx) {
    const pad = 12, x = 12, y = 12, w = 250;
    let cy = y + 14;

    // Panel background (height computed loosely; tall enough for all rows).
    ctx.fillStyle = Constants.UI.TRAY_BG;
    ctx.fillRect(x, y, w, 404);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.strokeRect(x, y, w, 404);

    const label = (text, ly) => {
      ctx.fillStyle = '#9fe6b0';
      ctx.font = '18px ' + Constants.UI.FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(text, x + pad, ly);
    };

    // Tools row.
    label('TOOL', cy); cy += 8;
    cy = this._row(ctx, x + pad, cy, ['place', 'paint', 'erase'], this.tool,
      (t) => this.tool = t, (t) => t.toUpperCase(), 70, 26);

    // Players row.
    label('PLAYER', cy + 6); cy += 14;
    cy = this._swatchRow(ctx, x + pad, cy, GameConfig.players.colors.map((c, i) => i),
      this.selectedPlayer, (i) => this.selectedPlayer = i,
      (i) => GameConfig.players.colors[i], (i) => 'P' + (i + 1), 52, 26);

    // Pieces row.
    label('PIECE', cy + 6); cy += 14;
    cy = this._pieceRow(ctx, x + pad, cy);

    // Terrain row.
    label('TERRAIN', cy + 6); cy += 14;
    cy = this._swatchRow(ctx, x + pad, cy, GameConfig.terrainOrder,
      this.selectedTerrain, (t) => this.selectedTerrain = t,
      (t) => GameConfig.terrain[t].color, (t) => GameConfig.terrain[t].name.slice(0, 4), 58, 24);

    // Action buttons.
    cy += 10;
    cy = this._row(ctx, x + pad, cy, ['Regenerate', 'Clear Pieces'], null,
      (a) => { if (a === 'Regenerate') this._regenerate(); else this._clearPieces(); },
      (a) => a, 108, 26);
    cy = this._row(ctx, x + pad, cy, [this.showDeeds ? 'Hide Deeds' : 'Show Deeds'], null,
      () => this.showDeeds = !this.showDeeds, (a) => a, 224, 26);
    cy = this._row(ctx, x + pad, cy, ['▶ Movement Test'], null,
      () => this.sm.startPlayScene(), (a) => a, 224, 26);
  }

  // A row of text toggle-buttons; returns next y.
  _row(ctx, x, y, items, active, onClick, labelFn, bw, bh) {
    let bx = x;
    for (const it of items) {
      const sel = active !== null && it === active;
      this._button(ctx, bx, y, bw, bh, labelFn(it), sel, () => onClick(it));
      bx += bw + 6;
    }
    return y + bh + 8;
  }

  // A row of color/glyph swatch buttons.
  _swatchRow(ctx, x, y, items, active, onClick, colorFn, labelFn, bw, bh) {
    let bx = x;
    for (const it of items) {
      const sel = it === active;
      ctx.fillStyle = colorFn(it);
      ctx.fillRect(bx, y, bw, bh);
      ctx.lineWidth = sel ? 3 : 1;
      ctx.strokeStyle = sel ? Constants.UI.SELECT : 'rgba(0,0,0,0.6)';
      ctx.strokeRect(bx, y, bw, bh);
      ctx.fillStyle = '#000';
      ctx.font = '15px ' + Constants.UI.FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelFn(it), bx + bw / 2, y + bh / 2);
      this._buttons.push({ x: bx, y, w: bw, h: bh, action: () => onClick(it) });
      bx += bw + 6;
      if (bx + bw > x + 250 - 24) { bx = x; y += bh + 6; }  // wrap
    }
    return y + bh + 8;
  }

  // Pieces shown as glyph swatches with owner tint.
  _pieceRow(ctx, x, y) {
    let bx = x, bw = 36, bh = 36;
    for (const type of GameConfig.pieceOrder) {
      const sel = type === this.selectedPiece;
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(bx, y, bw, bh);
      ctx.lineWidth = sel ? 3 : 1;
      ctx.strokeStyle = sel ? Constants.UI.SELECT : 'rgba(255,255,255,0.2)';
      ctx.strokeRect(bx, y, bw, bh);
      this.sm.pieceRenderer.drawPieceSwatch(type, this.selectedPlayer, bx + bw / 2, by_center(y, bh), bw * 0.8);
      this._buttons.push({ x: bx, y, w: bw, h: bh, action: () => this.selectedPiece = type });
      bx += bw + 4;
    }
    return y + bh + 8;
  }

  _button(ctx, x, y, w, h, text, selected, action) {
    ctx.fillStyle = selected ? 'rgba(255,235,120,0.22)' : 'rgba(255,255,255,0.06)';
    ctx.fillRect(x, y, w, h);
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeStyle = selected ? Constants.UI.SELECT : 'rgba(255,255,255,0.25)';
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = Constants.UI.TEXT;
    ctx.font = '16px ' + Constants.UI.FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2 + 1);
    this._buttons.push({ x, y, w, h, action });
  }

  // ── UI: deed tray (bottom) ─────────────────────────────────────────────
  _drawDeedTray(ctx) {
    const H = this.game.canvas.height;
    const W = this.game.canvas.width;
    const trayH = 150;
    const ty = H - trayH;
    ctx.fillStyle = Constants.UI.TRAY_BG;
    ctx.fillRect(0, ty, W, trayH);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.strokeRect(0, ty, W, trayH);

    ctx.fillStyle = '#9fe6b0';
    ctx.font = '18px ' + Constants.UI.FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('DEEDS — full deck (' + this.state.deck.length + ' cards)', 14, ty + 22);

    // 13 columns × 4 suit rows of mini cards.
    const cardW = Math.min(46, (W - 28) / 13 - 4);
    const startX = 14, startY = ty + 32;
    let i = 0;
    for (const deed of this.state.deck) {
      const suitIdx = GameConfig.deck.suits.findIndex(s => s.key === deed.suit);
      const rankIdx = GameConfig.deck.ranks.indexOf(deed.rank);
      const cx = startX + rankIdx * (cardW + 4);
      const cyy = startY + suitIdx * (cardW / 0.68 * 0.42);
      this.sm.pieceRenderer.drawDeed(deed, cx, cyy, cardW * 0.62);
      i++;
    }
  }

  // ── UI: HUD ──────────────────────────────────────────────────────────────
  _drawHud(ctx) {
    const H = this.game.canvas.height;
    ctx.fillStyle = 'rgba(255,220,0,0.9)';
    ctx.font = '18px ' + Constants.UI.FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const yHud = this.showDeeds ? H - 160 : H - 14;
    const seed = this.lastSeed;
    ctx.fillText(
      `SETUP  |  ${this.genCols}×${this.genRows}  seed ${seed}  |  drag/right-mouse = pan, wheel = zoom, WASD = pan`,
      14, yHud
    );

    // Hover cell readout (terrain + piece).
    if (this.hoverCell) {
      const cell = this.state.getCell(this.hoverCell.col, this.hoverCell.row);
      const piece = this.state.pieceAt(this.hoverCell.col, this.hoverCell.row);
      let txt = `(${this.hoverCell.col},${this.hoverCell.row}) `;
      txt += cell ? GameConfig.terrain[cell.terrain].name : 'open';
      if (piece) {
        const def = GameConfig.pieces[piece.type];
        const owner = piece.owner === null ? 'neutral' : GameConfig.players.names[piece.owner];
        txt += `  ·  ${def.name} (${owner})`;
      }
      ctx.textAlign = 'right';
      ctx.fillStyle = '#e6e6e6';
      ctx.fillText(txt, this.game.canvas.width - 14, yHud);
    }
  }

  // Non-executing hit test: is (x,y) over a palette button or the deed tray?
  _hitUI(x, y) {
    for (const b of this._buttons) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
    }
    if (this.showDeeds && y >= this.game.canvas.height - 150) return true;
    return false;
  }

  _handleUIClick(x, y) {
    for (const b of this._buttons) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.action(); return true; }
    }
    // Clicks inside the deed tray area are absorbed (don't paint the board under it).
    if (this.showDeeds && y >= this.game.canvas.height - 150) return true;
    return false;
  }
}

// Small helper: vertical center for glyph baseline placement.
function by_center(y, h) { return y + h / 2; }

if (typeof window !== 'undefined') window.SetupScene = SetupScene;
