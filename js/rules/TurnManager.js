/*
Castles & Deeds
TurnManager.js  —  STABLE rules infrastructure: turns + the energy economy.

This is a KEEPER (game-wide), not movement-specific. It knows nothing about HOW
moves are generated — it only applies generic `Move` objects (see the movement
model / MOVEMENT.md) and runs the energy budget around them:

  • Each turn a player gets a full energy bar.
  • Committing a Move subtracts the Move's `cost`.
  • At end of turn, leftover energy is converted to new companies spawned at the
    player's home castle (companySpawnCost energy each).

Pure model logic — no canvas/DOM. Mutates GameState through here only.
*/

class TurnManager {
  constructor(state, config) {
    this.state = state;
    this.config = config;
    this.debug = !!config.debug.developerControlAllSeats;
    this.playerCount = state.playerCount;
    this.current = 0;
    this.lastSpawn = 0;                 // companies spawned at last endTurn (for HUD)
    this.turnSeed = (Math.random() * 1e9) >>> 0;
    this.energyMax = this._maxEnergy();
    this.energy = this.energyMax;
  }

  _maxEnergy() {
    return this.debug ? this.config.debug.energyPerTurn : this.config.economy.energyPerTurn;
  }

  canAfford(cost) { return cost <= this.energy + 1e-9; }

  // Apply a generic Move (vacate origins first so a mass can shift into vacated
  // cells, then place at destinations). Returns true if committed.
  applyMove(move) {
    if (!move || !this.canAfford(move.cost)) return false;
    for (const s of move.steps) this.state.pieceByCell.delete(cellKey(s.fromCol, s.fromRow));
    for (const s of move.steps) {
      const p = this.state.pieces.get(s.id);
      if (!p) continue;
      p.col = s.toCol; p.row = s.toRow;
      this.state.pieceByCell.set(cellKey(s.toCol, s.toRow), p);
    }
    this.energy -= move.cost;
    return true;
  }

  endTurn() {
    this.lastSpawn = this._spawnFromLeftover(this.current);
    this.current = (this.current + 1) % this.playerCount;
    // New "hand" of movement options next turn, fresh energy.
    this.turnSeed = (Math.imul(this.turnSeed, 1103515245) + 12345) >>> 0;
    this.energyMax = this._maxEnergy();
    this.energy = this.energyMax;
  }

  // Leftover energy → companies at the player's home castle. Returns count.
  _spawnFromLeftover(player) {
    const n = Math.floor(this.energy / this.config.economy.companySpawnCost);
    if (n <= 0) return 0;
    const home = this._homeCastleCell(player);
    if (!home) return 0;
    let placed = 0;
    for (const cell of this._freeCellsNear(home.col, home.row, n)) {
      this.state.addPiece('company', player, cell.col, cell.row);
      if (++placed >= n) break;
    }
    return placed;
  }

  _homeCastleCell(player) {
    for (const region of this.state.regions.values()) {
      if (region.owner === player && region.castleCell) return parseCellKey(region.castleCell);
    }
    return null;
  }

  // Spiral out from (c,r) yielding passable, unoccupied cells (skips the centre).
  *_freeCellsNear(c, r, want) {
    let found = 0;
    for (let radius = 1; radius < 30 && found < want; radius++) {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== radius) continue; // ring only
          const col = c + dc, row = r + dr;
          const cell = this.state.getCell(col, row);
          const passable = !cell || this.config.terrain[cell.terrain].passable;
          if (passable && !this.state.pieceAt(col, row)) { found++; yield { col, row }; }
        }
      }
    }
  }
}

if (typeof window !== 'undefined') window.TurnManager = TurnManager;
