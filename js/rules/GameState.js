/*
Castles & Deeds
GameState.js  —  pure game state model. NO rendering, NO canvas, NO DOM.

This is the authoritative description of "what exists right now": which pieces
sit on which cells, who owns what, and each player's hand of deeds. Scenes and
renderers READ from here; the (future) rules engine MUTATES it through methods.

Keeping this view-free is deliberate: it can be serialized for networking
(host-authoritative snapshots, same pattern as Zerlin) and unit-tested without a
browser. Treat `cellKey(col,row)` as the canonical map key everywhere.
*/

function cellKey(col, row) { return col + ',' + row; }
function parseCellKey(key) { const [c, r] = key.split(',').map(Number); return { col: c, row: r }; }

class Piece {
  constructor(type, owner, col, row) {
    this.type = type;     // key into GameConfig.pieces
    this.owner = owner;   // player index (0..N-1), or null for neutral
    this.col = col;
    this.row = row;
    this.id = Piece._nextId++;
  }
}
Piece._nextId = 1;

class Deed {
  constructor(rank, suit) {
    this.rank = rank;     // 'A','2'..'K'
    this.suit = suit;     // 'spades' | 'hearts' | 'diamonds' | 'clubs'
    this.id = rank + '_' + suit;
  }
}

class GameState {
  constructor() {
    // Board cells: Map<cellKey, { col, row, terrain, region }>
    // Only *defined* cells live here; undefined cells render as empty plains.
    this.cells = new Map();

    // Pieces: Map<pieceId, Piece>, plus a fast lookup by cell.
    this.pieces = new Map();
    this.pieceByCell = new Map();   // cellKey -> Piece (one piece per cell for now)

    // Regions: Map<regionId, { id, name, color, owner, castleCell }>
    this.regions = new Map();

    // Deeds: the full deck plus per-player hands.
    this.deck = [];                 // undealt Deed[]
    this.hands = [];                // hands[playerIndex] = Deed[]

    this.playerCount = 2;
  }

  // ── Cells ────────────────────────────────────────────────────────────────
  setCell(col, row, terrain, region) {
    this.cells.set(cellKey(col, row), { col, row, terrain: terrain || 'plains', region: region ?? null });
  }
  getCell(col, row) { return this.cells.get(cellKey(col, row)) || null; }

  // ── Pieces ───────────────────────────────────────────────────────────────
  addPiece(type, owner, col, row) {
    const p = new Piece(type, owner, col, row);
    this.pieces.set(p.id, p);
    this.pieceByCell.set(cellKey(col, row), p);
    return p;
  }
  removePieceAt(col, row) {
    const k = cellKey(col, row);
    const p = this.pieceByCell.get(k);
    if (p) { this.pieces.delete(p.id); this.pieceByCell.delete(k); }
    return p || null;
  }
  pieceAt(col, row) { return this.pieceByCell.get(cellKey(col, row)) || null; }

  // ── Regions ──────────────────────────────────────────────────────────────
  addRegion(id, name, color) {
    this.regions.set(id, { id, name, color, owner: null, castleCell: null });
  }

  // ── Deeds ────────────────────────────────────────────────────────────────
  buildDeck(config) {
    this.deck = [];
    for (const suit of config.deck.suits) {
      for (const rank of config.deck.ranks) {
        this.deck.push(new Deed(rank, suit.key));
      }
    }
  }

  // ── Serialization (for networking later — Zerlin-style snapshots) ─────────
  serialize() {
    return {
      cells: Array.from(this.cells.values()),
      pieces: Array.from(this.pieces.values()).map(p => ({ type: p.type, owner: p.owner, col: p.col, row: p.row })),
      regions: Array.from(this.regions.values()),
      playerCount: this.playerCount,
    };
  }
  static deserialize(data) {
    const gs = new GameState();
    gs.playerCount = data.playerCount;
    for (const c of data.cells) gs.setCell(c.col, c.row, c.terrain, c.region);
    for (const p of data.pieces) gs.addPiece(p.type, p.owner, p.col, p.row);
    for (const r of data.regions) gs.regions.set(r.id, r);
    return gs;
  }
}

if (typeof window !== 'undefined') {
  window.GameState = GameState;
  window.Piece = Piece;
  window.Deed = Deed;
  window.cellKey = cellKey;
  window.parseCellKey = parseCellKey;
}
