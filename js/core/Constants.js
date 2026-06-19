/*
Castles & Deeds
Constants.js  —  engine-level constants (input keys, camera limits, colors).

GAME-DESIGN values (piece counts, terrain behavior, win thresholds) do NOT live
here — those are in js/rules/GameConfig.js. This file is for the *engine*:
keybindings, zoom clamps, UI chrome colors. Keep the split clean.
*/

const Constants = {
  Keys: {
    PAN_UP: 'KeyW',
    PAN_DOWN: 'KeyS',
    PAN_LEFT: 'KeyA',
    PAN_RIGHT: 'KeyD',
  },

  Camera: {
    MIN_ZOOM: 0.35,
    MAX_ZOOM: 2.5,
    ZOOM_STEP: 1.1,        // multiplier per wheel notch (keyboard / programmatic)
    ZOOM_SENSITIVITY: 0.0015,  // wheel: factor = exp(-deltaY * this). Lower = slower.
    PAN_SPEED: 600,        // world-units/sec for keyboard pan (divided by zoom)
  },

  UI: {
    BG: '#1b1f1b',         // canvas backdrop (matches Zerlin's dark palette)
    GRID_LINE: 'rgba(255,255,255,0.08)',
    HOVER: 'rgba(255,255,255,0.85)',
    SELECT: 'rgba(255,235,120,0.95)',
    TEXT: '#e6e6e6',
    FONT: 'VT323, monospace',
    TRAY_BG: 'rgba(10,12,10,0.92)',
  },
};

if (typeof window !== 'undefined') window.Constants = Constants;
