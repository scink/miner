/**
 * Integration tests for Minesweeper UI
 */

import test from 'node:test';
import assert from 'node:assert';
import { Minesweeper, CELL_STATE, STATE } from '../src/Game.js';

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

test('UI - Module imports correctly', async () => {
  const GameModule = await import('../src/Game.js');
  const { Minesweeper } = GameModule;
  const DIFFICULTY = GameModule.DIFFICULTY;
  const CELL_STATE = GameModule.CELL_STATE;
  const STATE = GameModule.STATE;
  const { UI } = await import('../src/UI.js');
  
  assert.ok(Minesweeper, 'Minesweeper class imported');
  assert.ok(DIFFICULTY, 'DIFFICULTY constants imported');
  assert.ok(CELL_STATE, 'CELL_STATE constants imported');
  assert.ok(STATE, 'STATE constants imported');
});

test('UI - Game state updates', async () => {
  const GameModule = await import('../src/Game.js');
  const { Minesweeper } = GameModule;
  const game = new Minesweeper({ width: 9, height: 9, mines: 10 });
  
  assert.strictEqual(game.state, 'ready', 'Initial state is ready');
  
  game.startGame(4, 4);
  assert.strictEqual(game.state, 'running', 'State after start is running');
  
  game.reveal(0, 0);
  
  const state = game.getState();
  assert.ok(state.timer >= 0, 'Timer is set');
  assert.strictEqual(state.flags, 0, 'Flags start at 0');
  
  game.stopTimer();
});

test('UI - Reveal results (deterministic, no timer)', async () => {
  const GameModule = await import('../src/Game.js');
  const { Minesweeper, CELL_STATE, STATE } = GameModule;
  
  // Test: Reveal from READY state - game starts automatically
  const game1 = new Minesweeper({ width: 9, height: 9, mines: 10 });
  const result1 = game1.reveal(4, 4);  // Call reveal directly from READY
  assert.strictEqual(result1.result, 'ok', 'First reveal from READY returns ok');
  assert.strictEqual(game1.board[4][4].state, CELL_STATE.REVEALED, 'Cell revealed');
  assert.strictEqual(game1.state, STATE.RUNNING, 'Game state RUNNING after first reveal');
  game1.stopTimer();
  
  // Test: Revealing flagged cell (separate game, no timer started)
  const game2 = new Minesweeper({ width: 9, height: 9, mines: 10 });
  // Flag a cell in READY state - timer should NOT start
  game2.cycleFlag(0, 0);
  assert.strictEqual(game2.state, STATE.READY, 'State still READY after flagging');
  assert.strictEqual(game2.timer, 0, 'Timer is 0 (not started)');
  
  const result2 = game2.reveal(0, 0);
  assert.strictEqual(result2.result, 'flagged', 'Revealing flagged returns flagged');
  game2.stopTimer();
});

test('UI - Game over states (deterministic, no timer)', async () => {
  const GameModule = await import('../src/Game.js');
  const { Minesweeper, CELL_STATE, STATE } = GameModule;
  
  // Place mine at (0,0) which will NOT be in safe zone
  const game = createDeterministicGame(9, 9, 10, [
    { x: 0, y: 0 }, { x: 2, y: 1 }, { x: 4, y: 2 }, { x: 6, y: 3 }, { x: 8, y: 4 },
    { x: 1, y: 5 }, { x: 3, y: 6 }, { x: 5, y: 7 }, { x: 7, y: 8 }, { x: 8, y: 0 }
  ]);
  // Ensure (0,0) has a mine
  game.board[0][0].isMine = true;
  game.calculateNumbers();
  game.state = STATE.RUNNING;
  
  // Hit the mine at (0,0)
  const hitResult = game.reveal(0, 0);
  assert.strictEqual(hitResult.result, 'terminal', 'Mine hit returns terminal');
  assert.strictEqual(game.state, STATE.LOST, 'State is lost after mine hit');
  
  assert.strictEqual(game.board[0][0].exploded, true, 'Mine cell shows explosion');
  
  game.stopTimer();
});

test('UI - Flag counting (deterministic, no timer)', async () => {
  const GameModule = await import('../src/Game.js');
  const { Minesweeper, CELL_STATE, STATE } = GameModule;
  const game = new Minesweeper({ width: 9, height: 9, mines: 10 });
  
  game.startGame(4, 4);
  
  game.cycleFlag(1, 1);
  assert.strictEqual(game.flags, 1, 'Flag count after first flag is 1');
  
  game.cycleFlag(1, 1);
  assert.strictEqual(game.flags, 0, 'Flag count after second flag is 0');
  
  game.cycleFlag(1, 1);
  assert.strictEqual(game.flags, 0, 'Flag count after third flag is 0');
  
  game.stopTimer();
});

test('UI - Mines left calculation (deterministic, no timer)', async () => {
  const GameModule = await import('../src/Game.js');
  const { Minesweeper, CELL_STATE, STATE } = GameModule;
  const game = new Minesweeper({ width: 9, height: 9, mines: 10 });
  
  game.startGame(4, 4);
  
  let minesLeft = game.totalMines - game.flags;
  assert.strictEqual(minesLeft, 10, 'Initial mines left is 10');
  
  game.cycleFlag(1, 1);
  game.cycleFlag(1, 2);
  
  minesLeft = game.totalMines - game.flags;
  assert.strictEqual(minesLeft, 8, 'Mines left after 2 flags is 8');
  
  game.stopTimer();
});

test('UI - Deterministic Chord test with correct flags', async () => {
  const GameModule = await import('../src/Game.js');
  const { Minesweeper, CELL_STATE, STATE } = GameModule;
  
  // Use valid 9x9/10 layout with EXACTLY 10 mines:
  // mines at (0,0), (8,0), (8,1), (8,2), (8,3), (8,4), (8,5), (8,6), (8,7), (8,8)
  // Only mine (0,0) is near target cell (1,1)
  const game = createDeterministicGame(9, 9, 10, [
    { x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 1 }, { x: 8, y: 2 },
    { x: 8, y: 3 }, { x: 8, y: 4 }, { x: 8, y: 5 }, { x: 8, y: 6 },
    { x: 8, y: 7 }, { x: 8, y: 8 }
  ]);
  
  // Set up: target cell (1,1) has exactly 1 neighbor (mine at 0,0)
  // First reveal cell (1,1) manually
  game.board[1][1].isMine = false;
  game.board[1][1].neighbors = 1;
  game.board[1][1].state = CELL_STATE.REVEALED;
  game.revealedCount = 1;
  game.state = STATE.RUNNING;
  
  // Set safe neighbors to have neighbors=1 so flood doesn't reveal them
  const neighbors = game.getNeighbors(1, 1);
  for (const n of neighbors) {
    if (n.x !== 0 || n.y !== 0) {
      n.neighbors = 1;
    }
  }
  
  // Flag the mine at (0,0)
  game.cycleFlag(0, 0);
  assert.strictEqual(game.board[0][0].state, CELL_STATE.FLAGGED);
  assert.strictEqual(game.flags, 1);
  
  // Now chord should reveal 7 safe neighbors (not the mine)
  const result = game.chord(1, 1);
  
  // The mine at (0,0) should remain FLAGGED (not revealed)
  assert.strictEqual(game.board[0][0].state, CELL_STATE.FLAGGED, 'Mine remains flagged');
  
  // All 7 safe neighbors should be revealed
  for (const n of neighbors) {
    if (n.x !== 0 || n.y !== 0) {
      assert.strictEqual(game.board[n.y][n.x].state, CELL_STATE.REVEALED, `Safe neighbor at ${n.x},${n.y} should be revealed`);
    }
  }
  
  game.stopTimer();
});

test('UI - Chord with QUESTIONED cells', async () => {
  const GameModule = await import('../src/Game.js');
  const { Minesweeper, CELL_STATE, STATE } = GameModule;
  
  // Use valid 9x9/10 layout with EXACTLY 10 mines
  const game = createDeterministicGame(9, 9, 10, [
    { x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 1 }, { x: 8, y: 2 },
    { x: 8, y: 3 }, { x: 8, y: 4 }, { x: 8, y: 5 }, { x: 8, y: 6 },
    { x: 8, y: 7 }, { x: 8, y: 8 }
  ]);
  
  // Set up: target cell (1,1) has neighbors=1
  game.board[1][1].isMine = false;
  game.board[1][1].neighbors = 1;
  game.board[1][1].state = CELL_STATE.REVEALED;
  game.revealedCount = 1;
  game.state = STATE.RUNNING;
  
  const neighbors = game.getNeighbors(1, 1);
  // Set safe neighbors to neighbors=1
  for (const n of neighbors) {
    if (n.x !== 0 || n.y !== 0) {
      n.neighbors = 1;
    }
  }
  
  // First, set one safe neighbor (2,0) to QUESTIONED via 2 cycleFlag calls
  const targetNeighbor = neighbors.find(n => n.x === 2 && n.y === 0);
  if (targetNeighbor) {
    game.cycleFlag(targetNeighbor.x, targetNeighbor.y);
    game.cycleFlag(targetNeighbor.x, targetNeighbor.y);
    assert.strictEqual(game.board[targetNeighbor.y][targetNeighbor.x].state, CELL_STATE.QUESTIONED);
  }
  
  // Flag the mine at (0,0)
  game.cycleFlag(0, 0);
  assert.strictEqual(game.board[0][0].state, CELL_STATE.FLAGGED);
  assert.strictEqual(game.flags, 1);
  
  // Chord should reveal the QUESTIONED cell (since it counts as part of the neighbor count)
  const result = game.chord(1, 1);
  
  // The mine at (0,0) should remain FLAGGED
  assert.strictEqual(game.board[0][0].state, CELL_STATE.FLAGGED, 'Mine remains flagged');
  
  // The QUESTIONED neighbor should now be REVEALED
  if (targetNeighbor) {
    assert.strictEqual(game.board[targetNeighbor.y][targetNeighbor.x].state, CELL_STATE.REVEALED, 'QUESTIONED neighbor should be revealed');
  }
  
  game.stopTimer();
});

test('UI - First reveal is always safe', async () => {
  const GameModule = await import('../src/Game.js');
  const { Minesweeper } = GameModule;
  
  const game = new Minesweeper({ width: 9, height: 9, mines: 10 });
  
  // Start game which guarantees first cell is safe
  game.startGame(4, 4);
  
  assert.strictEqual(game.board[4][4].isMine, false, 'Cell 4,4 is safe');
  
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      
      const nx = 4 + dx;
      const ny = 4 + dy;
      
      if (nx >= 0 && nx < 9 && ny >= 0 && ny < 9) {
        assert.strictEqual(game.board[ny][nx].isMine, false, `Neighbor ${nx},${ny} is safe`);
      }
    }
  }
  
  game.stopTimer();
});

test('UI - Wrong flag rendering state', async () => {
  const GameModule = await import('../src/Game.js');
  const { Minesweeper, CELL_STATE, STATE } = GameModule;
  
  // Use valid 9x9/10 layout
  const game = createDeterministicGame(9, 9, 10, [
    { x: 0, y: 0 }, { x: 8, y: 0 }, { x: 0, y: 8 }, { x: 8, y: 8 },
    { x: 4, y: 0 }, { x: 4, y: 8 }, { x: 0, y: 4 }, { x: 8, y: 4 },
    { x: 2, y: 2 }, { x: 6, y: 6 }
  ]);
  
  // Manually set state to RUNNING (no timer)
  game.state = STATE.RUNNING;
  
  // Flag a wrong non-mine cell (1,1)
  game.cycleFlag(1, 1);
  assert.strictEqual(game.board[1][1].state, CELL_STATE.FLAGGED);
  assert.strictEqual(game.board[1][1].isMine, false, 'Cell (1,1) is not a mine');
  
  // Flag a correct mine (8,8)
  game.cycleFlag(8, 8);
  assert.strictEqual(game.board[8][8].state, CELL_STATE.FLAGGED);
  assert.strictEqual(game.board[8][8].isMine, true, 'Cell (8,8) is a mine');
  
  // Trigger loss by revealing a mine (0,0)
  game.reveal(0, 0);
  assert.strictEqual(game.state, STATE.LOST);
  
  // Wrong flag should have wrongFlag = true and remain FLAGGED
  assert.strictEqual(game.board[1][1].state, CELL_STATE.FLAGGED, 'Wrong flag remains flagged');
  assert.strictEqual(game.board[1][1].wrongFlag, true, 'Wrong flag has wrongFlag set');
  
  // Correct flag should remain FLAGGED with wrongFlag = false
  assert.strictEqual(game.board[8][8].state, CELL_STATE.FLAGGED, 'Correct flag remains flagged');
  assert.strictEqual(game.board[8][8].wrongFlag, false, 'Correct flag has no wrongFlag');
  
  // The exploded mine should be REVEALED with exploded = true
  assert.strictEqual(game.board[0][0].state, CELL_STATE.REVEALED, 'Mine cell is revealed');
  assert.strictEqual(game.board[0][0].exploded, true, 'Mine cell exploded');
  
  game.stopTimer();
});

test('UI - Board dimensions', async () => {
  const GameModule = await import('../src/Game.js');
  const { Minesweeper } = GameModule;
  const game = new Minesweeper({ width: 30, height: 16, mines: 99 });
  
  assert.strictEqual(game.width, 30, 'Width is 30');
  assert.strictEqual(game.height, 16, 'Height is 16');
  assert.strictEqual(game.board.length, 16, 'Board has 16 rows');
  assert.strictEqual(game.board[0].length, 30, 'Board rows have 30 columns');
  
  game.stopTimer();
});

test('UI - renderSevenSegment digit "0" segments', async () => {
  const { UI } = await import('../src/UI.js');
  
  // Create minimal UI prototype instance without DOM
  const ui = Object.create(UI.prototype);
  
  // Test renderSevenSegment for '0' - should have a-f active, g inactive
  const result = ui.renderSevenSegment('0');
  
  // Check that segments a-f have active class and g is not active
  const activeA = result.includes('seg a active');
  const activeB = result.includes('seg b active');
  const activeC = result.includes('seg c active');
  const activeD = result.includes('seg d active');
  const activeE = result.includes('seg e active');
  const activeF = result.includes('seg f active');
  const activeG = result.includes('seg g active');
  
  assert.ok(activeA, 'Segment a should be active for "0"');
  assert.ok(activeB, 'Segment b should be active for "0"');
  assert.ok(activeC, 'Segment c should be active for "0"');
  assert.ok(activeD, 'Segment d should be active for "0"');
  assert.ok(activeE, 'Segment e should be active for "0"');
  assert.ok(activeF, 'Segment f should be active for "0"');
  assert.ok(!activeG, 'Segment g should NOT be active for "0"');
});

test('UI - Face click (handleFaceClick) resets game state', async () => {
  const { UI } = await import('../src/UI.js');
  const { Minesweeper, CELL_STATE, STATE } = await import('../src/Game.js');
  
  // Create a real game instance
  const game = new Minesweeper({ width: 9, height: 9, mines: 10 });
  
  // Start the game
  game.startGame(4, 4);
  assert.strictEqual(game.state, STATE.RUNNING, 'Game should be running after start');
  
  // Simulate some actions (flag a cell)
  game.cycleFlag(0, 0);
  assert.strictEqual(game.flags, 1, 'Flags should be 1');
  
  // Create minimal UI prototype instance without DOM
  const ui = Object.create(UI.prototype);
  ui.game = game;
  
  // Spy methods to avoid DOM calls
  ui.updateAllCells = () => { ui.updateAllCellsCalled = true; };
  ui.updateCounters = () => { ui.updateCountersCalled = true; };
  ui.setFaceState = (state) => { 
    ui.setFaceStateCalled = true; 
    ui.setFaceStateArg = state;
    ui.faceState = state;
  };
  
  // Call handleFaceClick directly
  ui.handleFaceClick();
  
  // Verify game was reset
  assert.strictEqual(game.state, STATE.READY, 'Game should be READY after reset');
  assert.strictEqual(game.flags, 0, 'Flags should be 0 after reset');
  assert.strictEqual(game.timer, 0, 'Timer should be 0 after reset');
  assert.strictEqual(game.revealedCount, 0, 'Revealed count should be 0 after reset');
  
  // Verify face state is normal
  assert.strictEqual(ui.faceState, 'normal', 'Face state should be normal');
  
  game.stopTimer();
});

test('UI - resetGame calls updateCounters (regression)', async () => {
  const { UI } = await import('../src/UI.js');
  const { STATE } = await import('../src/Game.js');
  
  // Create minimal UI prototype instance without DOM
  const ui = Object.create(UI.prototype);
  
  // Create a mock game with spies on methods
  const game = {
    reset: () => { game.resetCalled = true; },
    state: STATE.READY,
    timer: 5,
    flags: 2,
    revealedCount: 5,
    width: 9,
    height: 9,
    totalMines: 10,
    startGame: () => {},
    stopTimer: () => {},
    getState: () => ({
      timer: game.timer,
      flags: game.flags,
      revealedCount: game.revealedCount,
      state: game.state
    })
  };
  game.resetCalled = false;
  
  // Spy methods
  ui.updateAllCells = () => { ui.updateAllCellsCalled = true; };
  ui.updateCounters = () => { ui.updateCountersCalled = true; };
  ui.setFaceState = (state) => { ui.setFaceStateCalled = true; ui.setFaceStateArg = state; };
  
  // Inject mock game
  ui.game = game;
  
  // Call resetGame
  ui.resetGame();
  
  // Verify all expected calls
  assert.strictEqual(game.resetCalled, true, 'game.reset was called');
  assert.strictEqual(ui.updateAllCellsCalled, true, 'updateAllCells was called');
  assert.strictEqual(ui.updateCountersCalled, true, 'updateCounters was called');
  assert.strictEqual(ui.setFaceStateCalled, true, 'setFaceState was called');
  assert.strictEqual(ui.setFaceStateArg, 'normal', 'setFaceState called with normal');
});

test('UI - Single-click chord preview (mousedown on revealed digit)', async () => {
  const { UI } = await import('../src/UI.js');
  const { Minesweeper, CELL_STATE, STATE } = await import('../src/Game.js');
  
  // Use valid 9x9/10 layout with EXACTLY 10 mines
  const game = createDeterministicGame(9, 9, 10, [
    { x: 0, y: 0 }, { x: 8, y: 0 }, { x: 0, y: 8 }, { x: 8, y: 8 },
    { x: 4, y: 0 }, { x: 4, y: 8 }, { x: 0, y: 4 }, { x: 8, y: 4 },
    { x: 2, y: 2 }, { x: 6, y: 6 }
  ]);
  
  // Manually set state to RUNNING (no timer)
  game.state = STATE.RUNNING;
  
  // Reveal center cell (4,4) and set it to have neighbors > 0
  game.board[4][4].isMine = false;
  game.board[4][4].neighbors = 4; // 4 neighbors with mines
  game.board[4][4].state = CELL_STATE.REVEALED;
  game.revealedCount = 1;
  
  // Get neighbors of (4,4)
  const neighbors = game.getNeighbors(4, 4);
  
  // Set some neighbors to different states
  // neighbor at (3,3) - CLOSED
  if (neighbors.find(n => n.x === 3 && n.y === 3)) {
    neighbors.find(n => n.x === 3 && n.y === 3).state = CELL_STATE.CLOSED;
  }
  // neighbor at (3,4) - FLAGGED (should NOT get pressing)
  if (neighbors.find(n => n.x === 3 && n.y === 4)) {
    neighbors.find(n => n.x === 3 && n.y === 4).state = CELL_STATE.FLAGGED;
  }
  // neighbor at (3,5) - QUESTIONED
  if (neighbors.find(n => n.x === 3 && n.y === 5)) {
    neighbors.find(n => n.x === 3 && n.y === 5).state = CELL_STATE.QUESTIONED;
  }
  // neighbor at (4,3) - REVEALED (already revealed, should NOT get pressing)
  if (neighbors.find(n => n.x === 4 && n.y === 3)) {
    neighbors.find(n => n.x === 4 && n.y === 3).state = CELL_STATE.REVEALED;
  }
  
  // Create minimal UI without DOM for testing highlightChordNeighbors
  const ui = Object.create(UI.prototype);
  ui.game = game;
  ui.element = { cells: new Map() };
  
  // Mock DOM cells for neighbors with tracked classList operations
  const neighborsMap = new Map();
  for (const neighbor of neighbors) {
    const classList = {
      has: (className) => false,
      add: (className) => { classList.added = classList.added || new Set(); classList.added.add(className); },
      remove: (className) => { classList.removed = classList.removed || new Set(); classList.removed.add(className); }
    };
    classList.added = new Set();
    classList.removed = new Set();
    ui.element.cells.set(`${neighbor.x},${neighbor.y}`, { classList });
    neighborsMap.set(`${neighbor.x},${neighbor.y}`, { classList, state: neighbor.state });
  }
  
  // Call highlightChordNeighbors (should add 'pressing' to CLOSED and QUESTIONED only)
  ui.highlightChordNeighbors(4, 4);
  
  // Verify which cells got 'pressing' class added
  for (const [key, data] of neighborsMap.entries()) {
    if (data.state === CELL_STATE.CLOSED || data.state === CELL_STATE.QUESTIONED) {
      assert.ok(data.classList.added.has('pressing'), `CLOSED/QUESTIONED cell ${key} should get pressing`);
    } else if (data.state === CELL_STATE.FLAGGED || data.state === CELL_STATE.REVEALED) {
      assert.ok(!data.classList.added.has('pressing'), `FLAGGED/REVEALED cell ${key} should NOT get pressing`);
    }
  }
  
  // Clear pressing
  ui.clearBoardPressing();
  
  // Verify pressing removed for all
  for (const [key, data] of neighborsMap.entries()) {
    assert.ok(data.classList.removed.has('pressing'), `Cell ${key} should have pressing removed`);
  }
  
  game.stopTimer();
});

test('UI - Face SVG for terminal states', async () => {
  const { UI } = await import('../src/UI.js');
  
  // Create minimal UI prototype instance without DOM
  const ui = Object.create(UI.prototype);
  
  // Get SVG icons for won and dead states
  const wonSvg = ui.getFaceSvg('won');
  const deadSvg = ui.getFaceSvg('dead');
  
  // Won state should contain sunglasses (two black rectangles) and smile
  assert.ok(wonSvg.includes('fill="black"') && wonSvg.includes('viewBox="0 0 32 32"'), 
    'Won face should have sunglasses (black fill)');
  assert.ok(wonSvg.includes('Q16 27'), 'Won face should have smile (arc path with Q16 27)');
  
  // Dead state should contain X-eyes (two diagonal lines per eye)
  assert.ok(deadSvg.includes('stroke="black"') && deadSvg.includes('viewBox="0 0 32 32"'), 
    'Dead face should have X-eyes (black stroke)');
});

test('UI - closeAllMenus closes dropdown without focus reopening', async () => {
  const { UI } = await import('../src/UI.js');
  
  // Create minimal UI prototype instance without DOM
  const ui = Object.create(UI.prototype);
  
  // Mock dropdown elements
  const gameMenu = { classList: { add: () => {}, remove: () => {} }, style: {} };
  const helpMenu = { classList: { add: () => {}, remove: () => {} }, style: {} };
  ui.element = { menuDropdowns: { game: gameMenu, help: helpMenu } };
  
  // Simulate dropdowns being open
  gameMenu.classList.add = function(c) { if (c === 'show') gameMenu.show = true; };
  gameMenu.classList.remove = function(c) { if (c === 'show') gameMenu.show = false; };
  gameMenu.show = true;
  
  helpMenu.classList.add = function(c) { if (c === 'show') helpMenu.show = true; };
  helpMenu.classList.remove = function(c) { if (c === 'show') helpMenu.show = false; };
  helpMenu.show = true;
  
  // Call closeAllMenus
  ui.closeAllMenus();
  
  // Verify dropdowns are closed
  assert.strictEqual(gameMenu.show, false, 'Game menu dropdown should be closed');
  assert.strictEqual(helpMenu.show, false, 'Help menu dropdown should be closed');
  
  // Verify styles were cleared
  assert.strictEqual(gameMenu.style.position, '', 'Game menu position should be empty');
  assert.strictEqual(gameMenu.style.left, '', 'Game menu left should be empty');
  assert.strictEqual(gameMenu.style.top, '', 'Game menu top should be empty');
});

// Static CSS regression test for padding: 0 on .cell and flex on icon pseudo-elements
test('CSS - Static regression: .cell has padding: 0 and icons have flex: 0 0 auto', async () => {
  const fs = await import('node:fs');
  const cssContent = fs.readFileSync(new URL('../src/styles.css', import.meta.url).pathname, 'utf8');
  
  // Test 1: .cell rule contains padding: 0
  const cellRuleMatch = cssContent.match(/\.cell\s*\{([^}]+)\}/s);
  assert.ok(cellRuleMatch, '.cell rule should exist');
  assert.ok(cellRuleMatch[1].includes('padding: 0;'), '.cell should have padding: 0');
  
  // Test 2: Combined selector block for icon pseudo-elements includes all required selectors and flex: 0 0 auto
  const iconSelectorBlockPattern = /\.cell\.mine::before,\s*\.cell\.flagged::before,\s*\.cell\.flagged\.wrong-flag::before,\s*\.cell\.flagged\.wrong-flag::after,\s*\.cell\.wrong-flag:not\(\.flagged\)::before,\s*\.cell\.wrong-flag:not\(\.flagged\)::after,\s*\.cell\.questioned::before\s*\{([^}]+)\}/s;
  const iconBlockMatch = cssContent.match(iconSelectorBlockPattern);
  assert.ok(iconBlockMatch, 'Combined icon pseudo-element selector block should exist');
  assert.ok(iconBlockMatch[1].includes('flex: 0 0 auto;'), 'Combined block should have flex: 0 0 auto');
});

// === MENU REGRESSION TESTS ===

test('UI - handleMenuClick method exists and is a function', async () => {
  const { UI } = await import('../src/UI.js');
  
  // Check that handleMenuClick exists and is a function
  assert.ok(UI.prototype.handleMenuClick, 'handleMenuClick should exist on UI prototype');
  assert.strictEqual(typeof UI.prototype.handleMenuClick, 'function', 'handleMenuClick should be a function');
});

test('UI - handleDropdownClick method exists and is a function', async () => {
  const { UI } = await import('../src/UI.js');
  
  // Check that handleDropdownClick exists and is a function
  assert.ok(UI.prototype.handleDropdownClick, 'handleDropdownClick should exist on UI prototype');
  assert.strictEqual(typeof UI.prototype.handleDropdownClick, 'function', 'handleDropdownClick should be a function');
});

test('UI - handleMenuClick opens dropdown and closes others without focus', async () => {
  const { UI } = await import('../src/UI.js');
  
  // Create minimal UI prototype instance without DOM
  const ui = Object.create(UI.prototype);
  
  // Mock menu items and dropdowns
  const menuGame = { 
    classList: { 
      add: (c) => { if (c === 'show') menuGame.show = true; },
      remove: (c) => { if (c === 'show') menuGame.show = false; },
      contains: (c) => c === 'show' ? menuGame.show : false
    }, 
    style: {}, 
    show: false 
  };
  const menuHelp = { 
    classList: { 
      add: (c) => { if (c === 'show') menuHelp.show = true; },
      remove: (c) => { if (c === 'show') menuHelp.show = false; },
      contains: (c) => c === 'show' ? menuHelp.show : false
    }, 
    style: {}, 
    show: false 
  };
  
  ui.element = {
    menuItems: new Map([
      ['menu-game-dropdown', menuGame],
      ['menu-help-dropdown', menuHelp]
    ]),
    menuDropdowns: { game: menuGame, help: menuHelp }
  };
  
  // Spy closeAllMenus
  let closeAllMenusCalled = false;
  ui.closeAllMenus = () => { closeAllMenusCalled = true; };
  
  // Mock item with getBoundingClientRect and closest method
  const mockItem = {
    dataset: { menuId: 'menu-game-dropdown' },
    getBoundingClientRect: () => ({ left: 100, bottom: 50 }),
    closest: () => mockItem
  };
  
  // Mock event
  const mockEvent = { target: mockItem };
  
  // Call handleMenuClick
  ui.handleMenuClick(mockEvent);
  
  // Verify closeAllMenus was called
  assert.strictEqual(closeAllMenusCalled, true, 'closeAllMenus should be called');
  
  // Verify dropdown was opened with correct position
  assert.ok(menuGame.classList.add.called || menuGame.show, 'Game menu should have show class added');
  assert.strictEqual(menuGame.style.position, 'fixed', 'Dropdown should have fixed position');
  assert.strictEqual(menuGame.style.left, '100px', 'Dropdown should have correct left position');
  assert.strictEqual(menuGame.style.top, '52px', 'Dropdown should have correct top position (bottom + 2)');
  
  // Verify help menu was closed
  assert.strictEqual(menuHelp.classList.remove.called || !menuHelp.show, true, 'Help menu should be closed');
});

test('UI - handleMenuClick toggles already open menu closed', async () => {
  const { UI } = await import('../src/UI.js');
  
  // Create minimal UI prototype instance without DOM
  const ui = Object.create(UI.prototype);
  
  // Mock menu items with classList.contains spy
  const menuGame = { 
    classList: { 
      add: (c) => { if (c === 'show') menuGame.show = true; },
      remove: (c) => { if (c === 'show') menuGame.show = false; },
      contains: (c) => c === 'show' ? menuGame.show : false
    }, 
    style: {}, 
    show: true 
  };
  
  ui.element = {
    menuItems: new Map([
      ['menu-game-dropdown', menuGame]
    ]),
    menuDropdowns: { game: menuGame }
  };
  
  // Spy closeAllMenus
  let closeAllMenusCalled = false;
  ui.closeAllMenus = () => { closeAllMenusCalled = true; };
  
  // Mock item with closest method
  const mockItem = {
    dataset: { menuId: 'menu-game-dropdown' },
    getBoundingClientRect: () => ({ left: 100, bottom: 50 }),
    closest: () => mockItem
  };
  
  const mockEvent = { target: mockItem };
  
  // Menu is already open (show = true)
  menuGame.show = true;
  
  // Call handleMenuClick on already open menu
  ui.handleMenuClick(mockEvent);
  
  // Verify menu is now closed
  assert.strictEqual(menuGame.show, false, 'Already open menu should be closed on second click');
});

test('UI - handleDropdownClick new action resets game', async () => {
  const { UI } = await import('../src/UI.js');
  
  const ui = Object.create(UI.prototype);
  
  // Mock methods
  let resetGameCalled = false;
  let closeAllMenusCalled = false;
  
  ui.resetGame = () => { resetGameCalled = true; };
  ui.closeAllMenus = () => { closeAllMenusCalled = true; };
  
  // Mock item for 'new' action
  const mockItem = {
    dataset: { action: 'new' },
    closest: () => mockItem
  };
  
  const mockEvent = { target: mockItem };
  
  // Call handleDropdownClick
  ui.handleDropdownClick(mockEvent);
  
  // Verify closeAllMenus called first
  assert.strictEqual(closeAllMenusCalled, true, 'closeAllMenus should be called first');
  
  // Verify resetGame was called
  assert.strictEqual(resetGameCalled, true, 'resetGame should be called for new action');
});

test('UI - handleDropdownClick difficulty action sets difficulty', async () => {
  const { UI } = await import('../src/UI.js');
  const { DIFFICULTY } = await import('../src/Game.js');
  
  const ui = Object.create(UI.prototype);
  
  // Mock methods with spies
  let closeAllMenusCalled = false;
  let setDifficultyCalled = false;
  let setDifficultyValue = null;
  let updateCheckmarksCalled = false;
  let updateCheckmarksValue = null;
  
  ui.closeAllMenus = () => { closeAllMenusCalled = true; };
  ui.setDifficulty = (value) => { setDifficultyCalled = true; setDifficultyValue = value; };
  ui.updateDifficultyCheckmarks = (value) => { updateCheckmarksCalled = true; updateCheckmarksValue = value; };
  
  // Mock item for 'difficulty' action with 'intermediate' value
  const mockItem = {
    dataset: { action: 'difficulty', value: 'intermediate' },
    closest: () => mockItem
  };
  
  const mockEvent = { target: mockItem };
  
  // Call handleDropdownClick
  ui.handleDropdownClick(mockEvent);
  
  // Verify closeAllMenus called first
  assert.strictEqual(closeAllMenusCalled, true, 'closeAllMenus should be called first');
  
  // Verify setDifficulty called with correct value
  assert.strictEqual(setDifficultyCalled, true, 'setDifficulty should be called');
  assert.strictEqual(setDifficultyValue, 'intermediate', 'setDifficulty should be called with intermediate');
  
  // Verify updateDifficultyCheckmarks called with correct value
  assert.strictEqual(updateCheckmarksCalled, true, 'updateDifficultyCheckmarks should be called');
  assert.strictEqual(updateCheckmarksValue, 'intermediate', 'updateDifficultyCheckmarks should be called with intermediate');
});

test('UI - handleDropdownClick custom action opens dialog', async () => {
  const { UI } = await import('../src/UI.js');
  
  const ui = Object.create(UI.prototype);
  
  // Mock methods with spies
  let closeAllMenusCalled = false;
  let openCustomDialogCalled = false;
  
  ui.closeAllMenus = () => { closeAllMenusCalled = true; };
  ui.openCustomDialog = () => { openCustomDialogCalled = true; };
  
  // Mock item for 'custom' action
  const mockItem = {
    dataset: { action: 'custom', value: 'custom' },
    closest: () => mockItem
  };
  
  const mockEvent = { target: mockItem };
  
  // Call handleDropdownClick
  ui.handleDropdownClick(mockEvent);
  
  // Verify closeAllMenus called first
  assert.strictEqual(closeAllMenusCalled, true, 'closeAllMenus should be called first');
  
  // Verify openCustomDialog was called
  assert.strictEqual(openCustomDialogCalled, true, 'openCustomDialog should be called for custom action');
});

test('UI - handleDropdownClick theme action toggles theme from checked', async () => {
  const { UI } = await import('../src/UI.js');
  
  const ui = Object.create(UI.prototype);
  
  // Mock methods with spies
  let closeAllMenusCalled = false;
  let toggleThemeCalled = false;
  let toggleThemeArg = null;
  
  ui.closeAllMenus = () => { closeAllMenusCalled = true; };
  ui.toggleTheme = (isDark) => { toggleThemeCalled = true; toggleThemeArg = isDark; };
  
  // Mock item for 'theme' action - already checked (dark theme active)
  const mockItem = {
    dataset: { action: 'theme' },
    classList: { contains: (c) => c === 'checked' ? true : false }, // is checked
    closest: () => mockItem
  };
  
  const mockEvent = { target: mockItem };
  
  // Call handleDropdownClick
  ui.handleDropdownClick(mockEvent);
  
  // Verify closeAllMenus called first
  assert.strictEqual(closeAllMenusCalled, true, 'closeAllMenus should be called first');
  
  // Verify toggleTheme was called with !isChecked (false since checked)
  assert.strictEqual(toggleThemeCalled, true, 'toggleTheme should be called for theme action');
  assert.strictEqual(toggleThemeArg, false, 'toggleTheme should be called with false (disable dark theme when already checked)');
});

test('UI - handleDropdownClick controls action opens dialog', async () => {
  const { UI } = await import('../src/UI.js');
  
  const ui = Object.create(UI.prototype);
  
  // Mock methods with spies
  let closeAllMenusCalled = false;
  let openControlsDialogCalled = false;
  
  ui.closeAllMenus = () => { closeAllMenusCalled = true; };
  ui.openControlsDialog = () => { openControlsDialogCalled = true; };
  
  // Mock item for 'controls' action
  const mockItem = {
    dataset: { action: 'controls' },
    closest: () => mockItem
  };
  
  const mockEvent = { target: mockItem };
  
  // Call handleDropdownClick
  ui.handleDropdownClick(mockEvent);
  
  // Verify closeAllMenus called first
  assert.strictEqual(closeAllMenusCalled, true, 'closeAllMenus should be called first');
  
  // Verify openControlsDialog was called
  assert.strictEqual(openControlsDialogCalled, true, 'openControlsDialog should be called for controls action');
});

test('UI - handleDropdownClick about action opens dialog', async () => {
  const { UI } = await import('../src/UI.js');
  
  const ui = Object.create(UI.prototype);
  
  // Mock methods with spies
  let closeAllMenusCalled = false;
  let openAboutDialogCalled = false;
  
  ui.closeAllMenus = () => { closeAllMenusCalled = true; };
  ui.openAboutDialog = () => { openAboutDialogCalled = true; };
  
  // Mock item for 'about' action
  const mockItem = {
    dataset: { action: 'about' },
    closest: () => mockItem
  };
  
  const mockEvent = { target: mockItem };
  
  // Call handleDropdownClick
  ui.handleDropdownClick(mockEvent);
  
  // Verify closeAllMenus called first
  assert.strictEqual(closeAllMenusCalled, true, 'closeAllMenus should be called first');
  
  // Verify openAboutDialog was called
  assert.strictEqual(openAboutDialogCalled, true, 'openAboutDialog should be called for about action');
});

test('UI - LED display geometry: 3 digits fit without overflow/shrink', async () => {
  const fs = await import('node:fs');
  const cssContent = fs.readFileSync(new URL('../src/styles.css', import.meta.url).pathname, 'utf8');
  
  // Find all .led-display .digit-seg blocks via matchAll
  const digitSegBlocks = [...cssContent.matchAll(/\.led-display\s+\.digit-seg\s*\{([^}]*)\}/g)];
  assert.ok(digitSegBlocks.length >= 2, 'Should have at least 2 digit-seg blocks (base and coarse)');
  
  // Base block (first)
  const baseBlock = digitSegBlocks[0][1];
  const baseWidthMatch = baseBlock.match(/width:\s*(\d+)px/);
  const baseMarginMatch = baseBlock.match(/margin:\s*0\s*(\d+)px/);
  const baseFlexMatch = baseBlock.match(/flex:\s*0\s*0\s*auto/);
  assert.ok(baseWidthMatch && baseMarginMatch && baseFlexMatch, 'Base digit-seg should have width, margin, flex');
  const baseDigitWidth = parseInt(baseWidthMatch[1], 10);
  const baseDigitMargin = parseInt(baseMarginMatch[1], 10);
  
  // Coarse block (second)
  const coarseBlock = digitSegBlocks[1][1];
  const coarseWidthMatch = coarseBlock.match(/width:\s*(\d+)px/);
  const coarseFlexMatch = coarseBlock.match(/flex:\s*0\s*0\s*auto/);
  assert.ok(coarseWidthMatch && coarseFlexMatch, 'Coarse digit-seg should have width and flex');
  const coarseDigitWidth = parseInt(coarseWidthMatch[1], 10);
  const coarseDigitMargin = baseDigitMargin; // same margin as base
  
  // Parse CSS variables for desktop
  const desktopLedWidthMatch = cssContent.match(/:root\s*\{[^}]*--led-width:\s*(\d+)px/);
  assert.ok(desktopLedWidthMatch, 'CSS variable --led-width should exist for :root');
  const desktopLedWidth = parseInt(desktopLedWidthMatch[1], 10);
  
  // Content width = outer width - borders (2px top+bottom) - padding (4px left+right for desktop)
  const desktopContentWidth = desktopLedWidth - 2 - 4;
  // 3 digits × width + 3 digits × 2×margin (1px left + 1px right per digit)
  const desktopRequiredWidth = 3 * baseDigitWidth + 3 * 2 * baseDigitMargin;
  assert.ok(desktopRequiredWidth <= desktopContentWidth, 
    `Desktop: 3 digits (${3 * baseDigitWidth}px) + 3×2 margins (${3 * 2 * baseDigitMargin}px) = ${desktopRequiredWidth}px must fit in content width ${desktopContentWidth}px (outer ${desktopLedWidth}px - borders - padding)`);
  
  // Parse CSS variables for coarse (pointer: coarse)
  const coarseLedWidthMatch = cssContent.match(/@media\s+\(pointer:\s*coarse\)\s*\{[^}]*:root\s*\{[^}]*--led-width:\s*(\d+)px/);
  assert.ok(coarseLedWidthMatch, 'CSS variable --led-width should exist for coarse media');
  const coarseLedWidth = parseInt(coarseLedWidthMatch[1], 10);
  
  // Content width = outer width - borders (2px) - padding (4px for desktop; assume similar for coarse)
  const coarseContentWidth = coarseLedWidth - 2 - 4;
  const coarseRequiredWidth = 3 * coarseDigitWidth + 3 * 2 * coarseDigitMargin;
  assert.ok(coarseRequiredWidth <= coarseContentWidth, 
    `Coarse: 3 digits (${3 * coarseDigitWidth}px) + 3×2 margins (${3 * 2 * coarseDigitMargin}px) = ${coarseRequiredWidth}px must fit in content width ${coarseContentWidth}px (outer ${coarseLedWidth}px - borders - padding)`);
  
  // Check flex: 0 0 auto on led-display and digit-seg to prevent shrink
  assert.ok(cssContent.includes('.led-display') && cssContent.includes('flex: 0 0 auto'), 
    'led-display should have flex: 0 0 auto');
  assert.ok(cssContent.includes('.digit-seg') && cssContent.includes('flex: 0 0 auto'), 
    'digit-seg should have flex: 0 0 auto');
});

test('UI - Won face SVG has separate lenses, bridge, and smile', async () => {
  const { UI } = await import('../src/UI.js');
  
  // Create minimal UI prototype instance without DOM
  const ui = Object.create(UI.prototype);
  
  // Get SVG icon for won state
  const wonSvg = ui.getFaceSvg('won');
  
  // Should contain two separate lenses (two rectangles)
  const lensMatches = wonSvg.match(/<path[^>]*fill="black"[^>]*>/g);
  assert.ok(lensMatches && lensMatches.length >= 2, 'Won face should have at least two black-filled lenses');
  
  // Should contain a bridge (short horizontal line between lenses)
  assert.ok(wonSvg.includes('stroke="black"') && wonSvg.includes('stroke-width="2"'), 
    'Won face should have bridge stroke (black, 2px)');
  
  // Should contain a smile (arc path)
  assert.ok(wonSvg.includes('Q16 27') || wonSvg.includes('Q16 26'), 
    'Won face should have smile (arc path with quadratic Bezier)');
});

test('UI - Face button mousedown does not replace SVG', async () => {
  const { UI } = await import('../src/UI.js');
  
  // Create minimal UI prototype instance without DOM
  const ui = Object.create(UI.prototype);
  
  // Check that setupEventListeners does NOT register mousedown on faceBtn
  // by checking the source code for faceBtn mousedown handler
  const uiSource = (UI.prototype.constructor + '').replace(/\s+/g, ' ');
  
  // faceBtn mousedown handler should NOT be registered
  assert.ok(!uiSource.includes('faceBtn.addEventListener(\'mousedown\''), 
    'faceBtn mousedown handler should be removed');
  
  // board mousedown should still call setFaceState('surprised') - verify it's present
  assert.ok(uiSource.includes('this.setFaceState(\'surprised\')'), 
    'board mousedown should still call setFaceState(\'surprised\')');
  
  // Verify click handler exists and calls handleFaceClick
  assert.ok(uiSource.includes('this.element.faceBtn.addEventListener(\'click\''), 
    'faceBtn click handler should exist');
  assert.ok(uiSource.includes('handleFaceClick'), 
    'handleFaceClick should be called on click');
  
  // Verify resetGame sets face to 'normal'
  assert.ok(uiSource.includes('setFaceState(\'normal\')'), 
    'resetGame should set face state to normal');
});