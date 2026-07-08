(function () {
  'use strict';

  // Board geometry: hex offset grid, "pointy row" packing used by Puzzle Bobble clones.
  // COLS is the number of columns on even rows; odd rows are visually offset by half a cell
  // and have COLS-1 slots (classic bubble-shooter brick layout).
  var COLS = 8;
  var ROWS = 14; // total rows that can ever be occupied (grid buffer includes deadline+ceiling travel)
  var CELL = 40; // cell width in logical px (radius derived at render time)
  var BOARD_W = COLS * CELL;
  var ROW_H = CELL * 0.8660254; // sqrt(3)/2 * CELL, vertical hex row spacing
  var WALL_MARGIN = 0; // board occupies [0, BOARD_W]
  var LAUNCH_Y_OFFSET = 60; // launcher distance below row 0 baseline, from bottom
  var BUBBLE_RADIUS = CELL / 2 - 1;

  var COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];

  var SHOT_SPEED = 780; // px/sec logical
  var DEADLINE_ROW = 11; // if any bubble occupies a row >= this, game over
  var MAX_AIM_DEG = 80; // +/- from straight up

  var STEP_MS = 16; // default debug step

  var STAGES = [
    { id: 1, rows: 4, colors: 3, shotsPerDrop: 6, density: 0.85 },
    { id: 2, rows: 5, colors: 3, shotsPerDrop: 6, density: 0.85 },
    { id: 3, rows: 5, colors: 4, shotsPerDrop: 6, density: 0.88 },
    { id: 4, rows: 6, colors: 4, shotsPerDrop: 5, density: 0.9 },
    { id: 5, rows: 6, colors: 5, shotsPerDrop: 5, density: 0.9 },
    { id: 6, rows: 7, colors: 5, shotsPerDrop: 5, density: 0.92 },
    { id: 7, rows: 7, colors: 6, shotsPerDrop: 4, density: 0.94 },
    { id: 8, rows: 8, colors: 6, shotsPerDrop: 4, density: 0.96 }
  ];

  var SCORE = {
    POP_BASE: 10,
    DROP_BASE: 25,
    CLEAR_BONUS: 500,
    SHOT_BONUS: 20 // per remaining shot to next drop, on stage clear
  };

  window.BubbleExConstants = {
    COLS: COLS,
    ROWS: ROWS,
    CELL: CELL,
    BOARD_W: BOARD_W,
    ROW_H: ROW_H,
    LAUNCH_Y_OFFSET: LAUNCH_Y_OFFSET,
    BUBBLE_RADIUS: BUBBLE_RADIUS,
    COLORS: COLORS,
    SHOT_SPEED: SHOT_SPEED,
    DEADLINE_ROW: DEADLINE_ROW,
    MAX_AIM_DEG: MAX_AIM_DEG,
    STEP_MS: STEP_MS,
    STAGES: STAGES,
    SCORE: SCORE
  };
})();
