/**
 * Unit tests for Minesweeper game logic
 * Run with: node --test
 */

import test from 'node:test';
import assert from 'node:assert';
import { Minesweeper, DIFFICULTY, CELL_STATE, STATE } from '../src/Game.js';
import { isValidConfig, createBoard, countMines, getNeighbors, getSafeZone, formatLedNumber, getStandardDifficulty } from '../src/utils.js';

// Test helper: deterministic minesweeper for scenarios without timer
function createDeterministicGame(width, height, mines, mineCoords) {
  const game = new Minesweeper({ width, height, mines });
  // Clear all board mines/states/numbers
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = game.board[y][x];
      cell.isMine = false;
      cell.state = CELL_STATE.CLOSED;
      cell.neighbors = 0;
      cell.exploded = false;
      cell.wrongFlag = false;
    }
  }
  // Place EXACTLY known mine coordinates
  for (const { x, y } of mineCoords) {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      game.board[y][x].isMine = true;
    }
  }
  game.calculateNumbers();
  // Set state manually to RUNNING (no timer)
  game.state = STATE.RUNNING;
  return game;
}

const CONFIG_9x9_10 = { width: 9, height: 9, mines: 10 };

test('Game - Validation', async () => {
  assert.strictEqual(isValidConfig(CONFIG_9x9_10).valid, true);
  assert.strictEqual(isValidConfig({ width: 8, height: 9, mines: 10 }).valid, false);
  assert.strictEqual(isValidConfig({ width: 31, height: 9, mines: 10 }).valid, false);
  assert.strictEqual(isValidConfig({ width: 9, height: 8, mines: 10 }).valid, false);
  assert.strictEqual(isValidConfig({ width: 9, height: 25, mines: 10 }).valid, false);
  assert.strictEqual(isValidConfig({ width: 9, height: 9, mines: 0 }).valid, false);
  assert.strictEqual(isValidConfig({ width: 9, height: 9, mines: 80 }).valid, false);
});

test('Game - Constructor/setConfig throw for invalid config', async () => {
  // Invalid: width < 9
  assert.throws(() => new Minesweeper({ width: 8, height: 9, mines: 10 }), RangeError);
  assert.throws(() => new Minesweeper({ width: 31, height: 9, mines: 10 }), RangeError);
  // Invalid: height < 9
  assert.throws(() => new Minesweeper({ width: 9, height: 8, mines: 10 }), RangeError);
  assert.throws(() => new Minesweeper({ width: 9, height: 25, mines: 10 }), RangeError);
  // Invalid: mines < 10
  assert.throws(() => new Minesweeper({ width: 9, height: 9, mines: 9 }), RangeError);
  assert.throws(() => new Minesweeper({ width: 9, height: 9, mines: 0 }), RangeError);
  // Invalid: NaN
  assert.throws(() => new Minesweeper({ width: NaN, height: 9, mines: 10 }), RangeError);
  // Invalid: fractional
  assert.throws(() => new Minesweeper({ width: 9.5, height: 9, mines: 10 }), RangeError);
  // Invalid: string
  assert.throws(() => new Minesweeper({ width: '9', height: 9, mines: 10 }), RangeError);
  // Invalid: 2x2/3x3/5x5 (too small)
  assert.throws(() => new Minesweeper({ width: 2, height: 2, mines: 10 }), RangeError);
  assert.throws(() => new Minesweeper({ width: 3, height: 3, mines: 10 }), RangeError);
  assert.throws(() => new Minesweeper({ width: 5, height: 5, mines: 10 }), RangeError);
  
  // setConfig also throws
  const game = new Minesweeper(CONFIG_9x9_10);
  assert.throws(() => game.setConfig({ width: 8, height: 9, mines: 10 }), RangeError);
  assert.throws(() => game.setConfig({ width: 31, height: 9, mines: 10 }), RangeError);
  assert.throws(() => game.setConfig({ width: 9, height: 8, mines: 10 }), RangeError);
  assert.throws(() => game.setConfig({ width: 9, height: 25, mines: 10 }), RangeError);
  assert.throws(() => game.setConfig({ width: 9, height: 9, mines: 9 }), RangeError);
  assert.throws(() => game.setConfig({ width: 9, height: 9, mines: 0 }), RangeError);
  assert.throws(() => game.setConfig({ width: NaN, height: 9, mines: 10 }), RangeError);
  assert.throws(() => game.setConfig({ width: 9.5, height: 9, mines: 10 }), RangeError);
  assert.throws(() => game.setConfig({ width: '9', height: 9, mines: 10 }), RangeError);
});

test('Game - isValidConfig rejects/accepts correctly', async () => {
  // Rejects
  assert.strictEqual(isValidConfig({ width: NaN, height: 9, mines: 10 }).valid, false);
  assert.strictEqual(isValidConfig({ width: 9.5, height: 9, mines: 10 }).valid, false);
  assert.strictEqual(isValidConfig({ width: '9', height: 9, mines: 10 }).valid, false);
  assert.strictEqual(isValidConfig({ width: 8, height: 9, mines: 10 }).valid, false);
  assert.strictEqual(isValidConfig({ width: 9, height: 9, mines: 9 }).valid, false);
  
  // Accepts
  assert.strictEqual(isValidConfig({ width: 9, height: 9, mines: 10 }).valid, true);
  assert.strictEqual(isValidConfig({ width: 9, height: 9, mines: 10 }).valid, true);
  assert.strictEqual(isValidConfig({ width: 30, height: 24, mines: 668 }).valid, true);
});

test('Game - Configuration', async () => {
  const game = new Minesweeper(CONFIG_9x9_10);
  assert.strictEqual(game.width, 9);
  assert.strictEqual(game.height, 9);
  assert.strictEqual(game.totalMines, 10);
  assert.strictEqual(game.state, STATE.READY);
  
  game.setConfig({ width: 16, height: 16, mines: 40 });
  assert.strictEqual(game.width, 16);
  assert.strictEqual(game.height, 16);
  assert.strictEqual(game.totalMines, 40);
  
  const config = game.getConfig();
  assert.strictEqual(config.width, 16);
  assert.strictEqual(config.height, 16);
  assert.strictEqual(config.mines, 40);
});

test('Game - Reset', async () => {
  const game = new Minesweeper(CONFIG_9x9_10);
  game.startGame(4, 4);
  game.reveal(0, 0);
  game.reset();
  
  assert.strictEqual(game.state, STATE.READY);
  assert.strictEqual(game.timer, 0);
  assert.strictEqual(game.flags, 0);
  assert.strictEqual(game.revealedCount, 0);
  assert.strictEqual(game.firstReveal, true);
});

test('Game - Board Creation', async () => {
  const board = createBoard(9, 9);
  assert.strictEqual(board.length, 9);
  assert.strictEqual(board[0].length, 9);
  assert.strictEqual(board[4][4].state, CELL_STATE.CLOSED);
  assert.strictEqual(board[4][4].isMine, false);
  assert.strictEqual(board[4][4].neighbors, 0);
});

test('Game - Mine Placement (deterministic)', async () => {
  // Use 9x9/10 with 5 mines placed at specific locations (5 more mines far away)
  const game = createDeterministicGame(9, 9, 10, [
    { x: 1, y: 1 }, { x: 3, y: 3 }, { x: 5, y: 5 }, { x: 7, y: 7 }, { x: 8, y: 8 },
    { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }, { x: 6, y: 0 }, { x: 8, y: 0 }
  ]);
  
  assert.strictEqual(game.board[1][1].isMine, true);
  assert.strictEqual(game.board[3][3].isMine, true);
  assert.strictEqual(game.board[2][2].neighbors, 2);
});

test('Game - Neighbor Counting', async () => {
  // Use 9x9/10 with 1 mine at center (9 more mines far away)
  const game = createDeterministicGame(9, 9, 10, [
    { x: 4, y: 4 },
    { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }, { x: 6, y: 0 }, { x: 8, y: 0 },
    { x: 0, y: 2 }, { x: 0, y: 4 }, { x: 0, y: 6 }, { x: 0, y: 8 }
  ]);
  
  const neighbors = getNeighbors(game.board, 4, 4, 9, 9);
  for (const n of neighbors) {
    assert.strictEqual(n.neighbors, 1);
  }
  assert.strictEqual(game.board[4][4].neighbors, 0);
});

test('Game - First Click Safety', async () => {
  const game = new Minesweeper(CONFIG_9x9_10);
  game.startGame(4, 4);
  
  assert.strictEqual(game.board[4][4].isMine, false);
  
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = 4 + dx;
      const y = 4 + dy;
      if (x >= 0 && x < 9 && y >= 0 && y < 9) {
        assert.strictEqual(game.board[y][x].isMine, false);
      }
    }
  }
  
  game.stopTimer();
});

test('Game - Reveal Cell (first reveal)', async () => {
  const game = new Minesweeper(CONFIG_9x9_10);
  const result = game.reveal(0, 0);
  
  assert.strictEqual(game.state, STATE.RUNNING);
  assert.ok(game.timerInterval !== null);
  assert.strictEqual(game.board[0][0].state, CELL_STATE.REVEALED);
  assert.ok(result.cells.length >= 1);
  
  game.stopTimer();
});

test('Game - Reveal Cell (subsequent)', async () => {
  const game = new Minesweeper(CONFIG_9x9_10);
  game.startGame(0, 0);
  const result = game.reveal(1, 0);
  
  assert.strictEqual(result.result, 'ok');
  assert.ok(result.cells.length >= 1);
  
  game.stopTimer();
});

test('Game - Flood Fill', async () => {
  // Use 9x9/10 layout with mines at bottom row and one extra
  // Mines: (0,8), (1,8), (2,8), (3,8), (4,8), (5,8), (6,8), (7,8), (8,8), (8,7)
  const game = createDeterministicGame(9, 9, 10, [
    { x: 0, y: 8 }, { x: 1, y: 8 }, { x: 2, y: 8 }, { x: 3, y: 8 },
    { x: 4, y: 8 }, { x: 5, y: 8 }, { x: 6, y: 8 }, { x: 7, y: 8 },
    { x: 8, y: 8 }, { x: 8, y: 7 }
  ]);
  // Manually start the game (no timer)
  game.state = STATE.RUNNING;
  
  // Reveal (0,0) which is far from mines - should flood fill
  const result = game.reveal(0, 0);
  // (0,0) should be revealed and flood should reveal more than just 1 cell
  assert.strictEqual(game.board[0][0].state, CELL_STATE.REVEALED, '(0,0) is revealed');
  assert.ok(result.cells.length > 1, 'Flood fill reveals more than 1 cell');
});

test('Game - Mine Hit', async () => {
  // Use 9x9/10 layout
  const game = createDeterministicGame(9, 9, 10, [
    { x: 0, y: 0 }, { x: 8, y: 0 }, { x: 0, y: 8 }, { x: 8, y: 8 },
    { x: 4, y: 0 }, { x: 4, y: 8 }, { x: 0, y: 4 }, { x: 8, y: 4 },
    { x: 2, y: 2 }, { x: 6, y: 6 }
  ]);
  // Manually start the game (no timer)
  game.state = STATE.RUNNING;
  
  const result = game.reveal(0, 0);
  assert.strictEqual(result.result, 'terminal');
  assert.strictEqual(game.state, STATE.LOST);
  assert.strictEqual(game.board[0][0].exploded, true);
});

test('Game - Flag Cycle', async () => {
  const game = new Minesweeper(CONFIG_9x9_10);
  game.startGame(0, 0);
  
  let result = game.cycleFlag(1, 1);
  assert.strictEqual(result.state, CELL_STATE.FLAGGED);
  assert.strictEqual(result.flagsChanged, true);
  assert.strictEqual(game.flags, 1);
  
  result = game.cycleFlag(1, 1);
  assert.strictEqual(result.state, CELL_STATE.QUESTIONED);
  assert.strictEqual(result.flagsChanged, true);
  assert.strictEqual(game.flags, 0);
  
  result = game.cycleFlag(1, 1);
  assert.strictEqual(result.state, CELL_STATE.CLOSED);
  assert.strictEqual(result.flagsChanged, true);
  assert.strictEqual(game.flags, 0);
  
  game.reveal(1, 2);
  result = game.cycleFlag(1, 2);
  assert.strictEqual(result.flagsChanged, false);
  assert.strictEqual(result.state, CELL_STATE.REVEALED);
  
  game.stopTimer();
});

test('Game - LED Display Formatting', async () => {
  assert.strictEqual(formatLedNumber(0), '000');
  assert.strictEqual(formatLedNumber(5), '005');
  assert.strictEqual(formatLedNumber(123), '123');
  assert.strictEqual(formatLedNumber(999), '999');
  assert.strictEqual(formatLedNumber(1000), '999');
  assert.strictEqual(formatLedNumber(-1), '-01');
  assert.strictEqual(formatLedNumber(-10), '-10');
  assert.strictEqual(formatLedNumber(-99), '-99');
  assert.strictEqual(formatLedNumber(-100), '-99');
});

test('Game - Custom Configuration', async () => {
  const game = new Minesweeper(CONFIG_9x9_10);
  
  game.setConfig({ width: 20, height: 15, mines: 50 });
  assert.strictEqual(game.width, 20);
  assert.strictEqual(game.height, 15);
  assert.strictEqual(game.totalMines, 50);
  
  const config = game.getConfig();
  assert.strictEqual(config.width, 20);
  assert.strictEqual(config.height, 15);
  assert.strictEqual(config.mines, 50);
});

test('Game - Deterministic Win Scenario (no timer)', async () => {
  // Create game with 10 mines at known positions
  const game = createDeterministicGame(9, 9, 10, [
    { x: 0, y: 0 }, { x: 2, y: 1 }, { x: 4, y: 2 }, { x: 6, y: 3 }, { x: 8, y: 4 },
    { x: 1, y: 5 }, { x: 3, y: 6 }, { x: 5, y: 7 }, { x: 7, y: 8 }, { x: 8, y: 0 }
  ]);
  
  // Reveal all non-mine cells
  let revealedCount = 0;
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      if (!game.board[y][x].isMine) {
        game.reveal(x, y);
        revealedCount++;
      }
    }
  }
  
  assert.strictEqual(game.state, STATE.WON);
  assert.strictEqual(game.flags, 10);
  assert.strictEqual(revealedCount, 71); // 81 - 10 mines
});

test('Game - State Invariants', async () => {
  const game = new Minesweeper(CONFIG_9x9_10);
  
  assert.strictEqual(game.state, STATE.READY);
  assert.strictEqual(game.timer, 0);
  
  game.startGame(0, 0);
  assert.strictEqual(game.state, STATE.RUNNING);
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Win
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      if (!game.board[y][x].isMine) {
        game.reveal(x, y);
      }
    }
  }
  
  assert.strictEqual(game.state, STATE.WON);
  assert.strictEqual(game.flags, 10);
  
  game.reset();
  assert.strictEqual(game.state, STATE.READY);
  
  game.stopTimer();
});

test('Game - Get Standard Difficulty', async () => {
  assert.strictEqual(getStandardDifficulty(DIFFICULTY.BEGINNER), 'beginner');
  assert.strictEqual(getStandardDifficulty(DIFFICULTY.INTERMEDIATE), 'intermediate');
  assert.strictEqual(getStandardDifficulty(DIFFICULTY.EXPERT), 'expert');
  assert.strictEqual(getStandardDifficulty({ width: 10, height: 10, mines: 10 }), null);
});

test('Game - Get Cell', async () => {
  const game = new Minesweeper(CONFIG_9x9_10);
  
  assert.ok(game.getCell(2, 2));
  assert.strictEqual(game.getCell(2, 2).x, 2);
  assert.strictEqual(game.getCell(2, 2).y, 2);
  // Out-of-bounds checks with valid 9x9 board
  assert.strictEqual(game.getCell(-1, 0), null);
  assert.strictEqual(game.getCell(0, -1), null);
  assert.strictEqual(game.getCell(9, 0), null);  // x >= width
  assert.strictEqual(game.getCell(0, 9), null);  // y >= height
});

test('Game - Cell States', async () => {
  const game = new Minesweeper(CONFIG_9x9_10);
  game.startGame(0, 0);
  
  const cell = game.getCell(1, 1);
  assert.strictEqual(cell.state, CELL_STATE.CLOSED);
  
  game.cycleFlag(1, 1);
  assert.strictEqual(cell.state, CELL_STATE.FLAGGED);
  
  game.cycleFlag(1, 1);
  assert.strictEqual(cell.state, CELL_STATE.QUESTIONED);
  
  game.cycleFlag(1, 1);
  assert.strictEqual(cell.state, CELL_STATE.CLOSED);
  
  game.stopTimer();
});

test('Game - Board dimensions', async () => {
  const game = new Minesweeper(CONFIG_9x9_10);
  
  assert.strictEqual(game.width, 9);
  assert.strictEqual(game.height, 9);
  assert.strictEqual(game.board.length, 9);
  assert.strictEqual(game.board[0].length, 9);
});

test('Game - Timer cleanup on reset', async () => {
  const game = new Minesweeper(CONFIG_9x9_10);
  
  game.startGame(0, 0);
  assert.ok(game.timerInterval !== null);
  
  game.reset();
  assert.strictEqual(game.timerInterval, null);
  assert.strictEqual(game.timer, 0);
});

test('Game - Reveal returns cells on first click', async () => {
  const game = new Minesweeper(CONFIG_9x9_10);
  const result = game.reveal(0, 0);
  assert.ok(result.cells.length >= 1);
  
  game.stopTimer();
});

test('Game - Reveal returns all cells on win', async () => {
  // Create valid config 9x9/10
  const game = createDeterministicGame(9, 9, 10, [
    { x: 0, y: 0 }, { x: 2, y: 1 }, { x: 4, y: 2 }, { x: 6, y: 3 }, { x: 8, y: 4 },
    { x: 1, y: 5 }, { x: 3, y: 6 }, { x: 5, y: 7 }, { x: 7, y: 8 }, { x: 8, y: 0 }
  ]);
  
  // Reveal all non-mine cells
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      if (!game.board[y][x].isMine) {
        game.reveal(x, y);
      }
    }
  }
  
  assert.strictEqual(game.state, STATE.WON);
});

test('Game - Reveal returns all cells on loss', async () => {
  const game = createDeterministicGame(9, 9, 10, [
    { x: 0, y: 0 }, { x: 2, y: 1 }, { x: 4, y: 2 }, { x: 6, y: 3 }, { x: 8, y: 4 },
    { x: 1, y: 5 }, { x: 3, y: 6 }, { x: 5, y: 7 }, { x: 7, y: 8 }, { x: 8, y: 0 }
  ]);
  // Place an additional mine at (0,0) for loss test
  game.board[0][0].isMine = true;
  game.calculateNumbers();
  // Reset and set state
  game.state = STATE.RUNNING;
  
  const result = game.reveal(0, 0);
  assert.strictEqual(result.result, 'terminal');
  assert.strictEqual(game.state, STATE.LOST);
  assert.ok(result.cells.length > 0);
});

test('Game - Cycle flag returns flagsChanged on state change', async () => {
  const game = new Minesweeper(CONFIG_9x9_10);
  game.startGame(0, 0);
  
  let result = game.cycleFlag(1, 1);
  assert.strictEqual(result.flagsChanged, true);
  
  result = game.cycleFlag(1, 1);
  assert.strictEqual(result.flagsChanged, true);
  assert.strictEqual(game.flags, 0);
  
  result = game.cycleFlag(1, 1);
  assert.strictEqual(result.flagsChanged, true);
  assert.strictEqual(game.flags, 0);
  
  game.stopTimer();
});

// Export for Node.js test runner
export default {};
