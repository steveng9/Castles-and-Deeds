/*
Castles & Deeds
SceneManager.js  —  thin scene router (same pattern as Zerlin's SceneManager2).

Owns shared infrastructure (the GameState, shared renderers) and delegates all
update/draw work to `this.currentScene`. Scene-transition methods do any setup
then construct the scene and assign it. Keep gameplay in the scene classes.

Scenes so far:
  SetupScene  — board-master sandbox: generate map, place pieces, paint terrain,
                browse the deed deck. (The current entry point.)
  PlayScene   — TODO: the actual turn-based game.
*/

class SceneManager {
  constructor(game) {
    this.game = game;
    this.state = new GameState();
    this.boardRenderer = new BoardRenderer(game.ctx);
    this.pieceRenderer = new PieceRenderer(game.ctx);
    this.currentScene = null;
  }

  init() {
    this.startSetupScene();
  }

  startSetupScene() {
    this.currentScene = new SetupScene(this);
  }

  // Movement-test scene: builds the debug scenario + turn/energy loop.
  startPlayScene() {
    this.currentScene = new PlayScene(this);
  }

  update() { if (this.currentScene) this.currentScene.update(); }
  draw()   { if (this.currentScene) this.currentScene.draw(); }
}

if (typeof window !== 'undefined') window.SceneManager = SceneManager;
