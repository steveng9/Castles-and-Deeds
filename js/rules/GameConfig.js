/*
Castles & Deeds
GameConfig.js  —  THE central data / tuning module.

⚠️  This file is the single source of truth for the *design* of the game:
    piece types, how many each player gets, terrain types, the deck of deeds,
    players, board generation defaults, and win-condition thresholds.

    Everything here is DATA. No rendering, no game-loop logic. The rest of the
    codebase reads from `GameConfig` so that names, counts, movement rules, and
    visual identity can be retuned here WITHOUT touching engine/view/scene code.

    Steven explicitly wants this to be the knob-box: change a number or a glyph
    here and the whole game adapts. Keep it that way — do not hardcode piece
    counts, colors, or terrain behavior anywhere else.
*/

const GameConfig = {

  // ── Board generation defaults ────────────────────────────────────────────
  // The board is conceptually infinite (camera pans/zooms freely). A *generated*
  // game only fills a finite window of cells with terrain + regions; everything
  // outside is empty plains a player *could* march across (slow, so low threat).
  board: {
    topology: 'square',     // 'square' (implemented) | 'hex' (planned, see TODOS)
    cellSize: 72,           // world-units per cell (pre-zoom)
    defaultCols: 16,        // generated playfield width  (configurable per game)
    defaultRows: 12,        // generated playfield height
    // Region generation: how many regions to grow across the playfield.
    // Default 4 = one home region per player (max 4 players).
    regionCount: 4,
    // Terrain mix weights (relative probability when scattering terrain blobs).
    terrainWeights: { plains: 60, mountain: 14, urban: 12, forest: 10, water: 4 },
  },

  // ── Terrain types ────────────────────────────────────────────────────────
  // `move` is a movement-cost multiplier (1 = normal, >1 = slower). `advantage`
  // names the piece class that gets an edge here (consumed by rules later).
  terrain: {
    plains:   { name: 'Plains',   color: '#6b8f3a', move: 1.0, advantage: null,      passable: true  },
    mountain: { name: 'Mountain', color: '#8a7a5c', move: 2.0, advantage: 'wizard',  passable: true  },
    urban:    { name: 'Urban',    color: '#9aa0aa', move: 1.0, advantage: 'senator',  passable: true  },
    forest:   { name: 'Forest',   color: '#3f6f43', move: 1.5, advantage: 'dragon',   passable: true  },
    water:    { name: 'Water',    color: '#3a6e8f', move: 99,  advantage: null,       passable: false },
  },
  terrainOrder: ['plains', 'mountain', 'urban', 'forest', 'water'], // palette display order

  // ── Players ──────────────────────────────────────────────────────────────
  // N total = Q live + P AI, 2..4 total. Colors identify ownership everywhere.
  players: {
    maxPlayers: 4,
    minPlayers: 2,
    colors: ['#d23b3b', '#2f7fd2', '#2fae5a', '#d2a23b'],  // crimson, azure, verdant, amber
    names:  ['Crimson', 'Azure', 'Verdant', 'Amber'],
  },

  // ── Piece types ──────────────────────────────────────────────────────────
  // Maps the conceptual game pieces onto chess pieces. `glyph` uses the solid
  // (black) Unicode chess characters, recolored per player at draw time.
  // `perPlayer` is the starting count. `movement` is a placeholder descriptor
  // the rules engine will interpret later (kept here so it's tunable in one spot).
  //
  // key        chess     concept
  // ─────────  ────────  ────────────────────────────────────────────────
  // castle     rook      one per region, immobile siege objective
  // magistrate king      the player's leader (1)
  // senator    bishop    diplomat / assassin (2)
  // wizard     queen     mage, mountain advantage (1)
  // dragon     knight    air support, forest advantage (2)
  // company    pawn      battalion / technician, moves in masses (10)
  pieces: {
    castle:     { name: 'Castle',     chess: 'rook',   glyph: '♜', perPlayer: 0,  immobile: true,  movement: 'none' },
    magistrate: { name: 'Magistrate', chess: 'king',   glyph: '♚', perPlayer: 1,  immobile: false, movement: 'step1' },
    senator:    { name: 'Senator',    chess: 'bishop', glyph: '♝', perPlayer: 2,  immobile: false, movement: 'diagonal' },
    wizard:     { name: 'Wizard',     chess: 'queen',  glyph: '♛', perPlayer: 1,  immobile: false, movement: 'line' },
    dragon:     { name: 'Dragon',     chess: 'knight', glyph: '♞', perPlayer: 2,  immobile: false, movement: 'leap' },
    company:    { name: 'Company',    chess: 'pawn',   glyph: '♟', perPlayer: 10, immobile: false, movement: 'mass' },
  },
  // Palette display order (board-master setup tray).
  pieceOrder: ['castle', 'magistrate', 'wizard', 'senator', 'dragon', 'company'],

  // ── Deeds (the deck) ──────────────────────────────────────────────────────
  // Deeds are represented by a standard 52-card deck. Diplomacy = trading deeds.
  // Suits double as "governance domains" so a deed can later map to region powers.
  deck: {
    suits: [
      { key: 'spades',   symbol: '♠', color: '#e8e8e8', domain: 'Military'  },
      { key: 'hearts',   symbol: '♥', color: '#e0524d', domain: 'Populace'  },
      { key: 'diamonds', symbol: '♦', color: '#e0a23d', domain: 'Wealth'    },
      { key: 'clubs',    symbol: '♣', color: '#5fd07a', domain: 'Clergy'    },
    ],
    ranks: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
  },

  // ── Economy / tempo (placeholders, see design notes in CLAUDE.md) ─────────
  // The "energy per turn distributed across moves vs spawning" idea lives here.
  economy: {
    energyPerTurn: 10,        // total action budget a player spends each turn
    companySpawnCost: 3,      // leftover energy converted to one company at end of turn
    moveStepCost: 1,          // energy per step of movement (mass moves are cheap)
  },

  // ── Modes (game-wide, stable — NOT movement-specific) ─────────────────────
  // Developer/testing mode for iterating on movement. Keep these here; the
  // *movement rules themselves* live in js/rules/movement/ (swappable), see
  // MOVEMENT.md for the decoupling boundary.
  debug: {
    developerControlAllSeats: true, // hotseat: you play every seat in turn order
    energyPerTurn: 120,             // generous budget so many moves can be tried
  },

  // ── Win conditions (placeholders / tunable thresholds) ────────────────────
  // Two parallel victory tracks so a player behind on one can surprise on the
  // other ("shoot the moon"). Real evaluation lives in the rules engine later.
  victory: {
    conquest:  { castlesToDominate: 0.6 },   // fraction of map castles controlled
    diplomacy: { deedPowerToWin: 40 },       // accumulated deed/governance power
  },
};

if (typeof window !== 'undefined') window.GameConfig = GameConfig;
