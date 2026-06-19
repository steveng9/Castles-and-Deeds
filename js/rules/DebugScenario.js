/*
Castles & Deeds
DebugScenario.js  —  STABLE test fixture for iterating on movement.

Builds the specific board Steven asked for so movement can be tried repeatedly:
a 4-region map (one home region per player) where EACH player gets:
  • a cluster of 4 companies and a cluster of 6 companies
  • a wizard next to the 4-cluster, a senator next to the 6-cluster
  • a second senator next to a castle in an ADJACENT region
  • a magistrate by the home castle
  • two dragons: one in the home region, one somewhere else

This is fixture/setup code (a keeper for the dev workflow), NOT movement logic.
It only places pieces into GameState; how they move lives in js/rules/movement/.
*/

const DebugScenario = {
  build(state, config, opts = {}) {
    const cols = opts.cols || config.board.defaultCols;
    const rows = opts.rows || config.board.defaultRows;
    // Regenerate a fresh 4-region map (BoardGenerator drops a neutral castle each).
    const info = BoardGenerator.generate(state, config, { cols, rows });
    state.playerCount = Math.min(config.players.maxPlayers, state.regions.size);

    // Group cells by region; claim each region for the matching player index.
    const byRegion = new Map();
    for (const cell of state.cells.values()) {
      if (cell.region == null) continue;
      if (!byRegion.has(cell.region)) byRegion.set(cell.region, []);
      byRegion.get(cell.region).push(cell);
    }
    for (const region of state.regions.values()) {
      const player = region.id;
      if (player >= state.playerCount) continue;
      region.owner = player;
      // Hand the region's neutral castle to its owner.
      if (region.castleCell) {
        const p = state.pieceByCell.get(region.castleCell);
        if (p) p.owner = player;
      }
    }

    const adj = this._adjacency(state, cols, rows);

    for (let player = 0; player < state.playerCount; player++) {
      const cells = byRegion.get(player) || [];
      if (!cells.length) continue;
      const occupied = new Set([...state.pieceByCell.keys()]);

      // Two spread-out anchor cells within the region for the two clusters.
      const home = parseCellKey(state.regions.get(player).castleCell || cellKey(cells[0].col, cells[0].row));
      const anchorA = this._pickFar(cells, [home], occupied);
      const anchorB = this._pickFar(cells, [home, anchorA], occupied);

      // Clusters of companies (connected blobs of free cells).
      const clusterA = this._placeCluster(state, config, player, 'company', 4, anchorA, occupied);
      const clusterB = this._placeCluster(state, config, player, 'company', 6, anchorB, occupied);

      // Wizard next to cluster A; senator next to cluster B.
      this._placeBeside(state, config, player, 'wizard',  clusterA, occupied);
      this._placeBeside(state, config, player, 'senator', clusterB, occupied);

      // Magistrate by the home castle.
      this._placeBeside(state, config, player, 'magistrate', [home], occupied);

      // Second senator beside a castle in an adjacent region.
      const neighbor = (adj.get(player) || []).find(q => q < state.playerCount);
      if (neighbor != null && state.regions.get(neighbor).castleCell) {
        const nc = parseCellKey(state.regions.get(neighbor).castleCell);
        this._placeBeside(state, config, player, 'senator', [nc], occupied);
      }

      // Two dragons: one in home region, one anywhere on the map.
      const homeFree = this._anyFree(cells, occupied);
      if (homeFree) this._place(state, player, 'dragon', homeFree, occupied);
      const allFree = this._anyFree([...state.cells.values()], occupied);
      if (allFree) this._place(state, player, 'dragon', allFree, occupied);
    }

    return info;
  },

  // ── placement helpers ──────────────────────────────────────────────────────

  _place(state, player, type, cell, occupied) {
    state.addPiece(type, player, cell.col, cell.row);
    occupied.add(cellKey(cell.col, cell.row));
    return cell;
  },

  // Grow a connected blob of `count` free cells from an anchor and fill it.
  _placeCluster(state, config, player, type, count, anchor, occupied) {
    const placed = [];
    const start = this._nearestFree(state, config, anchor, occupied);
    if (!start) return placed;
    const queue = [start], seen = new Set([cellKey(start.col, start.row)]);
    while (queue.length && placed.length < count) {
      const cell = queue.shift();
      this._place(state, player, type, cell, occupied);
      placed.push(cell);
      for (const [dc, dr] of [[0,-1],[1,0],[0,1],[-1,0]]) {
        const col = cell.col + dc, row = cell.row + dr, k = cellKey(col, row);
        if (seen.has(k)) continue; seen.add(k);
        if (this._isFree(state, config, col, row, occupied)) queue.push({ col, row });
      }
    }
    return placed;
  },

  // Place one piece on a free cell adjacent to any cell in `near`.
  _placeBeside(state, config, player, type, near, occupied) {
    for (const ref of near) {
      for (const [dc, dr] of [[0,-1],[1,0],[0,1],[-1,0],[1,-1],[1,1],[-1,1],[-1,-1]]) {
        const col = ref.col + dc, row = ref.row + dr;
        if (this._isFree(state, config, col, row, occupied))
          return this._place(state, player, type, { col, row }, occupied);
      }
    }
    // Fallback: nearest free cell to the first reference.
    const f = this._nearestFree(state, config, near[0], occupied);
    if (f) return this._place(state, player, type, f, occupied);
    return null;
  },

  _isFree(state, config, col, row, occupied) {
    if (occupied.has(cellKey(col, row))) return false;
    const cell = state.getCell(col, row);
    return cell && config.terrain[cell.terrain].passable;
  },

  _nearestFree(state, config, ref, occupied) {
    for (let radius = 0; radius < 25; radius++)
      for (let dr = -radius; dr <= radius; dr++)
        for (let dc = -radius; dc <= radius; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== radius) continue;
          const col = ref.col + dc, row = ref.row + dr;
          if (this._isFree(state, config, col, row, occupied)) return { col, row };
        }
    return null;
  },

  _anyFree(cells, occupied) {
    for (const c of cells) if (!occupied.has(cellKey(c.col, c.row))) return { col: c.col, row: c.row };
    return null;
  },

  // Cell in `cells` farthest (Manhattan) from all `from` points.
  _pickFar(cells, from, occupied) {
    let best = cells[0], bestD = -1;
    for (const c of cells) {
      if (occupied.has(cellKey(c.col, c.row))) continue;
      let d = Infinity;
      for (const f of from) d = Math.min(d, Math.abs(c.col - f.col) + Math.abs(c.row - f.row));
      if (d > bestD) { bestD = d; best = { col: c.col, row: c.row }; }
    }
    return best;
  },

  // region -> [neighbouring region ids] by scanning cell borders.
  _adjacency(state, cols, rows) {
    const adj = new Map();
    const add = (a, b) => {
      if (a == null || b == null || a === b) return;
      if (!adj.has(a)) adj.set(a, new Set());
      adj.get(a).add(b);
    };
    for (const cell of state.cells.values()) {
      const right = state.getCell(cell.col + 1, cell.row);
      const down = state.getCell(cell.col, cell.row + 1);
      if (right) { add(cell.region, right.region); add(right.region, cell.region); }
      if (down)  { add(cell.region, down.region);  add(down.region,  cell.region); }
    }
    const out = new Map();
    for (const [k, v] of adj) out.set(k, [...v]);
    return out;
  },
};

if (typeof window !== 'undefined') window.DebugScenario = DebugScenario;
