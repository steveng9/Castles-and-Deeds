/*
Castles & Deeds
PlayScene.js  —  STABLE interactive layer for testing movement.

What lives here (keepers, NOT movement rules):
  • the drag-to-preview GESTURE: press a piece, drag a direction to preview a
    move, drag further/elsewhere to cycle the drawn options, release to commit,
    Esc to cancel;
  • the ENERGY BAR + End Turn (delegates economy to TurnManager);
  • preview RENDERING of whatever `Move` objects the movement model returns.

What does NOT live here: how moves are generated. That's the swappable model at
window.ActiveMovementModel (js/rules/movement/, see MOVEMENT.md). This scene only
knows the generic Move shape, so dropping in a new movement model needs no change
here.
*/

class PlayScene {
  constructor(sm) {
    this.sm = sm;
    this.game = sm.game;
    this.state = sm.state;
    this.movement = window.ActiveMovementModel;

    DebugScenario.build(this.state, GameConfig);
    this.turn = new TurnManager(this.state, GameConfig);
    this._fitCamera();

    // Gesture state.
    this.hoverCell = null;
    this.dragPiece = null;       // piece currently being dragged
    this.pressScreen = null;     // where the press started (screen px)
    this.candidates = [];        // moves "drawn" for the pressed piece
    this.active = null;          // currently-previewed candidate
    this._dragMode = null;       // 'ui' | 'piece' | 'board'
    this._buttons = [];
  }

  _fitCamera() {
    const s = GameConfig.board.cellSize;
    const cols = GameConfig.board.defaultCols, rows = GameConfig.board.defaultRows;
    const fit = Math.min(this.game.canvas.width / (cols * s + 4 * s),
                         this.game.canvas.height / (rows * s + 4 * s));
    this.game.camera.zoom = Math.max(Constants.Camera.MIN_ZOOM, Math.min(1, fit));
    this.game.camera.centerOn((cols * s) / 2, (rows * s) / 2);
  }

  // ── Update / input ─────────────────────────────────────────────────────────
  update() {
    const g = this.game;
    g.camera.updateKeyboardPan(g.keys, g.clockTick);

    // Esc cancels an in-progress drag (drops the piece, no move committed).
    if (g.keys['Escape'] && this.dragPiece) this._cancelDrag();

    if (!g.dragging && !this.dragPiece) {
      const wx = g.camera.screenToWorldX(g.mouse.x), wy = g.camera.screenToWorldY(g.mouse.y);
      this.hoverCell = this.sm.boardRenderer.cellAtWorld(wx, wy);
    }

    // Press: UI button, a movable own piece, or empty board.
    if (g.mouseDown) {
      if (this._hitUI(g.mouseDown.x, g.mouseDown.y)) {
        this._dragMode = 'ui';
      } else {
        const piece = this._pieceAtScreen(g.mouseDown.x, g.mouseDown.y);
        if (piece && piece.owner === this.turn.current && this.movement.movable(piece)) {
          this.dragPiece = piece;
          this.pressScreen = { x: g.mouseDown.x, y: g.mouseDown.y };
          this.candidates = this.movement.candidates(this.state, GameConfig, piece, this.turn.turnSeed);
          this.active = null;
          this._dragMode = 'piece';
        } else {
          this._dragMode = 'board';
        }
      }
    }

    // Drag: pick the candidate matching the current drag vector.
    if (g.leftHeld && this.dragPiece) {
      const dv = { x: g.mouse.x - this.pressScreen.x, y: g.mouse.y - this.pressScreen.y };
      this.active = this._selectCandidate(dv);
    }

    // Release: commit (piece) or run the UI action.
    if (g.click) {
      if (this._dragMode === 'ui') this._handleUIClick(g.click.x, g.click.y);
      else if (this.dragPiece) {
        if (this.active && this.turn.canAfford(this.active.cost)) this.turn.applyMove(this.active);
        this._cancelDrag();
      }
      this._dragMode = null;
    }
  }

  _cancelDrag() { this.dragPiece = null; this.pressScreen = null; this.candidates = []; this.active = null; }

  _pieceAtScreen(sx, sy) {
    const cell = this.sm.boardRenderer.cellAtWorld(
      this.game.camera.screenToWorldX(sx), this.game.camera.screenToWorldY(sy));
    return cell ? this.state.pieceAt(cell.col, cell.row) : null;
  }

  // Map a screen drag vector to the best candidate (direction sector + reach tier).
  _selectCandidate(dv) {
    const len = Math.hypot(dv.x, dv.y);
    if (len < 6) return null;
    const ux = dv.x / len, uy = dv.y / len;
    let best = null, bestScore = -Infinity;
    for (const c of this.candidates) {
      if (len < c.selectDist) continue;                 // not dragged far enough for this tier
      const dot = ux * c.dir.x + uy * c.dir.y;
      if (dot < 0.5) continue;                          // outside this direction's ~60° sector
      const score = dot + c.selectDist * 0.0008;        // ties → prefer the bigger tier
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  // ── Draw ─────────────────────────────────────────────────────────────────
  draw() {
    const ctx = this.game.ctx, cam = this.game.camera;
    this.sm.boardRenderer.draw(this.state, cam, { hover: this.dragPiece ? null : this.hoverCell });
    for (const piece of this.state.pieces.values()) this.sm.pieceRenderer.drawPiece(piece, cam);

    if (this.dragPiece) this._drawPreview(ctx, cam);

    this._buttons = [];
    this._drawEnergy(ctx);
    this._drawHud(ctx);
  }

  _cellCenter(cam, col, row) {
    const s = GameConfig.board.cellSize;
    return { x: cam.worldToScreenX((col + 0.5) * s), y: cam.worldToScreenY((row + 0.5) * s) };
  }

  _drawPreview(ctx, cam) {
    const origin = this._cellCenter(cam, this.dragPiece.col, this.dragPiece.row);

    // Faint arrows for every drawn option, so you can see where you can go.
    for (const c of this.candidates) {
      if (c === this.active) continue;
      const dest = this._candidateCentroid(cam, c);
      this._arrow(ctx, origin.x, origin.y, dest.x, dest.y, 'rgba(255,255,255,0.18)', 2);
    }

    if (this.active) {
      const affordable = this.turn.canAfford(this.active.cost);
      const col = affordable ? 'rgba(255,235,120,0.9)' : 'rgba(230,80,70,0.9)';
      // Ghost destinations + per-piece move lines.
      for (const s of this.active.steps) {
        const p = this.state.pieces.get(s.id);
        const a = this._cellCenter(cam, s.fromCol, s.fromRow), b = this._cellCenter(cam, s.toCol, s.toRow);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        if (p) this.sm.pieceRenderer.drawGhost(p.type, p.owner, s.toCol, s.toRow, cam, affordable ? 0.55 : 0.35);
      }
      const dest = this._candidateCentroid(cam, this.active);
      this._arrow(ctx, origin.x, origin.y, dest.x, dest.y, col, 3);

      // Cost badge by the cursor.
      const m = this.game.mouse;
      const txt = `−${this.active.cost} energy  (${this.active.steps.length} pcs)` + (affordable ? '' : '  — not enough!');
      ctx.font = '18px ' + Constants.UI.FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const w = ctx.measureText(txt).width + 16;
      ctx.fillStyle = 'rgba(10,12,10,0.9)'; ctx.fillRect(m.x + 14, m.y - 14, w, 26);
      ctx.strokeStyle = col; ctx.strokeRect(m.x + 14, m.y - 14, w, 26);
      ctx.fillStyle = affordable ? Constants.UI.TEXT : '#ff9a90';
      ctx.fillText(txt, m.x + 22, m.y);
    }
  }

  _candidateCentroid(cam, c) {
    let sx = 0, sy = 0;
    for (const s of c.steps) { const p = this._cellCenter(cam, s.toCol, s.toRow); sx += p.x; sy += p.y; }
    const n = Math.max(1, c.steps.length);
    return { x: sx / n, y: sy / n };
  }

  _arrow(ctx, x1, y1, x2, y2, color, width) {
    const a = Math.atan2(y2 - y1, x2 - x1), head = 9 + width * 2;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(a - 0.4), y2 - head * Math.sin(a - 0.4));
    ctx.lineTo(x2 - head * Math.cos(a + 0.4), y2 - head * Math.sin(a + 0.4));
    ctx.closePath(); ctx.fill();
  }

  // ── Energy bar (bottom-left) ───────────────────────────────────────────────
  _drawEnergy(ctx) {
    const x = 14, y = this.game.canvas.height - 40, w = 360, h = 22;
    const t = this.turn, frac = t.energy / t.energyMax;
    const pending = this.active ? Math.min(this.active.cost, t.energy) / t.energyMax : 0;

    ctx.fillStyle = 'rgba(10,12,10,0.9)'; ctx.fillRect(x - 6, y - 26, w + 12, h + 34);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.strokeRect(x - 6, y - 26, w + 12, h + 34);

    ctx.fillStyle = '#9fe6b0'; ctx.font = '18px ' + Constants.UI.FONT;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(`ENERGY  ${Math.round(t.energy)} / ${t.energyMax}`, x, y - 8);

    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(x, y, w, h);
    // Remaining-after-this-move (green) + pending cost (amber) segments.
    const keepW = Math.max(0, (frac - pending)) * w;
    ctx.fillStyle = '#3fae6a'; ctx.fillRect(x, y, keepW, h);
    if (pending > 0) { ctx.fillStyle = 'rgba(255,200,60,0.85)'; ctx.fillRect(x + keepW, y, pending * w, h); }
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.strokeRect(x, y, w, h);
  }

  // ── HUD + buttons (top) ────────────────────────────────────────────────────
  _drawHud(ctx) {
    const W = this.game.canvas.width, t = this.turn;
    const name = GameConfig.players.names[t.current], col = GameConfig.players.colors[t.current];

    ctx.fillStyle = 'rgba(10,12,10,0.9)'; ctx.fillRect(0, 0, W, 38);
    ctx.fillStyle = col; ctx.fillRect(10, 9, 20, 20);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.strokeRect(10, 9, 20, 20);
    ctx.fillStyle = Constants.UI.TEXT; ctx.font = '18px ' + Constants.UI.FONT;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    let info = `PLAY (debug)  ·  ${name}'s turn  ·  drag a piece to preview · release = commit · Esc = cancel`;
    if (t.lastSpawn) info += `  ·  +${t.lastSpawn} spawned last turn`;
    ctx.fillText(info, 40, 20);

    // Top-right buttons.
    let bx = W - 12;
    bx = this._button(ctx, bx, 6, 110, 26, 'End Turn', () => this.turn.endTurn(), true);
    bx = this._button(ctx, bx, 6, 130, 26, 'New Scenario', () => this.sm.startPlayScene(), false);
    bx = this._button(ctx, bx, 6, 80, 26, 'Setup', () => this.sm.startSetupScene(), false);
  }

  // Right-anchored button; returns the next x to its left.
  _button(ctx, rightX, y, w, h, text, action, accent) {
    const x = rightX - w;
    ctx.fillStyle = accent ? 'rgba(255,235,120,0.18)' : 'rgba(255,255,255,0.06)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = accent ? Constants.UI.SELECT : 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = Constants.UI.TEXT; ctx.font = '16px ' + Constants.UI.FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2 + 1);
    this._buttons.push({ x, y, w, h, action });
    return x - 8;
  }

  _hitUI(x, y) {
    for (const b of this._buttons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
    return false;
  }
  _handleUIClick(x, y) {
    for (const b of this._buttons)
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.action(); return true; }
    return false;
  }
}

if (typeof window !== 'undefined') window.PlayScene = PlayScene;
