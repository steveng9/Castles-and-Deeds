/*
Castles & Deeds
PieceRenderer.js  —  draws pieces and deeds (cards).

VIEW only. Pieces are drawn as recolored Unicode chess glyphs (zero-dependency,
crisp at any zoom) tinted by owner color; neutral pieces are grey. Deeds are
drawn as small playing cards (rank + suit). This is a deliberate placeholder:
when real downloaded art lands, swap the glyph draw for an image draw here and
nothing else in the codebase changes (see TODOS — asset pipeline).
*/

class PieceRenderer {
  constructor(ctx) { this.ctx = ctx; }

  ownerColor(owner) {
    if (owner === null || owner === undefined) return '#cfcfcf';   // neutral
    return GameConfig.players.colors[owner] || '#cfcfcf';
  }

  // Draw one piece centered in its cell, through the camera transform.
  drawPiece(piece, camera) {
    const def = GameConfig.pieces[piece.type];
    if (!def) return;
    const s = GameConfig.board.cellSize;
    const z = camera.zoom;
    const cx = camera.worldToScreenX((piece.col + 0.5) * s);
    const cy = camera.worldToScreenY((piece.row + 0.5) * s);
    const size = s * z * 0.78;
    this._drawGlyph(def.glyph, cx, cy, size, this.ownerColor(piece.owner));
  }

  _drawGlyph(glyph, cx, cy, size, color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${size}px "Segoe UI Symbol", "Apple Symbols", "Noto Sans Symbols2", sans-serif`;
    // Soft drop shadow for readability over terrain.
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(glyph, cx + size * 0.04, cy + size * 0.05);
    ctx.fillStyle = color;
    ctx.fillText(glyph, cx, cy);
    // Crisp outline.
    ctx.lineWidth = Math.max(1, size * 0.03);
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(glyph, cx, cy);
    ctx.restore();
  }

  // ── Deeds (cards) ──────────────────────────────────────────────────────
  // Draw a single card at absolute screen coords (used in trays/HUD, not on the
  // board grid). w defaults to a tidy card aspect (~0.7).
  drawDeed(deed, x, y, w) {
    const ctx = this.ctx;
    const h = w / 0.68;
    const suit = GameConfig.deck.suits.find(s => s.key === deed.suit);
    const r = Math.max(3, w * 0.08);

    ctx.save();
    // Card body.
    ctx.fillStyle = '#f5f1e6';
    this._roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    this._roundRect(x, y, w, h, r);
    ctx.stroke();

    // Corner rank + suit.
    ctx.fillStyle = suit ? suit.color : '#222';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `${Math.round(w * 0.28)}px "Segoe UI", sans-serif`;
    ctx.fillStyle = (suit && (suit.key === 'hearts' || suit.key === 'diamonds')) ? '#c0392b' : '#202020';
    ctx.fillText(deed.rank, x + w * 0.10, y + h * 0.06);

    // Center suit symbol.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(w * 0.5)}px "Segoe UI Symbol", sans-serif`;
    ctx.fillText(suit ? suit.symbol : '?', x + w / 2, y + h / 2 + h * 0.04);

    ctx.restore();
    return { w, h };
  }

  // Translucent "ghost" of a piece at a board cell — used by move previews.
  drawGhost(type, owner, col, row, camera, alpha) {
    const def = GameConfig.pieces[type];
    if (!def) return;
    const s = GameConfig.board.cellSize, z = camera.zoom;
    const cx = camera.worldToScreenX((col + 0.5) * s);
    const cy = camera.worldToScreenY((row + 0.5) * s);
    this.ctx.save();
    this.ctx.globalAlpha = alpha == null ? 0.5 : alpha;
    this._drawGlyph(def.glyph, cx, cy, s * z * 0.78, this.ownerColor(owner));
    this.ctx.restore();
  }

  // Generic glyph for tray palettes (piece type swatch at screen coords).
  drawPieceSwatch(type, owner, cx, cy, size) {
    const def = GameConfig.pieces[type];
    if (!def) return;
    this._drawGlyph(def.glyph, cx, cy, size, this.ownerColor(owner));
  }

  _roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

if (typeof window !== 'undefined') window.PieceRenderer = PieceRenderer;
