/*
Castles & Deeds
TendencyMovementV1.js  —  ★ SWAPPABLE MOVEMENT LOGIC (version 1). ★

⚠️  THIS is the churny file. Everything about *how pieces tend to move* lives
    here and ONLY here. The rest of the game (energy bar, turns, debug mode, the
    drag-to-preview gesture, the preview rendering) does NOT know these rules — it
    only consumes the generic `Move` objects this file produces. To try a totally
    different movement feel, write a sibling model and swap which one is active at
    the bottom of this file. See MOVEMENT.md for the contract + boundary.

The v1 idea (Steven's brief):
  • No fixed movement schemes — pieces have *tendencies*. Each turn a small,
    slightly-random set of candidate moves is "drawn" per piece (like a hand of
    cards), with options in several directions.
  • Reach differs by piece: dragons farthest, wizard far, senator like wizard,
    companies short, magistrate like companies, castles immobile.
  • Pressing a clustered company moves the whole mass; terrain deforms the
    formation as it advances (an "L" becomes a "T" over mountains) because each
    unit spends a per-cell terrain cost out of a shared reach budget.
  • Some pieces COUPLE: dragging the wizard also drifts the player's dragons.
  • Two tiers per direction: a small move (drag a little) and a big move (drag
    far) that costs more energy.

CONTRACT (what stable code relies on — keep these stable even across model swaps):
  movable(piece) -> bool
  candidates(state, config, piece, turnSeed) -> Move[]
  A Move = {
    steps:    [{ id, fromCol, fromRow, toCol, toRow }],  // pieces that relocate
    cost:     Number,            // energy spent if committed
    dir:      { x, y },          // UNIT intended drag direction (col+, row+ = S)
    selectDist: Number,          // min drag distance (px) to select this tier
    tier:     'near' | 'far',
    label:    String,
  }
Everything else in this file is private and free to change.
*/

// ── Tunables for THIS model (deliberately NOT in GameConfig, so a model swap can
//    redefine tendencies wholesale without touching the global knob-box). ──────
const TendencyParams = {
  // Reach is a TERRAIN-COST budget: a plains step costs 1, mountain 2, forest 1.5.
  // Bigger reach = travels farther. `near`/`far` are the two drag tiers.
  profiles: {
    company:    { near: 1, far: 2, group: true,  couple: null     },
    magistrate: { near: 1, far: 2, group: false, couple: null     },
    senator:    { near: 2, far: 4, group: false, couple: null     },
    wizard:     { near: 3, far: 6, group: false, couple: 'dragon'  },
    dragon:     { near: 4, far: 8, group: false, couple: null      },
    castle:     null,  // immobile
  },
  directions: [ // 8 compass dirs in cell space (row+ = south)
    { x:  0, y: -1 }, { x:  1, y: -1 }, { x:  1, y:  0 }, { x:  1, y:  1 },
    { x:  0, y:  1 }, { x: -1, y:  1 }, { x: -1, y:  0 }, { x: -1, y: -1 },
  ],
  dirsPerTurn:  6,    // directions "drawn" as options (of 8) — broad freedom, so a
                      // piece can usually go several ways unless terrain/edges block
  clusterCap:   16,   // max companies pulled into one mass move
  stepEnergy:   1.0,  // energy per unit of terrain-cost moved
  groupDiscount: 0.6, // mass moves cost less per unit (battalions are efficient)
  coupleReach:  3,    // how far a coupled piece (e.g. dragon) drifts
  nearDragPx:   26,   // drag distance that selects the NEAR tier
  farDragPx:    80,   // drag distance that selects the FAR tier
};

class TendencyMovementV1 {
  movable(piece) { return !!(piece && TendencyParams.profiles[piece.type]); }

  // Build the small "drawn hand" of candidate moves for pressing `piece`.
  candidates(state, config, piece, turnSeed) {
    const prof = TendencyParams.profiles[piece.type];
    if (!prof) return [];
    // Seed per (piece, turn) so options are stable to explore within a turn but
    // re-draw next turn. RNG is the global mulberry32 from BoardGenerator.js.
    const rng = new RNG(((turnSeed ^ (piece.id * 2654435761)) >>> 0) || 1);
    const dirs = this._drawDirections(rng);

    const movers = prof.group ? this._cluster(state, piece) : [piece];
    const coupled = prof.couple ? this._coupled(state, piece, prof.couple) : [];
    // Snapshot of EVERY occupied cell. During a move each mover vacates its own
    // cell and reserves its destination, so two pieces can never end up stacked.
    const occupied = new Set();
    for (const q of state.pieces.values()) occupied.add(cellKey(q.col, q.row));

    const out = [];
    for (const dir of dirs) {
      for (const tier of ['near', 'far']) {
        const m = this._buildMove(state, config, movers, coupled, dir, prof[tier], prof, occupied);
        if (!m) continue;
        const len = Math.hypot(dir.x, dir.y) || 1;
        m.dir = { x: dir.x / len, y: dir.y / len };  // unit, for gesture matching
        m.tier = tier;
        m.selectDist = tier === 'near' ? TendencyParams.nearDragPx : TendencyParams.farDragPx;
        m.label = (movers.length > 1 ? movers.length + ' companies' : config.pieces[piece.type].name) +
                  (tier === 'far' ? ' — push' : ' — shift');
        out.push(m);
      }
    }
    return out;
  }

  // ── internals ──────────────────────────────────────────────────────────────

  _drawDirections(rng) {
    const d = TendencyParams.directions.slice();
    for (let i = d.length - 1; i > 0; i--) { const j = rng.int(i + 1); [d[i], d[j]] = [d[j], d[i]]; }
    return d.slice(0, TendencyParams.dirsPerTurn);
  }

  // Connected same-owner companies (8-neighbour flood), capped.
  _cluster(state, piece) {
    const out = [], seen = new Set([piece.id]), stack = [piece];
    while (stack.length && out.length < TendencyParams.clusterCap) {
      const p = stack.pop(); out.push(p);
      for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
        if (!dc && !dr) continue;
        const n = state.pieceAt(p.col + dc, p.row + dr);
        if (n && !seen.has(n.id) && n.type === piece.type && n.owner === piece.owner) {
          seen.add(n.id); stack.push(n);
        }
      }
    }
    return out;
  }

  _coupled(state, piece, type) {
    const out = [];
    for (const p of state.pieces.values())
      if (p.owner === piece.owner && p.type === type) out.push(p);
    return out;
  }

  _buildMove(state, config, movers, coupled, dir, reach, prof, occupiedBase) {
    // Work on a private copy of the occupancy so each candidate is independent.
    const occupied = new Set(occupiedBase);
    const steps = [];
    let rawCost = 0, anyMoved = false;

    // Cluster units (their `reach`) + coupled pieces (a shorter `coupleReach`),
    // all resolved front-first along `dir` so the mass stays coherent and rear
    // units bunch behind terrain/edges → the formation reshapes as it advances.
    const list = movers.map(p => ({ p, reach }))
      .concat(coupled.map(p => ({ p, reach: TendencyParams.coupleReach })));
    list.sort((a, b) => (b.p.col * dir.x + b.p.row * dir.y) - (a.p.col * dir.x + a.p.row * dir.y));

    for (const { p, reach: rr } of list) {
      occupied.delete(cellKey(p.col, p.row));               // vacate own cell
      const dest = this._slide(state, config, p.col, p.row, dir, rr, occupied);
      occupied.add(cellKey(dest.col, dest.row));            // reserve final cell (moved or not)
      if (dest.col !== p.col || dest.row !== p.row) {
        steps.push({ id: p.id, fromCol: p.col, fromRow: p.row, toCol: dest.col, toRow: dest.row });
        rawCost += dest.dist;
        anyMoved = true;
      }
    }
    if (!anyMoved) return null;

    const discount = prof.group ? TendencyParams.groupDiscount : 1;
    const cost = Math.max(1, Math.ceil(rawCost * TendencyParams.stepEnergy * discount));
    return { steps, cost };
  }

  // Slide one piece up to `reach` units of terrain cost along `dir`, stopping at
  // impassable terrain, the map edge, or an occupied/reserved cell. The caller
  // has already removed THIS piece's own cell from `occupied`.
  _slide(state, config, c, r, dir, reach, occupied) {
    let cur = { c, r }, spent = 0;
    // Guard against runaway loops on big reaches.
    for (let guard = 0; guard < 64; guard++) {
      const nc = cur.c + dir.x, nr = cur.r + dir.y;
      const k = cellKey(nc, nr);
      if (occupied.has(k)) break;
      const cell = state.getCell(nc, nr);
      // Stay on the drawn map: an undrawn cell (no terrain) is a hard edge, and
      // impassable terrain (water) blocks too. The map may extend infinitely IF
      // drawn that way, but pieces never step onto undrawn tiles.
      if (!cell || !config.terrain[cell.terrain].passable) break;
      const tcost = config.terrain[cell.terrain].move;
      if (spent + tcost > reach + 1e-9) break;
      cur = { c: nc, r: nr }; spent += tcost;
      if (spent >= reach - 1e-9) break;
    }
    return { col: cur.c, row: cur.r, dist: spent };
  }
}

// ── Active model selection ───────────────────────────────────────────────────
// Stable code reads `window.ActiveMovementModel`. Swap movement = point this at a
// different class instance (and add its <script> in index.html).
if (typeof window !== 'undefined') {
  window.TendencyMovementV1 = TendencyMovementV1;
  window.ActiveMovementModel = new TendencyMovementV1();
}
