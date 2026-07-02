# Castles & Deeds — Developer TODO

Organized by **Large items** (multi-session epics), **Small items** (focused,
pick-up-and-go tasks), and **Known bugs**. Keep this current — it's the shared
work queue for any agent. `[x]` done, `[~]` in progress, `[ ]` todo.

Status legend for design: 🔒 = mechanic still being designed (ask Steven / expect
churn), so build it behind `GameConfig.js` and keep it swappable.

> **North star** (see CLAUDE.md → "The feel we're going for"): the game should be
> fun to just *play for hours* — dynamic, immersive, and complex-yet-simple enough
> that the scenario keeps changing interestingly even when nobody is clearly
> winning. Conquest and treaty-making should keep everyone engaged regardless of
> who's "ahead." Weigh new mechanics against this: do they create ongoing,
> interesting churn for all players, not just a race to a win condition?

---

## ✅ Done so far
- [x] Core engine (loop, input: drag-pan / wheel-zoom / WASD) — `core/`
- [x] Pan/zoom camera over an infinite board with world↔screen transforms
- [x] Procedural board generation (terrain blobs + Voronoi regions + castles), seedable, configurable Cols/Rows, regenerates per play
- [x] Board renderer (terrain, grid, region tints + borders, hover/select highlight)
- [x] All pieces displayed (Unicode chess glyphs, owner-tinted) + full 52-card deed deck rendered
- [x] Board-master Setup sandbox: Place / Paint / Erase tools, player + piece + terrain pickers, Regenerate, Clear Pieces, Show/Hide Deeds
- [x] Rules/view separation (`GameConfig` + `GameState` are view-free & serializable)
- [x] NetworkManager (PeerJS) generalized to up to 4 peers (wired, not yet used in a scene)
- [~] Movement v1 + energy/turns + debug scenario (PlayScene, TurnManager, TendencyMovementV1, DebugScenario) — see MOVEMENT.md

---

## 🟥 Large items (epics)

### L1. Turn-based PlayScene + rules engine 🔒
[~] First pass landed: `scenes/PlayScene.js` (gesture + preview + energy/turn UI)
and `js/rules/TurnManager.js` (the move-applier + economy). See **MOVEMENT.md**.
Still TODO: legal-move validation beyond energy, undo, win checks, real (non-debug)
turn flow, networking hand-off. Keep model/view split.

### L2. Piece movement system 🔒 (the most important mechanic — Steven)
[~] v1 implemented as a **swappable model**: `js/rules/movement/TendencyMovementV1.js`.
Drag-to-preview gesture, "drawn hand" of ~4-5 options per piece, two drag tiers,
company **masses** that reshape over terrain, wizard→dragon **coupling**, energy
cost shaping. All tuning is in that file's `TendencyParams`. **Boundary documented
in MOVEMENT.md.** Iterate here freely — nothing else depends on the internals.
Next: tune feel, smarter cluster collision, intentional formation morphs, siege
interactions, hover-preview without a press.

### L3. Energy / economy + army growth 🔒
[~] Energy bar + end-of-turn company spawning from leftover energy live in
`TurnManager` (`GameConfig.economy` + `GameConfig.debug`). Next: tune the
move↔spawn trade-off curve, spawn placement rules, per-piece spawn costs.

### L4. Castle siege mechanic 🔒
Fun, uncertain, slightly risky, but feasible/encouraged enough that castles change
hands regularly (no single player monopolizes). Prior prototype idea: 2–3 companies
surrounding an enemy castle siege it; couldn't siege/attack in a region where you
hold senators/diplomats (must withdraw first). Keep it from getting too complex.

### L5. Deeds / diplomacy mechanic 🔒  ← still entirely TODO (build it out fully)
The deck renders but the **mechanic doesn't exist yet** — this is the whole second
victory track and needs designing + building end to end. Deeds = region
ownership/governance power. Diplomacy = **abstracted** deal-making (not real-time
negotiation — too slow for humans, impossible for AI; and not a dumb forced 1-card
swap). Make it a fun mechanic representing negotiation. Suits already carry
"domains" (Military/Populace/Wealth/Clergy) in `GameConfig.deck`. Likely interacts
with the castle plaza (L13), region resources (L14), and the chat (L12).

### L6. Win conditions + "shoot the moon" tension 🔒
Evaluate both tracks (`GameConfig.victory`). Conquest dominance vs. diplomatic power,
tuned so a leader on one track is vulnerable to a surprise on the other.

### L7. AI players
Fill empty seats (P = 2..N−1 AIs). Needs the rules engine first. Start dumb
(random legal moves), iterate. Must run fast and make quick moves to keep tempo.

### L8. Live multiplayer wiring (1–4 players)
Lobby UI (host/join by room code, Zerlin-style), seat assignment, host-authoritative
`GameState` snapshots, peer intents. NetworkManager already supports multiple conns.
Write `MULTIPLAYER_PLAN.md` (mirror Zerlin's) when starting.

### L9. Real art / asset pipeline
Download nice chess-piece + playing-card images (e.g. Wikimedia open-licensed sets).
Queue in `Main.js`, swap glyph/card draws in `PieceRenderer.js` for `drawImage`.
Per-player recolor can reuse Zerlin's blob-URL loader (already mirrored) + hue trick.

### L10. Hex topology option 🔒
Steven hasn't decided square vs hex. `GameConfig.board.topology` is the switch.
Add a hex `BoardRenderer`/`BoardGenerator` variant + hex cell math behind the same
interfaces. Square is v1.

### L11. Flavor-text bank ("world voice") 🔒
Pre-generate **hundreds** of short, characteristic / cute / funny / pithy lines
that fire on board events, to immerse the player in what just happened. Examples:
- senator moves INTO a neighboring castle → "Ah, you've come to broker a treaty, have you?"
- senator LEAVES a castle → "You have broken our alliance."
- companies advance toward an enemy castle → "You have declared war on us!"
- wizard moves through mountains → "The wizard brewed a potion and slipped unseen through the {region} ranges."
Design notes:
- Organize as a **data bank keyed by board EVENT type** (e.g. `senator_enter_castle`,
  `senator_leave_castle`, `companies_approach_castle`, `wizard_move_mountain`,
  `castle_besieged`, `castle_taken`, `deed_traded`, …), each with many variants;
  pick at random, support `{region}`/`{player}`/`{piece}` template tokens.
- Keep it as **DATA**, isolated like everything else: `js/rules/Flavor.js` (or a
  JSON), read by a thin `FlavorEvents` emitter that watches state transitions.
  Renderers only display; the bank never touches the canvas. Tunable in one place.
- Have Claude generate the initial corpus (hundreds of lines) in a batch.
- Surface in the chat/log (L12) and/or as transient on-board toasts.

### L12. In-game chat (live players + AIs) 🔒
A chat channel between the 1–4 live players AND the AIs (AIs post characterful
messages, react to events, propose/accept deals in-fiction). Ties into diplomacy
(L5) — chat may be where abstracted "deals" get flavored/surfaced — and into the
flavor bank (L11). Transport: NetworkManager broadcast (L8). Keep the chat model
(messages, authors) separate from its view, like everything else.

### L13. Castle "plaza" — 3×3 merged cell 🔒
Merge the cells around a castle into a single **3×3 plaza** that behaves as one
space where diplomacy / special activities happen, and which **multiple pieces can
co-occupy** (several senators / magistrates / wizards conducting business at once —
breaking the usual one-piece-per-cell rule). Needs: a cell-grouping concept in
`GameState` (a plaza is one logical location spanning 9 cells), movement that
treats entering the plaza specially, rendering that draws it as one merged tile,
and multi-occupancy. Interacts with siege (L4) and diplomacy (L5).

### L14a. Wizard invisibility / hidden information 🔒
Try making the **wizard invisible to enemy players** — only its owner sees it (or
sees it precisely); enemies see nothing, a stale last-known position, or a vague
"something stirs in the {region} mountains" hint. Introduces hidden information /
fog-of-war for the first time, so it must live in the model (per-player visibility)
and be respected by the view + by host-authoritative networking (don't ship a
hidden wizard's true position to enemy peers — important for L8). Ties to the
wizard's mountain advantage and the flavor bank (L11). Decide: fully hidden vs.
fuzzy/last-seen, and whether other pieces (senator?) get stealth too.

### L14. Region resources 🔒
Give regions **diverse resources** so conquering other regions is genuinely
worthwhile. Put higher-value / higher-utility resources in **harder-to-navigate**
regions (more mountains/forest/water), so risk↔reward drives expansion. Resources
feed the economy (energy / spawning / deed power). Data lives in `GameConfig`
(resource types + per-region assignment at generation time in `BoardGenerator`);
the model tracks ownership/yield. Helps the "always something to play for" goal
(see Vision).

---

## 🟦 Small items (focused, low-context)
- [ ] Persist/restore a Setup layout (export `GameState.serialize()` to JSON + import) so board-master scenarios can be saved.
- [ ] "Start Game" button in Setup → constructs PlayScene from the authored board (stub the scene first).
- [ ] Player-count selector (2–4) + which seats are AI, in Setup.
- [ ] Region inspector: click a region to name it / assign owner / see its castle.
- [ ] Procedurally generate evocative **region names** per new game (currently "Region 1..N" in `BoardGenerator._growRegions`). Data-driven name parts (prefix/root/suffix tables) in `GameConfig`; feeds flavor text (L11) `{region}` tokens.
- [x] Drag-to-paint / drag-to-erase (hold left-button + move) for terrain and pieces, not just click-per-cell.
- [ ] Right-click currently only pans; consider a quick "erase" on right-click-tap.
- [ ] Minimap / "recenter" button (easy to get lost on the infinite field).
- [ ] Deed tray: center suit symbol is faint at small sizes — bump size or weight.
- [ ] Terrain swatch labels are truncated ("Plai", "Moun"); show full names or tooltips.
- [ ] Keyboard shortcuts for tools (1/2/3 = Place/Paint/Erase, Tab = cycle player).
- [ ] Show a starting-army tray (counts per `GameConfig.pieces[*].perPlayer`) so the board master can place full sets quickly.
- [ ] Smooth piece movement transitions: once a player commits a move, animate pieces sliding to their new cells (don't snap), so other players get a small window to *see* which pieces on the board are shifting. (Tempo + readability; ties to the "masses reshape" feel in L2 and the multiplayer reveal in L8.)

---

## 🐞 Known bugs / risks
- [ ] **Unicode glyph rendering is font-dependent.** Pieces use system symbol fonts; on some platforms a glyph may render as a box. Mitigation tracked under L9 (real art). Verify on Steven's actual browser.
- [ ] No bounds on pan means a user can get lost in empty space with no way back except Regenerate (recenter button is the fix — small item above).
- [ ] `Piece._nextId` is a static counter; reset on Clear Pieces but not on Regenerate (regenerate keeps incrementing ids). Harmless now, revisit before networking relies on ids.
- [ ] Deed tray click area is fully absorbed (can't edit board cells behind it) — intentional, but note if it ever feels wrong.
- [ ] `by_center()` helper in `SetupScene.js` is a loose global; fold into the renderer when convenient.

---

## Open design questions for Steven (don't guess — confirm)
1. Square vs hex board (L10).
2. Exact win thresholds + how "shoot the moon" should feel (rare? sneaky?).
3. The energy↔spawn trade-off curve (L3) and where companies spawn.
4. Siege trigger conditions (L4) — revive the surround + senator-withdrawal idea, or new?
5. What the abstracted diplomacy "deal" actually is (L5).
