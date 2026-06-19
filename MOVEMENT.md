# Movement — design + decoupling map

This document is the boundary between **movement logic we will tweak constantly**
and the **stable game-wide machinery** around it. Read this before touching
movement so you change the right file and don't disturb the rest.

The golden rule (same spirit as rules↔view in CLAUDE.md): *the energy bar, turns,
debug mode, and the drag-to-preview gesture must NOT know how moves are generated.*
They only pass around a generic **`Move`** object. Swapping the entire movement
feel = writing one new model file and pointing `window.ActiveMovementModel` at it.

---

## The contract (the only thing both sides share)

A **movement model** exposes two methods and emits `Move` objects:

```js
model.movable(piece) -> bool
model.candidates(state, config, piece, turnSeed) -> Move[]

Move = {
  steps: [{ id, fromCol, fromRow, toCol, toRow }], // pieces that relocate
  cost:  Number,             // energy spent if committed
  dir:   { x, y },           // UNIT intended drag direction (col+, row+ = south)
  selectDist: Number,        // min drag distance (px) to select this tier
  tier:  'near' | 'far',
  label: String,
}
```

`candidates()` returns the small "drawn hand" of options for a piece this turn.
The scene maps the live mouse-drag vector to one candidate: direction picks the
sector (`dir`), drag distance picks the tier (`selectDist`). Release commits the
active candidate; Esc cancels.

That's it. Anything outside this contract is private to one side.

---

## What is SWAPPABLE (expect churn — tweak freely)

| File | Role |
|------|------|
| `js/rules/movement/TendencyMovementV1.js` | ★ The current movement rules. Reach per piece, clustering of company masses, terrain-driven formation reshaping, wizard→dragon coupling, the two drag tiers, energy cost shaping. **All tendency tuning is in the `TendencyParams` block at the top.** |

To try a different scheme: copy it to `…V2.js`, change the internals (keep the
contract), add its `<script>` after the V1 tag in `index.html`, and set
`window.ActiveMovementModel = new …V2()` at the bottom of the new file (only one
model should claim it). Nothing else changes.

Movement-specific tuning lives in `TendencyParams` **inside the model file**, not
in `GameConfig` — deliberately, so a model swap can redefine tendencies wholesale
without polluting the global knob-box.

## What is STABLE (keepers — don't entangle with a specific movement scheme)

| File | Role |
|------|------|
| `js/rules/TurnManager.js` | Turn order, the **energy bar** (full each turn, spent by `Move.cost`), and end-of-turn **company spawning** from leftover energy. Applies any `Move`. Knows nothing about tendencies. |
| `js/rules/DebugScenario.js` | Builds the fixed test board (4 regions, per-player clusters + wizard/senators/magistrate/dragons) used to iterate on movement. Fixture, not rules. |
| `js/scenes/PlayScene.js` | The drag-to-preview **gesture**, candidate selection from the drag vector, **preview rendering** (ghost destinations, option arrows, cost badge), the energy bar UI, End Turn. Generic over `Move`. |
| `js/rules/GameConfig.js` → `economy`, `debug` | Game-wide knobs: `energyPerTurn`, `companySpawnCost`; debug `developerControlAllSeats` + `energyPerTurn`. |

---

## v1 movement feel (what `TendencyMovementV1` currently does)

- **Tendencies, not fixed moves.** Each turn a piece "draws" 6 of 8 directions
  (seeded by piece id + `turnSeed`, so stable to explore within a turn, fresh
  next turn), each with a **near** and **far** tier → up to ~12 candidates (fewer
  where terrain or the map edge blocks). Pieces can usually head several ways.
- **Stays on the drawn map.** A slide stops at an undrawn tile — the map can
  extend infinitely if you *draw* it, but pieces never walk onto blank cells.
- **Reach is a terrain-cost budget** (plains step 1, forest 1.5, mountain 2).
  Dragons reach farthest, wizard far, senator like wizard, company/magistrate
  short, castle immobile.
- **Company masses** move together: pressing one company pulls its connected
  group; terrain spends each unit's budget differently so the **formation
  reshapes** as it advances (the "L→T over mountains" idea emerges naturally,
  no special-casing).
- **Coupling:** dragging the **wizard** also drifts the player's **dragons** a
  short way in the same direction.
- **Cost:** proportional to total distance moved; mass moves get a discount
  (battalions are efficient), so many small moves > one big move, per the brief.

## Debug / developer mode (a keeper)

`GameConfig.debug.developerControlAllSeats` runs a hotseat: you play every seat
in turn order (no AI/network), with a generous `debug.energyPerTurn` so you can
try many moves. End Turn spawns from leftover energy and advances to the next
seat, still under your control. Toggle off for real play (uses `economy.energyPerTurn`).

> Note: with the big debug energy budget, End Turn converts the large leftover
> into *many* companies — expected in debug; real play uses the small budget.

## Known rough edges / next tweaks
- Collision/claim resolution between cluster members is simple (front-first,
  one-cell-short on conflict). Fine for preview; revisit if masses tangle.
- Coupled dragons always drift; may want it conditional/optional.
- Reshaping is terrain-driven only; could add intentional formation morphs.
- No "build a castle" action yet (castles are immobile placeholders).
