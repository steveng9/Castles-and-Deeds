/*
Castles & Deeds
BoardGenerator.js  —  procedurally fills a GameState with a fresh map.

Pure model logic (no rendering). Produces a *different* map each call so every
game's terrain + region layout is novel — the map is meant to be the star of the
show. Dimensions and mix are driven entirely by GameConfig.board, so designers
tune the feel from one place.

Algorithm (square topology v1):
  1. Lay a cols×rows field of plains cells.
  2. Scatter terrain "blobs" (random walks) weighted by GameConfig.terrain weights.
  3. Grow `regionCount` regions from random seeds via nearest-seed assignment
     (a cheap Voronoi), then drop one neutral Castle at each region's centroid.

Everything is seedable for reproducibility (pass a seed for networked games so
host + client generate identical maps).
*/

class RNG {
  // Mulberry32 — tiny deterministic PRNG so host/client can share a seed.
  constructor(seed) { this.s = (seed >>> 0) || 1; }
  next() {
    this.s |= 0; this.s = (this.s + 0x6D2B79F5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n) { return Math.floor(this.next() * n); }
  pick(arr) { return arr[this.int(arr.length)]; }
}

const BoardGenerator = {

  // Returns the seed actually used (so callers can store/share it).
  generate(gameState, config, opts = {}) {
    const b = config.board;
    const cols = opts.cols || b.defaultCols;
    const rows = opts.rows || b.defaultRows;
    const seed = opts.seed || (Math.floor(Math.random() * 1e9) + 1);
    const rng = new RNG(seed);

    gameState.cells.clear();
    gameState.regions.clear();
    // Fresh map → drop all old pieces (castles + any authored placements) so the
    // previous layout doesn't linger on top of the new terrain.
    gameState.pieces.clear();
    gameState.pieceByCell.clear();

    // 1. Base plains.
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        gameState.setCell(c, r, 'plains', null);

    // 2. Terrain blobs.
    this._scatterTerrain(gameState, config, rng, cols, rows);

    // 3. Regions + castles.
    this._growRegions(gameState, config, rng, cols, rows);

    return { seed, cols, rows };
  },

  _weightedTerrain(config, rng) {
    const w = config.board.terrainWeights;
    const entries = Object.entries(w);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    let roll = rng.next() * total;
    for (const [key, val] of entries) { if ((roll -= val) <= 0) return key; }
    return 'plains';
  },

  _scatterTerrain(gameState, config, rng, cols, rows) {
    // Number of blobs scales with area; each is a short random walk of one type.
    const blobs = Math.max(4, Math.round((cols * rows) / 18));
    for (let i = 0; i < blobs; i++) {
      const type = this._weightedTerrain(config, rng);
      if (type === 'plains') continue;
      let c = rng.int(cols), r = rng.int(rows);
      const steps = 2 + rng.int(5);
      for (let s = 0; s < steps; s++) {
        const cell = gameState.getCell(c, r);
        if (cell) cell.terrain = type;
        // wander
        c = Math.max(0, Math.min(cols - 1, c + rng.int(3) - 1));
        r = Math.max(0, Math.min(rows - 1, r + rng.int(3) - 1));
      }
    }
  },

  _growRegions(gameState, config, rng, cols, rows) {
    const count = Math.min(config.board.regionCount, Math.max(2, Math.floor((cols * rows) / 6)));

    // Float seeds (sub-cell precision) so Lloyd relaxation can settle smoothly.
    let seeds = [];
    for (let i = 0; i < count; i++) seeds.push({ c: rng.next() * cols, r: rng.next() * rows });

    // Lloyd's relaxation: assign each cell to its nearest seed, then move every
    // seed to the centroid of its cells, and repeat. On a uniform field this
    // converges toward equal-area Voronoi cells — fixes the "some regions are
    // tiny" problem. Shapes stay irregular (lots of odd angles); only AREA evens.
    const ITER = 8;
    let assign = new Int32Array(cols * rows);
    for (let it = 0; it <= ITER; it++) {
      const acc = seeds.map(() => ({ sc: 0, sr: 0, n: 0 }));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let best = 0, bestD = Infinity;
          for (let i = 0; i < seeds.length; i++) {
            const d = (seeds[i].c - c) ** 2 + (seeds[i].r - r) ** 2;
            if (d < bestD) { bestD = d; best = i; }
          }
          assign[r * cols + c] = best;
          acc[best].sc += c; acc[best].sr += r; acc[best].n++;
        }
      }
      if (it < ITER) {
        for (let i = 0; i < seeds.length; i++) {
          if (acc[i].n > 0) seeds[i] = { c: acc[i].sc / acc[i].n, r: acc[i].sr / acc[i].n };
          else seeds[i] = { c: rng.next() * cols, r: rng.next() * rows }; // reseed if starved
        }
      }
    }

    // Register regions, write the final assignment to cells, accumulate centroids.
    for (let i = 0; i < count; i++) gameState.addRegion(i, 'Region ' + (i + 1), this._regionColor(i, count));
    const acc = seeds.map(() => ({ sumC: 0, sumR: 0, n: 0 }));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = gameState.getCell(c, r);
        const reg = assign[r * cols + c];
        if (cell) { cell.region = reg; acc[reg].sumC += c; acc[reg].sumR += r; acc[reg].n++; }
      }
    }

    // Drop one neutral Castle near each region centroid (on a passable cell).
    for (let i = 0; i < count; i++) {
      if (acc[i].n === 0) continue;
      let cc = Math.round(acc[i].sumC / acc[i].n);
      let cr = Math.round(acc[i].sumR / acc[i].n);
      const cell = this._nearestPassable(gameState, config, cc, cr, cols, rows);
      if (cell) {
        cell.terrain = cell.terrain === 'water' ? 'plains' : cell.terrain;
        gameState.addPiece('castle', null, cell.col, cell.row);
        gameState.regions.get(i).castleCell = cellKey(cell.col, cell.row);
      }
    }
  },

  _nearestPassable(gameState, config, c, r, cols, rows) {
    for (let radius = 0; radius < Math.max(cols, rows); radius++) {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const cell = gameState.getCell(c + dc, r + dr);
          if (cell && config.terrain[cell.terrain].passable && !gameState.pieceAt(cell.col, cell.row))
            return cell;
        }
      }
    }
    return gameState.getCell(c, r);
  },

  _regionColor(i, count) {
    // Muted, distinct hues for region tints (kept subtle so terrain still reads).
    const hue = Math.round((i / count) * 360);
    return `hsl(${hue}, 35%, 55%)`;
  },
};

if (typeof window !== 'undefined') { window.BoardGenerator = BoardGenerator; window.RNG = RNG; }
