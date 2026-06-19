/*
Castles & Deeds
BoardRenderer.js  —  draws the board (terrain, grid, region tints, hover/select).

VIEW only: reads GameState + GameConfig, draws through the Camera transform.
Never mutates state. Square topology v1; a hex renderer would be a sibling class
implementing the same draw(state, camera) surface (see TODOS).

Only cells within the viewport are drawn (the board is infinite; we iterate the
visible cell range, not the whole map).
*/

class BoardRenderer {
  constructor(ctx) { this.ctx = ctx; }

  // The cell column/row under a world point (works for the infinite grid).
  cellAtWorld(wx, wy) {
    const s = GameConfig.board.cellSize;
    return { col: Math.floor(wx / s), row: Math.floor(wy / s) };
  }

  // Visible cell range for the current camera (with a 1-cell margin).
  visibleRange(camera) {
    const s = GameConfig.board.cellSize;
    const c0 = Math.floor(camera.x / s) - 1;
    const r0 = Math.floor(camera.y / s) - 1;
    const c1 = Math.floor((camera.x + camera.viewW / camera.zoom) / s) + 1;
    const r1 = Math.floor((camera.y + camera.viewH / camera.zoom) / s) + 1;
    return { c0, r0, c1, r1 };
  }

  draw(state, camera, opts = {}) {
    const ctx = this.ctx;
    const s = GameConfig.board.cellSize;
    const z = camera.zoom;
    const { c0, r0, c1, r1 } = this.visibleRange(camera);

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const sx = camera.worldToScreenX(c * s);
        const sy = camera.worldToScreenY(r * s);
        const px = s * z;
        const cell = state.getCell(c, r);

        if (cell) {
          // Terrain fill.
          ctx.fillStyle = GameConfig.terrain[cell.terrain].color;
          ctx.fillRect(sx, sy, px + 1, px + 1);
          // Region tint overlay (subtle, so terrain still reads).
          if (cell.region !== null && cell.region !== undefined) {
            const reg = state.regions.get(cell.region);
            if (reg) {
              ctx.globalAlpha = 0.18;
              ctx.fillStyle = reg.color;
              ctx.fillRect(sx, sy, px + 1, px + 1);
              ctx.globalAlpha = 1;
            }
          }
        } else {
          // Undefined cell: faint checker so the infinite plains still read.
          ctx.fillStyle = ((c + r) & 1) ? 'rgba(255,255,255,0.012)' : 'rgba(0,0,0,0.10)';
          ctx.fillRect(sx, sy, px + 1, px + 1);
        }

        // Grid line.
        ctx.strokeStyle = Constants.UI.GRID_LINE;
        ctx.lineWidth = 1;
        ctx.strokeRect(sx, sy, px, px);
      }
    }

    // Region borders (draw thicker lines where neighboring cells differ).
    this._drawRegionBorders(state, camera, c0, r0, c1, r1);

    // Hover + selection highlights.
    if (opts.hover) this._highlightCell(camera, opts.hover.col, opts.hover.row, Constants.UI.HOVER, 2);
    if (opts.select) this._highlightCell(camera, opts.select.col, opts.select.row, Constants.UI.SELECT, 3);
  }

  _drawRegionBorders(state, camera, c0, r0, c1, r1) {
    const ctx = this.ctx;
    const s = GameConfig.board.cellSize;
    const z = camera.zoom;
    ctx.lineWidth = Math.max(1.5, 2 * z);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = state.getCell(c, r);
        if (!cell || cell.region === null) continue;
        const reg = state.regions.get(cell.region);
        if (!reg) continue;
        ctx.strokeStyle = reg.color;
        const sx = camera.worldToScreenX(c * s);
        const sy = camera.worldToScreenY(r * s);
        const px = s * z;
        const right = state.getCell(c + 1, r);
        const down = state.getCell(c, r + 1);
        ctx.beginPath();
        if (!right || right.region !== cell.region) { ctx.moveTo(sx + px, sy); ctx.lineTo(sx + px, sy + px); }
        if (!down || down.region !== cell.region)   { ctx.moveTo(sx, sy + px); ctx.lineTo(sx + px, sy + px); }
        ctx.stroke();
      }
    }
  }

  _highlightCell(camera, col, row, color, width) {
    const ctx = this.ctx;
    const s = GameConfig.board.cellSize;
    const z = camera.zoom;
    const sx = camera.worldToScreenX(col * s);
    const sy = camera.worldToScreenY(row * s);
    const px = s * z;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.strokeRect(sx + 1, sy + 1, px - 2, px - 2);
  }
}

if (typeof window !== 'undefined') window.BoardRenderer = BoardRenderer;
