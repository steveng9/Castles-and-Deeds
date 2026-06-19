# Castles & Deeds — Developer Guide (read this first)

An online, browser-based, multiplayer board game in **vanilla JavaScript + HTML5
canvas**. No build step, no npm, no framework. Open `index.html` in a browser and
it runs. The architecture and conventions are deliberately modeled on the sibling
project **Zerlin** (`../Zerlin/`) — same game-loop shape, same `<script>`-tag module
loading, same PeerJS multiplayer pattern.

This file is the onboarding doc: a fresh Claude agent should be able to read it and
pick up work with minimal extra instruction.

---

## What the game is (design intent)

Chess pieces + a deck of playing cards on a **procedurally-generated, configurable
map**. The map (terrain + regions) is the intended star of the show. 1–4 live
players; empty seats are filled by AI (N total = Q live ≥1 + P AI, 2 ≤ N ≤ 4).

Two parallel victory tracks so a player behind on one can surprise on the other
("shoot the moon"):
- **Conquest** — siege/militarize **Castles** and dominate regions by force.
- **Diplomacy** — acquire **Deeds** (cards) through abstracted deal-making.

Tempo matters: with up to 4 players, moves should be quick (many pieces move at
once — e.g. company "masses" shift shape as they advance) so nobody waits on one
player's deep think, while keeping chess-like depth.

### The feel we're going for (the north star)
The ambition is a game that's fun to just **play for hours** — not a sprint to a
win condition. It should be dynamic, immersive, and complex-yet-simple enough that
the **scenario keeps changing interestingly even when nobody is clearly winning**.
Conquering territory and brokering treaties should stay engaging for everyone
regardless of who's "ahead" — the fun is in the ongoing churn of war and diplomacy,
not just the finish line. Flavor/world-voice (see TODOS L11), in-game chat (L12),
region resources (L14), and the castle "plaza" for diplomacy (L13) all exist to
serve this: give every player something live and interesting to react to, always.
When weighing a new mechanic, ask: *does it create ongoing, interesting tension
for all players, or just accelerate someone to victory?* Prefer the former.

Pieces (chess → concept), all defined/tunable in `js/rules/GameConfig.js`:
rook→**Castle** (immobile, 1/region), king→**Magistrate** (1), bishop→**Senator**
(diplomat/assassin, 2), queen→**Wizard** (1), knight→**Dragon** (air support, 2),
pawn→**Company** (battalion, starts 10).

⚠️ **Names, counts, movement, terrain behavior, and win thresholds will change
constantly.** That is why all of it is DATA in `GameConfig.js`, isolated from
engine/view/scene code. Never hardcode these elsewhere.

---

## Architecture (the load order is in `index.html`)

```
js/
  core/
    Constants.js       Engine constants ONLY (keys, camera clamps, UI colors).
    Camera.js          Pan + zoom viewport; world↔screen transforms. Infinite board.
    GameEngine.js      Game loop (rAF), input (drag-pan, wheel-zoom, keys), entry.
    NetworkManager.js  PeerJS WebRTC transport. Game-agnostic. Up to 4 peers.
    SceneManager.js    Thin router. Owns GameState + shared renderers. Delegates.
  rules/   ← THE game design lives here, view-free, serializable, testable
    GameConfig.js      ★ Single source of truth: pieces, terrain, deck, players,
                         economy, victory. Tune the whole game from this file.
    GameState.js       Pure model: cells, pieces, regions, deeds/hands. No canvas.
    TurnManager.js     STABLE turns + energy economy; applies generic Moves, spawns
                         companies from leftover energy. Movement-scheme-agnostic.
    DebugScenario.js   STABLE test fixture: builds the 4-region movement-test board.
    movement/
      TendencyMovementV1.js  ★ SWAPPABLE movement logic → Move candidates. ALL
                         tendency tuning is here. See MOVEMENT.md for the
                         stable↔swappable boundary before touching movement.
  board/
    BoardGenerator.js  Procedural map (terrain blobs + Voronoi regions + castles).
                         Seedable (RNG) so host/client can generate identical maps.
    BoardRenderer.js   VIEW: draws terrain, grid, region tints/borders, highlights.
  pieces/
    PieceRenderer.js   VIEW: draws pieces (Unicode chess glyphs, owner-tinted) and
                         deeds (canvas-drawn cards). Swap to images here later.
  scenes/
    SetupScene.js      Board-master sandbox (current entry point): generate map,
                         place pieces, paint terrain, browse the deck.
    PlayScene.js       STABLE movement-test scene: drag-to-preview gesture, move
                         preview render, energy bar, End Turn. Generic over Move.
  Main.js              AssetManager + bootstrap. Waits for DOM, then starts engine.
```

**The golden rule: rules/data ↔ view separation.** `rules/` never imports view
code and never touches the canvas/DOM. `board/` and `pieces/` renderers and the
`scenes/` only READ from `GameState`/`GameConfig`. This keeps the design tunable
and the model serializable for networking.

### Key patterns inherited from Zerlin
- **Game loop**: `GameEngine._loop()` → `clockTick` (capped dt) → `sceneManager.update()` → `draw()`. One-shot inputs (`click`, `wheel`) are consumed at end of frame.
- **Scene router**: `SceneManager` owns shared state; `currentScene` does the work. Add a scene = new file in `scenes/`, new `start*Scene()` method.
- **Globals via `<script>` tags**: every class attaches itself to `window`. Load order in `index.html` matters (Constants → Camera → GameEngine → rules → board/pieces → network → scenes → SceneManager → Main).
- **Host-authoritative multiplayer** (planned): host runs the sim, broadcasts `GameState` snapshots; peers send intents. `GameState.serialize()/deserialize()` already exist. See `js/core/NetworkManager.js` header.

### Coordinates
- **World space**: pixels, origin at cell (0,0)'s top-left. `cellSize` (72) world-units per cell.
- **Cell**: integer `(col,row)`; `cellKey(col,row)` = `"col,row"` is the canonical map key everywhere.
- **Camera**: `(x,y)` = world point at canvas top-left; `zoom` = world→screen scale. The board is infinite — no pan bounds.
- Conversions live ONLY on `Camera` (`worldToScreenX`, `screenToWorldX`, etc.). Don't reinvent them.

---

## Controls (Setup scene)
- **Pan**: drag with right/middle mouse, or WASD.
- **Zoom**: mouse wheel (anchors on cursor).
- **Left-click**: palette buttons, or apply the current tool (Place/Paint/Erase) to the hovered cell.
- On-canvas palette (top-left): Tool, Player, Piece, Terrain, Regenerate, Clear Pieces, Show/Hide Deeds.
- DOM inputs (below canvas): board Cols/Rows → take effect on **Regenerate**.

---

## How to run & verify (no node in this environment)
There is **no node/deno/bun** installed — don't try to lint with them. To verify a
change actually renders, use headless Chrome to screenshot:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --no-sandbox --enable-logging=stderr --v=1 \
  --virtual-time-budget=3000 --screenshot=/tmp/cd.png --window-size=1140,760 \
  "file://$(pwd)/index.html" 2>/tmp/cd.log
grep -iE "CONSOLE:.*(Uncaught|Error|running)" /tmp/cd.log   # check for JS errors
```
Then Read `/tmp/cd.png`. "Castles & Deeds running" in the log = clean boot.
⚠️ Scripts run in `<head>`; bootstrap must wait for DOM-ready (it does). The
classic failure is `getContext of null` = something ran before the canvas existed.

---

## Conventions
- Plain ES6 classes, `var`/`const` mix as in Zerlin; 2-space indent; terse comments that explain *why*.
- Every new class: `if (typeof window !== 'undefined') window.X = X;` at the bottom, and a `<script>` tag in `index.html` in dependency order.
- New tunable design value → `GameConfig.js`. New engine/UI constant → `core/Constants.js`. Never sprinkle magic numbers in scenes/renderers.
- Renderers and scenes must not mutate `GameState` except through intent (Setup scene edits directly because it's the authoring sandbox; the future PlayScene must go through a rules engine).

## See also
- `MOVEMENT.md` — the stable↔swappable boundary for the movement system. **Read
  before changing movement.** Movement rules are isolated in `js/rules/movement/`;
  energy/turns/gesture are stable infrastructure that only consumes generic `Move`s.
- `TODOS.md` — prioritized work (large items, small items, known bugs).
- `../Zerlin/` — reference implementation for multiplayer, scenes, animation, asset loading.
- Persistent memory index: `/Users/stevengolob/.claude/projects/-Users-stevengolob-PycharmProjects-CastlesAndDeeds/memory/MEMORY.md`.
