/**
 * Integration tests for Minesweeper UI
 */

import test from 'node:test';
import assert from 'node:assert';
import {
  Minesweeper,
  CELL_STATE,
  STATE,
  type CellState,
  type Coordinate,
  type StandardDifficulty
} from '../src/Game.ts';
import type { UI as UIInstance, UI } from '../src/UI.ts';
import type { ThemeController } from '../src/theme.ts';

interface UIConstructor {
  prototype: UIInstance;
}

interface MenuTracker {
  element: HTMLDivElement;
  isShown(): boolean;
}

interface FakeButton extends HTMLButtonElement {
  clickListeners: (() => void)[];
}

function createBareUI(UIClass: UIConstructor): UIInstance {
  return Object.create(UIClass.prototype) as UIInstance;
}

function createPartialElements(
  elements: Partial<UIInstance['element']>
): UIInstance['element'] {
  return elements as UIInstance['element'];
}

function createMouseEvent(target: HTMLDivElement): MouseEvent {
  return { target } as unknown as MouseEvent;
}

function createMenuTracker(initiallyShown = false): MenuTracker {
  let shown = initiallyShown;
  const style = { position: '', left: '', top: '' } as CSSStyleDeclaration;
  const classList = {
    add: (...tokens: string[]) => {
      if (tokens.includes('show')) shown = true;
    },
    remove: (...tokens: string[]) => {
      if (tokens.includes('show')) shown = false;
    },
    contains: (token: string) => token === 'show' && shown
  } as DOMTokenList;
  const element = { classList, style } as HTMLDivElement;

  return { element, isShown: () => shown };
}

interface MenuItemOptions {
  action?: string;
  value?: string;
  menuId?: string;
  checked?: boolean;
  left?: number;
  bottom?: number;
}

function createMenuItem(options: MenuItemOptions): HTMLDivElement {
  const dataset: Record<string, string> = {};
  if (options.action !== undefined) dataset.action = options.action;
  if (options.value !== undefined) dataset.value = options.value;
  if (options.menuId !== undefined) dataset.menuId = options.menuId;

  const item = {
    dataset,
    classList: {
      contains: (token: string) => token === 'checked' && options.checked === true
    },
    getBoundingClientRect: () => ({
      left: options.left ?? 0,
      bottom: options.bottom ?? 0
    }),
    closest: () => item
  };

  return item as unknown as HTMLDivElement;
}

function createTrackedButton(): {
  element: HTMLButtonElement;
  added: Set<string>;
  removed: Set<string>;
} {
  const added = new Set<string>();
  const removed = new Set<string>();
  const classList = {
    add: (...tokens: string[]) => tokens.forEach(token => added.add(token)),
    remove: (...tokens: string[]) => tokens.forEach(token => removed.add(token)),
    contains: (token: string) => added.has(token) && !removed.has(token)
  } as DOMTokenList;

  return {
    element: { classList } as HTMLButtonElement,
    added,
    removed
  };
}

interface PauseControlFixture {
  faceButton: HTMLButtonElement;
  faceAttributes: Map<string, string>;
  board: HTMLDivElement;
  boardAttributes: Map<string, string>;
  pauseOverlay: HTMLDivElement;
  overlayAttributes: Map<string, string>;
}

function createPauseControlFixture(): PauseControlFixture {
  const faceAttributes = new Map<string, string>();
  const boardAttributes = new Map<string, string>();
  const overlayAttributes = new Map<string, string>();

  const faceButton = {
    className: 'face-button',
    disabled: false,
    innerHTML: '',
    setAttribute: (name: string, value: string) => faceAttributes.set(name, value),
    removeAttribute: (name: string) => faceAttributes.delete(name)
  } as unknown as HTMLButtonElement;
  const board = {
    inert: false,
    style: { setProperty: () => {} } as unknown as CSSStyleDeclaration,
    setAttribute: (name: string, value: string) => boardAttributes.set(name, value),
    removeAttribute: (name: string) => boardAttributes.delete(name)
  } as unknown as HTMLDivElement;
  const pauseOverlay = {
    hidden: true,
    setAttribute: (name: string, value: string) => overlayAttributes.set(name, value),
    removeAttribute: (name: string) => overlayAttributes.delete(name)
  } as unknown as HTMLDivElement;

  return {
    faceButton,
    faceAttributes,
    board,
    boardAttributes,
    pauseOverlay,
    overlayAttributes
  };
}

function attachPauseControls(ui: UIInstance, fixture: PauseControlFixture): void {
  ui.element = createPartialElements({
    faceBtn: fixture.faceButton,
    board: fixture.board,
    pauseOverlay: fixture.pauseOverlay
  });
}

interface ZoomControlFixture {
  windowElement: HTMLDivElement;
  zoomProperties: Map<string, string>;
  zoomOutButton: HTMLButtonElement;
  zoomOutAttributes: Map<string, string>;
  zoomResetButton: HTMLButtonElement;
  zoomResetAttributes: Map<string, string>;
  zoomInButton: HTMLButtonElement;
  zoomInAttributes: Map<string, string>;
}

function createZoomButton(): {
  element: HTMLButtonElement;
  attributes: Map<string, string>;
} {
  const attributes = new Map<string, string>();
  const element = {
    disabled: false,
    textContent: '',
    title: '',
    setAttribute: (name: string, value: string) => attributes.set(name, value)
  } as unknown as HTMLButtonElement;

  return { element, attributes };
}

function createZoomControlFixture(): ZoomControlFixture {
  const zoomProperties = new Map<string, string>();
  const zoomOut = createZoomButton();
  const zoomReset = createZoomButton();
  const zoomIn = createZoomButton();
  const windowElement = {
    dataset: {},
    style: {
      setProperty: (name: string, value: string) => zoomProperties.set(name, value)
    }
  } as unknown as HTMLDivElement;

  return {
    windowElement,
    zoomProperties,
    zoomOutButton: zoomOut.element,
    zoomOutAttributes: zoomOut.attributes,
    zoomResetButton: zoomReset.element,
    zoomResetAttributes: zoomReset.attributes,
    zoomInButton: zoomIn.element,
    zoomInAttributes: zoomIn.attributes
  };
}

function attachZoomControls(ui: UIInstance, fixture: ZoomControlFixture): void {
  ui.element = createPartialElements({
    window: fixture.windowElement,
    zoomOutBtn: fixture.zoomOutButton,
    zoomResetBtn: fixture.zoomResetButton,
    zoomInBtn: fixture.zoomInButton
  });
}

type ExpectedTouchMode = 'question' | 'flag' | 'click';

interface TouchActionFixture {
  buttons: Map<ExpectedTouchMode, HTMLButtonElement>;
  attributes: Map<ExpectedTouchMode, Map<string, string>>;
}

function createTouchActionFixture(): TouchActionFixture {
  const buttons = new Map<ExpectedTouchMode, HTMLButtonElement>();
  const attributes = new Map<ExpectedTouchMode, Map<string, string>>();

  for (const mode of ['question', 'flag', 'click'] as const) {
    const buttonAttributes = new Map<string, string>();
    const button = {
      setAttribute: (name: string, value: string) => buttonAttributes.set(name, value)
    } as unknown as HTMLButtonElement;
    buttons.set(mode, button);
    attributes.set(mode, buttonAttributes);
  }

  return { buttons, attributes };
}

function createTouchCell(x: number, y: number): HTMLButtonElement {
  const cell = {
    dataset: { x: String(x), y: String(y) },
    closest: (selector: string) => selector === '.cell' ? cell : null
  };
  return cell as unknown as HTMLButtonElement;
}

function createTouchEvent(
  target: HTMLButtonElement,
  touchCount = 0
): { event: TouchEvent; wasPrevented: () => boolean } {
  let prevented = false;
  const touches = Array.from({ length: touchCount }, () => ({} as Touch));
  const event = {
    target,
    touches,
    preventDefault: () => { prevented = true; }
  } as unknown as TouchEvent;

  return { event, wasPrevented: () => prevented };
}

// Test helper: deterministic minesweeper for scenarios without timer
function createDeterministicGame(
  width: number,
  height: number,
  mines: number,
  mineCoords: readonly Coordinate[]
): Minesweeper {
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
  const GameModule = await import('../src/Game.ts');
  const { Minesweeper } = GameModule;
  const DIFFICULTY = GameModule.DIFFICULTY;
  const CELL_STATE = GameModule.CELL_STATE;
  const STATE = GameModule.STATE;
  const { UI } = await import('../src/UI.ts');

  assert.ok(Minesweeper, 'Minesweeper class imported');
  assert.ok(DIFFICULTY, 'DIFFICULTY constants imported');
  assert.ok(CELL_STATE, 'CELL_STATE constants imported');
  assert.ok(STATE, 'STATE constants imported');
});

test('UI - Game state updates', async () => {
  const GameModule = await import('../src/Game.ts');
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
  const GameModule = await import('../src/Game.ts');
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
  const GameModule = await import('../src/Game.ts');
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
  const GameModule = await import('../src/Game.ts');
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
  const GameModule = await import('../src/Game.ts');
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
  const GameModule = await import('../src/Game.ts');
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
  const GameModule = await import('../src/Game.ts');
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
  const GameModule = await import('../src/Game.ts');
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
  const GameModule = await import('../src/Game.ts');
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
  const GameModule = await import('../src/Game.ts');
  const { Minesweeper } = GameModule;
  const game = new Minesweeper({ width: 30, height: 16, mines: 99 });

  assert.strictEqual(game.width, 30, 'Width is 30');
  assert.strictEqual(game.height, 16, 'Height is 16');
  assert.strictEqual(game.board.length, 16, 'Board has 16 rows');
  assert.strictEqual(game.board[0].length, 30, 'Board rows have 30 columns');

  game.stopTimer();
});

test('UI - renderSevenSegment digit "0" segments', async () => {
  const { UI } = await import('../src/UI.ts');

  // Create minimal UI prototype instance without DOM
  const ui = createBareUI(UI);

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

test('UI - Face control is inactive in READY', async () => {
  const { UI } = await import('../src/UI.ts');
  const game = new Minesweeper({ width: 9, height: 9, mines: 10 });
  const ui = createBareUI(UI);
  ui.game = game;
  const fixture = createPauseControlFixture();
  attachPauseControls(ui, fixture);
  let resetCalled = false;
  const originalReset = game.reset.bind(game);
  game.reset = () => {
    resetCalled = true;
    originalReset();
  };

  ui.updateGameStateUI();
  ui.handleFaceClick();

  assert.strictEqual(resetCalled, false, 'READY click must not reset the game');
  assert.strictEqual(game.state, STATE.READY);
  assert.strictEqual(fixture.faceButton.disabled, true);
  assert.strictEqual(fixture.faceAttributes.get('aria-disabled'), 'true');
  assert.strictEqual(fixture.pauseOverlay.hidden, true);
  assert.strictEqual(fixture.board.inert, false);
});

test('UI - Face control pauses and resumes RUNNING game with an opaque board overlay', async () => {
  const { UI } = await import('../src/UI.ts');
  const game = new Minesweeper({ width: 9, height: 9, mines: 10 });
  game.startGame(4, 4);
  const ui = createBareUI(UI);
  ui.game = game;
  const fixture = createPauseControlFixture();
  attachPauseControls(ui, fixture);

  ui.updateGameStateUI();
  assert.strictEqual(ui.faceState, 'pause');
  assert.strictEqual(fixture.faceAttributes.get('aria-label'), 'Приостановить игру');
  assert.strictEqual(fixture.faceAttributes.get('aria-pressed'), 'false');

  ui.handleFaceClick();
  assert.strictEqual(game.state, STATE.PAUSED);
  assert.strictEqual(ui.faceState, 'resume');
  assert.strictEqual(fixture.faceAttributes.get('aria-label'), 'Продолжить игру');
  assert.strictEqual(fixture.faceAttributes.get('aria-pressed'), 'true');
  assert.strictEqual(fixture.pauseOverlay.hidden, false);
  assert.strictEqual(fixture.overlayAttributes.get('aria-hidden'), 'false');
  assert.strictEqual(fixture.boardAttributes.get('aria-hidden'), 'true');
  assert.strictEqual(fixture.board.inert, true);

  ui.handleFaceClick();
  assert.strictEqual(game.state, STATE.RUNNING);
  assert.strictEqual(ui.faceState, 'pause');
  assert.strictEqual(fixture.pauseOverlay.hidden, true);
  assert.strictEqual(fixture.boardAttributes.get('aria-hidden'), 'false');
  assert.strictEqual(fixture.board.inert, false);

  game.stopTimer();
});

test('UI - Face control restarts WON and LOST games', async () => {
  const { UI } = await import('../src/UI.ts');
  const game = new Minesweeper({ width: 9, height: 9, mines: 10 });
  const ui = createBareUI(UI);
  ui.game = game;
  const fixture = createPauseControlFixture();
  attachPauseControls(ui, fixture);
  ui.updateAllCells = () => {};
  ui.updateCounters = () => {};

  for (const terminalState of [STATE.WON, STATE.LOST] as const) {
    game.state = terminalState;
    ui.updateGameStateUI();

    assert.strictEqual(ui.faceState, terminalState === STATE.WON ? 'won' : 'dead');
    assert.match(fixture.faceAttributes.get('aria-label') ?? '', /Начать новую игру/);
    assert.strictEqual(fixture.faceButton.disabled, false);

    ui.handleFaceClick();
    assert.strictEqual(game.state, STATE.READY);
    assert.strictEqual(fixture.pauseOverlay.hidden, true);
  }
});

test('UI - Reset and difficulty changes clear paused presentation', async () => {
  const { UI } = await import('../src/UI.ts');
  const game = new Minesweeper({ width: 9, height: 9, mines: 10 });
  const ui = createBareUI(UI);
  ui.game = game;
  const fixture = createPauseControlFixture();
  attachPauseControls(ui, fixture);
  ui.updateAllCells = () => {};
  ui.updateCounters = () => {};

  game.startGame(4, 4);
  game.pause();
  ui.updateGameStateUI();
  ui.resetGame();
  assert.strictEqual(game.state, STATE.READY);
  assert.strictEqual(fixture.pauseOverlay.hidden, true);
  assert.strictEqual(fixture.board.inert, false);

  game.startGame(4, 4);
  game.pause();
  ui.updateGameStateUI();
  ui.createBoardCells = () => {};
  ui.setDifficulty('intermediate');
  assert.strictEqual(game.state, STATE.READY);
  assert.strictEqual(fixture.pauseOverlay.hidden, true);
  assert.strictEqual(fixture.board.inert, false);
});

test('UI - Zoom controls move through fixed levels and stop at the boundaries', async () => {
  const { UI } = await import('../src/UI.ts');
  const ui = createBareUI(UI);
  const fixture = createZoomControlFixture();
  attachZoomControls(ui, fixture);
  ui.zoomLevel = 100;

  ui.resetZoom();
  assert.strictEqual(fixture.zoomProperties.get('--game-zoom'), '1');
  assert.strictEqual(fixture.windowElement.dataset.zoom, '100');

  ui.zoomOut();
  assert.strictEqual(ui.zoomLevel, 75);
  assert.strictEqual(fixture.zoomProperties.get('--game-zoom'), '0.75');
  assert.strictEqual(fixture.windowElement.dataset.zoom, '75');
  assert.strictEqual(fixture.zoomOutButton.disabled, true);
  assert.strictEqual(fixture.zoomInButton.disabled, false);

  ui.zoomOut();
  assert.strictEqual(ui.zoomLevel, 75, 'Zoom out must be a no-op at 75%');

  ui.zoomIn();
  assert.strictEqual(ui.zoomLevel, 100);
  ui.zoomIn();
  assert.strictEqual(ui.zoomLevel, 125);
  ui.zoomIn();
  assert.strictEqual(ui.zoomLevel, 150);
  ui.zoomIn();
  assert.strictEqual(ui.zoomLevel, 175);
  assert.strictEqual(fixture.zoomProperties.get('--game-zoom'), '1.75');
  assert.strictEqual(fixture.windowElement.dataset.zoom, '175');
  assert.strictEqual(fixture.zoomOutButton.disabled, false);
  assert.strictEqual(fixture.zoomInButton.disabled, false);

  ui.zoomIn();
  assert.strictEqual(ui.zoomLevel, 200);
  assert.strictEqual(fixture.zoomProperties.get('--game-zoom'), '2');
  assert.strictEqual(fixture.windowElement.dataset.zoom, '200');
  assert.strictEqual(fixture.zoomOutButton.disabled, false);
  assert.strictEqual(fixture.zoomInButton.disabled, true, 'Zoom in must be disabled at 200%');

  ui.zoomIn();
  assert.strictEqual(ui.zoomLevel, 200, 'Zoom in must be a no-op at 200%');
});

test('UI - Default zoom returns to 100% and exposes the current percentage accessibly', async () => {
  const { UI } = await import('../src/UI.ts');
  const ui = createBareUI(UI);
  const fixture = createZoomControlFixture();
  attachZoomControls(ui, fixture);
  ui.zoomLevel = 125;

  ui.resetZoom();

  assert.strictEqual(ui.zoomLevel, 100);
  assert.strictEqual(fixture.zoomResetButton.textContent, '100%');
  assert.match(fixture.zoomResetButton.title, /100%/);
  assert.match(fixture.zoomResetAttributes.get('aria-label') ?? '', /Текущий масштаб: 100%/);
  assert.match(fixture.zoomOutAttributes.get('aria-label') ?? '', /Уменьшить масштаб/);
  assert.match(fixture.zoomInAttributes.get('aria-label') ?? '', /Увеличить масштаб/);
  assert.ok(fixture.zoomOutButton.title, 'Zoom out should have a tooltip');
  assert.ok(fixture.zoomInButton.title, 'Zoom in should have a tooltip');

  ui.zoomIn();
  assert.strictEqual(fixture.zoomResetButton.textContent, '125%');
  assert.match(fixture.zoomResetAttributes.get('aria-label') ?? '', /Текущий масштаб: 125%/);

  ui.resetZoom();
  assert.strictEqual(ui.zoomLevel, 100);
  assert.strictEqual(fixture.zoomProperties.get('--game-zoom'), '1');
});

test('UI - Zoom levels include 75, 100, 125, 150, 175, 200', async () => {
  const { UI } = await import('../src/UI.ts');
  const ui = createBareUI(UI);
  const fixture = createZoomControlFixture();
  attachZoomControls(ui, fixture);

  // Test all zoom levels in sequence
  const expectedLevels: (75 | 100 | 125 | 150 | 175 | 200)[] = [75, 100, 125, 150, 175, 200];

  for (const level of expectedLevels) {
    ui.setZoomLevel(level);
    assert.strictEqual(ui.zoomLevel, level, `Zoom level should be ${level}%`);
    assert.strictEqual(fixture.zoomProperties.get('--game-zoom'), String(level / 100), `Zoom property should be ${level / 100}`);
    assert.strictEqual(fixture.windowElement.dataset.zoom, String(level), `Dataset zoom should be ${level}`);
  }

  // Test that 200% disables zoom-in
  ui.setZoomLevel(200);
  assert.strictEqual(fixture.zoomInButton.disabled, true, 'Zoom in must be disabled at 200%');

  // Test that 75% disables zoom-out
  ui.setZoomLevel(75);
  assert.strictEqual(fixture.zoomOutButton.disabled, true, 'Zoom out must be disabled at 75%');

  // Test reset zoom to 100
  ui.setZoomLevel(150);
  ui.resetZoom();
  assert.strictEqual(ui.zoomLevel, 100);
});

test('UI - Touch action buttons keep one persistent accessible selection', async () => {
  const { UI } = await import('../src/UI.ts');
  const ui = createBareUI(UI);
  const fixture = createTouchActionFixture();
  ui.element = createPartialElements({ touchModeButtons: fixture.buttons });
  ui.touchMode = 'click';

  ui.updateTouchModeUI();
  assert.strictEqual(fixture.attributes.get('question')?.get('aria-pressed'), 'false');
  assert.strictEqual(fixture.attributes.get('flag')?.get('aria-pressed'), 'false');
  assert.strictEqual(fixture.attributes.get('click')?.get('aria-pressed'), 'true');

  ui.setTouchMode('flag');
  assert.strictEqual(ui.touchMode, 'flag');
  assert.strictEqual(fixture.attributes.get('flag')?.get('aria-pressed'), 'true');
  assert.strictEqual(fixture.attributes.get('click')?.get('aria-pressed'), 'false');

  ui.setTouchMode('question');
  assert.strictEqual(ui.touchMode, 'question');
  assert.strictEqual(fixture.attributes.get('question')?.get('aria-pressed'), 'true');
  assert.strictEqual(fixture.attributes.get('flag')?.get('aria-pressed'), 'false');
});

test('UI - getTouchActionSvg returns valid SVG icons for all modes', async () => {
  const { UI } = await import('../src/UI.ts');
  const ui = createBareUI(UI);
  const questionSvg = ui.getTouchActionSvg('question');
  const flagSvg = ui.getTouchActionSvg('flag');
  const clickSvg = ui.getTouchActionSvg('click');
  assert.ok(questionSvg.length > 0 && flagSvg.length > 0 && clickSvg.length > 0, 'All SVGs should be non-empty');
  assert.ok(questionSvg.includes('shape-rendering="crispEdges"'), 'Question SVG should have crispEdges');
  assert.ok(flagSvg.includes('shape-rendering="crispEdges"'), 'Flag SVG should have crispEdges');
  assert.ok(clickSvg.includes('shape-rendering="crispEdges"'), 'Click SVG should have crispEdges');
  assert.ok(questionSvg.includes('aria-hidden="true"') && questionSvg.includes('focusable="false"'), 'Question SVG should have accessibility attributes');
  assert.ok(flagSvg.includes('aria-hidden="true"') && flagSvg.includes('focusable="false"'), 'Flag SVG should have accessibility attributes');
  assert.ok(clickSvg.includes('aria-hidden="true"') && clickSvg.includes('focusable="false"'), 'Click SVG should have accessibility attributes');
  assert.notStrictEqual(questionSvg, flagSvg, 'SVGs should be distinct');
  assert.notStrictEqual(flagSvg, clickSvg, 'SVGs should be distinct');
  assert.notStrictEqual(questionSvg, clickSvg, 'SVGs should be distinct');

  // Question SVG: pixel-style question mark with rect geometry
  assert.ok(questionSvg.includes('<rect x="10" y="4" width="4" height="4" fill="black"'), 'Question SVG should have pixel question mark geometry');
  assert.ok(questionSvg.includes('<rect x="6" y="8" width="12" height="2" fill="black"'), 'Question SVG should have question mark bar');
  assert.ok(questionSvg.includes('<rect x="10" y="2" width="2" height="2" fill="black"'), 'Question SVG should have pixel dots');

  // Flag SVG: classic Minesweeper/Win95-style flag with red cloth, black staff
  assert.ok(flagSvg.includes('<rect x="9" y="2" width="2" height="20" fill="black"'), 'Flag SVG should have black staff');
  assert.ok(flagSvg.includes('<rect x="8" y="22" width="4" height="2" fill="black"'), 'Flag SVG should have black base');
  assert.ok(flagSvg.includes('<path d="M11 3 L19 7 L11 11 Z" fill="red"'), 'Flag SVG should have red cloth path');

  // Click SVG: pixel-style cursor/click icon with circular base
  assert.ok(clickSvg.includes('<path d="M12 2 L16 10 L20 10 L16 14 L18 18 L14 20 L12 22 L10 20 L6 18 L8 14 L4 10 L8 10 Z" fill="black"'), 'Click SVG should have pixel cursor path');
  assert.ok(clickSvg.includes('<circle cx="12" cy="14" r="3" fill="black"'), 'Click SVG should have circular base');
});

test('CSS - Touch action button has exact square dimensions and flex properties', async () => {
  const fs = await import('node:fs');
  const cssContent = fs.readFileSync(new URL('../src/styles.css', import.meta.url).pathname, 'utf8');
  const touchButtonRule = cssContent.match(/\.touch-action-button\s*\{([^}]+)\}/s);
  assert.ok(touchButtonRule, '.touch-action-button CSS rule should exist');
  const ruleContent = touchButtonRule[1];
  assert.ok(ruleContent.includes('width: 44px;'), 'Should have width: 44px');
  assert.ok(ruleContent.includes('height: 44px;'), 'Should have height: 44px');
  assert.ok(ruleContent.includes('flex: 0 0 auto;'), 'Should have flex: 0 0 auto');
  assert.ok(!ruleContent.includes('min-width: 60px'), 'Should NOT have min-width: 60px');
  assert.ok(!ruleContent.includes('min-height'), 'Should NOT have min-height');
  const svgFlexRule = cssContent.match(/\.touch-action-button svg\s*\{([^}]+)\}/s);
  assert.ok(svgFlexRule, '.touch-action-button svg CSS rule should exist');
  assert.ok(svgFlexRule[1].includes('flex: 0 0 auto;'), 'SVG child should have flex: 0 0 auto');
});

function makeFakeButton(): HTMLButtonElement {
  const attrs: Record<string, string> = {};
  const btn = {
    type: '',
    className: '',
    dataset: { touchMode: '' },
    innerHTML: '',
    textContent: '',
    clickListeners: [] as (() => void)[],
    setAttribute: (name: string, value: string) => { attrs[name] = value; },
    getAttribute: (name: string) => attrs[name] ?? null,
    hasAttribute: (name: string) => name in attrs,
    addEventListener: (event: string, listener: () => void) => {
      if (event === 'click') (btn as FakeButton).clickListeners.push(listener);
    },
    removeEventListener: () => {},
    dispatchEvent: () => true,
    append: () => {},
  } as unknown as HTMLButtonElement;
  return btn;
}

test('UI - createTouchActionButton creates an icon-only accessible button', async () => {
  const { UI } = await import('../src/UI.ts');
  const ui = createBareUI(UI);
  const originalDocument = global.document;

  try {
    for (const mode of ['question', 'flag', 'click'] as const) {
      const label = mode === 'question' ? 'Вопрос' : mode === 'flag' ? 'Флаг' : 'Клик';
      const expectedSvg = ui.getTouchActionSvg(mode);

      global.document = {
        createElement: (tagName: string) => {
          if (tagName === 'button') return makeFakeButton();
          return {
            className: '', dataset: {}, attributes: {}, style: {},
            setAttribute: () => {}, getAttribute: () => null, hasAttribute: () => false,
            append: () => {}, appendChild: () => {}, removeChild: () => {},
            addEventListener: () => {}, removeEventListener: () => {},
            querySelector: () => null, querySelectorAll: () => [],
          } as unknown as HTMLElement;
        },
      } as unknown as Document;

      const button = ui.createTouchActionButton(mode, label) as FakeButton;

      assert.strictEqual(button.getAttribute('title'), `${label}: действие при касании`, `Title exact for ${mode}`);
      assert.strictEqual(button.type, 'button', `type for ${mode}`);
      assert.strictEqual(button.className, 'touch-action-button', `className for ${mode}`);
      assert.strictEqual(button.dataset.touchMode, mode, `dataset for ${mode}`);
      assert.strictEqual(button.getAttribute('aria-label'), `${label}: действие при касании`, `aria-label for ${mode}`);
      assert.strictEqual(button.getAttribute('aria-pressed'), 'false', `aria-pressed for ${mode}`);
      assert.strictEqual(button.innerHTML, expectedSvg, `innerHTML exact for ${mode}`);
      assert.strictEqual(button.textContent, '', `textContent for ${mode}`);

      const clickMode: { mode: string | null } = { mode: null };
      ui.handleTouchModeClick = (m: string) => { clickMode.mode = m; };

      assert.strictEqual(button.clickListeners.length, 1, `Exactly one click listener for ${mode}`);
      button.clickListeners[0]();
      assert.strictEqual(clickMode.mode, mode, `Correct mode dispatched for ${mode}`);
    }
  } finally {
    global.document = originalDocument;
  }
});

test('UI - Touch marker actions repeat, replace, and persist through the game model', async () => {
  const { UI } = await import('../src/UI.ts');
  const game = createDeterministicGame(9, 9, 10, []);
  const ui = createBareUI(UI);
  const domCell = {} as HTMLButtonElement;
  ui.game = game;
  ui.element = createPartialElements({ cells: new Map([['2,2', domCell]]) });
  ui.updateCell = () => {};
  ui.updateCounters = () => {};
  ui.touchMode = 'flag';

  ui.handleTouchAction(2, 2);
  assert.strictEqual(game.board[2][2].state, CELL_STATE.FLAGGED);
  assert.strictEqual(game.flags, 1);

  ui.handleTouchAction(2, 2);
  assert.strictEqual(game.board[2][2].state, CELL_STATE.CLOSED);
  assert.strictEqual(game.flags, 0);

  ui.touchMode = 'question';
  ui.handleTouchAction(2, 2);
  assert.strictEqual(game.board[2][2].state, CELL_STATE.QUESTIONED);
  assert.strictEqual(game.flags, 0);

  ui.touchMode = 'flag';
  ui.handleTouchAction(2, 2);
  assert.strictEqual(game.board[2][2].state, CELL_STATE.FLAGGED);
  assert.strictEqual(game.flags, 1);
  assert.strictEqual(ui.touchMode, 'flag', 'Selected action remains active after taps');
});

test('UI - Touch click reveals, while a revealed number chords in every mode', async () => {
  const { UI } = await import('../src/UI.ts');
  const game = createDeterministicGame(9, 9, 10, []);
  const ui = createBareUI(UI);
  ui.game = game;
  ui.element = createPartialElements({ cells: new Map() });
  ui.updateBoard = () => {};
  ui.updateAllCells = () => {};
  ui.updateCounters = () => {};
  ui.updateGameStateUI = () => {};

  ui.touchMode = 'click';
  ui.handleTouchAction(2, 2);
  assert.strictEqual(game.board[2][2].state, CELL_STATE.REVEALED);

  game.board[4][4].state = CELL_STATE.REVEALED;
  game.board[4][4].neighbors = 2;
  let chordCalls = 0;
  ui.handleCellChord = (x, y) => {
    assert.deepStrictEqual({ x, y }, { x: 4, y: 4 });
    chordCalls++;
  };
  ui.handleCellReveal = () => assert.fail('Revealed number must not route to reveal');
  ui.handleTouchCellFlag = () => assert.fail('Revealed number must not call touch flag handler');
  ui.handleTouchCellQuestion = () => assert.fail('Revealed number must not call touch question handler');

  for (const mode of ['question', 'flag', 'click'] as const) {
    ui.touchMode = mode;
    ui.handleTouchAction(4, 4);
  }
  assert.strictEqual(chordCalls, 3, 'Every touch mode must chord a revealed number');
});

test('UI - Touch move and cancel discard the gesture without an action or long press', async () => {
  const { UI } = await import('../src/UI.ts');
  const ui = createBareUI(UI);
  const game = createDeterministicGame(9, 9, 10, []);
  const cell = createTouchCell(2, 2);
  const start = createTouchEvent(cell, 1);
  const end = createTouchEvent(cell);
  let actionCalls = 0;
  ui.game = game;
  ui.element = createPartialElements({ cells: new Map() });
  ui.touchMode = 'click';
  ui.touchGestureCell = null;
  ui.handleTouchAction = () => { actionCalls++; };
  ui.clearBoardPressing = () => {};

  ui.handleTouchStart(start.event);
  assert.strictEqual(start.wasPrevented(), true);
  ui.handleTouchMove(createTouchEvent(cell, 1).event);
  ui.handleTouchEnd(end.event);
  assert.strictEqual(actionCalls, 0, 'Moving must cancel the tap action');

  ui.handleTouchStart(createTouchEvent(cell, 1).event);
  ui.handleTouchCancel(createTouchEvent(cell).event);
  ui.handleTouchEnd(end.event);
  assert.strictEqual(actionCalls, 0, 'Cancellation must cancel the tap action');

  const touchStartSource = UI.prototype.handleTouchStart.toString();
  assert.doesNotMatch(touchStartSource, /setTimeout|longPress|500/);
});

test('UI - Touch actions do nothing while paused', async () => {
  const { UI } = await import('../src/UI.ts');
  const game = createDeterministicGame(9, 9, 10, []);
  const ui = createBareUI(UI);
  ui.game = game;
  ui.element = createPartialElements({ cells: new Map() });
  ui.updateBoard = () => {};
  ui.updateAllCells = () => {};
  ui.updateCounters = () => {};
  ui.updateGameStateUI = () => {};
  assert.strictEqual(game.pause(), true);

  for (const mode of ['question', 'flag', 'click'] as const) {
    ui.touchMode = mode;
    ui.handleTouchAction(2, 2);
    assert.strictEqual(game.board[2][2].state, CELL_STATE.CLOSED);
    assert.strictEqual(game.flags, 0);
  }
});

test('UI - Mouse right-click uses cycleFlag to cycle CLOSED -> FLAGGED -> QUESTIONED -> CLOSED', async () => {
  const { UI } = await import('../src/UI.ts');
  const game = createDeterministicGame(9, 9, 10, []);
  const ui = createBareUI(UI);
  const domCell = {} as HTMLButtonElement;
  ui.game = game;
  ui.element = createPartialElements({ cells: new Map([['2,2', domCell]]) });
  let counterCalls = 0;
  ui.updateCell = () => {};
  ui.updateCounters = () => { counterCalls++; };
  // Start with CLOSED cell
  assert.strictEqual(game.board[2][2].state, CELL_STATE.CLOSED);
  assert.strictEqual(game.flags, 0);

  // First right-click: CLOSED -> FLAGGED (increment flag count)
  ui.handleCellFlag(2, 2);
  assert.strictEqual(game.board[2][2].state, CELL_STATE.FLAGGED);
  assert.strictEqual(game.flags, 1);
  assert.strictEqual(counterCalls, 1, 'updateCounters called for CLOSED->FLAGGED');

  // Second right-click: FLAGGED -> QUESTIONED (decrement flag count)
  ui.handleCellFlag(2, 2);
  assert.strictEqual(game.board[2][2].state, CELL_STATE.QUESTIONED);
  assert.strictEqual(game.flags, 0, 'Flag count decremented when FLAGGED->QUESTIONED');
  assert.strictEqual(counterCalls, 2, 'updateCounters called for FLAGGED->QUESTIONED');

  // Third right-click: QUESTIONED -> CLOSED (no counter change)
  ui.handleCellFlag(2, 2);
  assert.strictEqual(game.board[2][2].state, CELL_STATE.CLOSED);
  assert.strictEqual(game.flags, 0, 'Flag count unchanged when QUESTIONED->CLOSED');
  assert.strictEqual(counterCalls, 3, 'updateCounters still called (flagsChanged=true from cycleFlag)');
});

test('UI - Touch Flag replacing a question sets flag (increments counter), replacing flag toggles off', async () => {
  const { UI } = await import('../src/UI.ts');
  const game = createDeterministicGame(9, 9, 10, []);
  const ui = createBareUI(UI);
  const domCell = {} as HTMLButtonElement;
  ui.game = game;
  ui.element = createPartialElements({ cells: new Map([['2,2', domCell]]) });
  let counterCalls = 0;
  ui.updateCell = () => {};
  ui.updateCounters = () => { counterCalls++; };
  ui.touchMode = 'flag';

  // Set cell to FLAGGED first via touch (CLOSED -> FLAGGED, increment)
  ui.handleTouchAction(2, 2);
  assert.strictEqual(game.board[2][2].state, CELL_STATE.FLAGGED);
  assert.strictEqual(game.flags, 1);
  assert.strictEqual(counterCalls, 1, 'updateCounters called for CLOSED->FLAGGED');

  // Touch Flag again: FLAGGED -> CLOSED (decrement - toggles off)
  ui.handleTouchAction(2, 2);
  assert.strictEqual(game.board[2][2].state, CELL_STATE.CLOSED);
  assert.strictEqual(game.flags, 0);
  assert.strictEqual(counterCalls, 2, 'updateCounters called for FLAGGED->CLOSED');

  // Now set cell to QUESTIONED via touch (CLOSED -> QUESTIONED, no flag count change)
  ui.touchMode = 'question';
  ui.handleTouchAction(2, 2);
  assert.strictEqual(game.board[2][2].state, CELL_STATE.QUESTIONED);
  assert.strictEqual(game.flags, 0);
  assert.strictEqual(counterCalls, 2, 'updateCounters NOT called for CLOSED->QUESTIONED (no flagCountChanged)');

  // Touch Flag: QUESTIONED -> FLAGGED (increment flag count)
  ui.touchMode = 'flag';
  ui.handleTouchAction(2, 2);
  assert.strictEqual(game.board[2][2].state, CELL_STATE.FLAGGED);
  assert.strictEqual(game.flags, 1, 'Flag count incremented when QUESTIONED->FLAGGED');
  assert.strictEqual(counterCalls, 3, 'updateCounters called for QUESTIONED->FLAGGED');
});

test('UI - Touch Question toggles off when applied twice, FLAGGED -> QUESTIONED decrements counter', async () => {
  const { UI } = await import('../src/UI.ts');
  const game = createDeterministicGame(9, 9, 10, []);
  const ui = createBareUI(UI);
  const domCell = {} as HTMLButtonElement;
  ui.game = game;
  ui.element = createPartialElements({ cells: new Map([['2,2', domCell]]) });
  let counterCalls = 0;
  ui.updateCell = () => {};
  ui.updateCounters = () => { counterCalls++; };
  ui.touchMode = 'question';

  // Set cell to QUESTIONED first via touch (CLOSED -> QUESTIONED, no flagCountChanged)
  ui.handleTouchAction(2, 2);
  assert.strictEqual(game.board[2][2].state, CELL_STATE.QUESTIONED);
  assert.strictEqual(game.flags, 0);
  assert.strictEqual(counterCalls, 0, 'updateCounters NOT called for CLOSED->QUESTIONED');

  // Touch Question again: QUESTIONED -> CLOSED (no flag count change)
  ui.handleTouchAction(2, 2);
  assert.strictEqual(game.board[2][2].state, CELL_STATE.CLOSED);
  assert.strictEqual(game.flags, 0);
  assert.strictEqual(counterCalls, 0, 'updateCounters NOT called for QUESTIONED->CLOSED');

  // Now set cell to FLAGGED via touch (CLOSED -> FLAGGED, increment)
  ui.touchMode = 'flag';
  ui.handleTouchAction(2, 2);
  assert.strictEqual(game.board[2][2].state, CELL_STATE.FLAGGED);
  assert.strictEqual(game.flags, 1);

  // Touch Question: FLAGGED -> QUESTIONED (decrements flag count)
  ui.touchMode = 'question';
  ui.handleTouchAction(2, 2);
  assert.strictEqual(game.board[2][2].state, CELL_STATE.QUESTIONED);
  assert.strictEqual(game.flags, 0, 'Flag count decremented when FLAGGED->QUESTIONED');
  assert.strictEqual(counterCalls, 2, 'updateCounters called for FLAGGED->QUESTIONED (total: CLOSED->FLAGGED + FLAGGED->QUESTIONED)');
});

test('UI - Touch gesture cleanup is robust on paused/no-cell paths', async () => {
  const { UI } = await import('../src/UI.ts');
  const game = createDeterministicGame(9, 9, 10, []);
  const ui = createBareUI(UI);
  const cell = createTouchCell(2, 2);
  const start = createTouchEvent(cell, 1);
  const end = createTouchEvent(cell);
  let actionCalls = 0;
  ui.game = game;
  ui.element = createPartialElements({ cells: new Map() });
  ui.touchMode = 'click';
  ui.handleTouchAction = () => { actionCalls++; };
  ui.clearBoardPressing = () => {};

  // Test 1: touchmove clears gesture
  ui.handleTouchStart(start.event);
  assert.ok(ui.touchGestureCell, 'Gesture cell should be set after touchstart');
  ui.handleTouchMove(createTouchEvent(cell, 1).event);
  assert.strictEqual(ui.touchGestureCell, null, 'Gesture cell should be cleared after touchmove');
  ui.handleTouchEnd(end.event);
  assert.strictEqual(actionCalls, 0, 'No action should be called after touchmove');

  // Test 2: touchcancel clears gesture
  ui.handleTouchStart(start.event);
  assert.ok(ui.touchGestureCell, 'Gesture cell should be set after touchstart');
  ui.handleTouchCancel(createTouchEvent(cell).event);
  assert.strictEqual(ui.touchGestureCell, null, 'Gesture cell should be cleared after touchcancel');
  ui.handleTouchEnd(end.event);
  assert.strictEqual(actionCalls, 0, 'No action should be called after touchcancel');

  // Test 3: touchend on different cell does not execute action
  ui.handleTouchStart(start.event);
  const differentCell = createTouchCell(3, 3);
  ui.handleTouchEnd(createTouchEvent(differentCell).event);
  assert.strictEqual(actionCalls, 0, 'No action should be called for different cell');

  // Test 4: touchend on no-cell clears gesture even on paused path
  assert.strictEqual(game.pause(), true);
  ui.handleTouchStart(start.event);
  assert.ok(ui.touchGestureCell, 'Gesture cell should be set before touchend');
  ui.handleTouchEnd(end.event);
  assert.strictEqual(ui.touchGestureCell, null, 'Gesture cell should be cleared even on paused path');
});

test('UI - resetGame calls updateCounters (regression)', async () => {
  const { UI } = await import('../src/UI.ts');

  // Create minimal UI prototype instance without DOM
  const ui = createBareUI(UI);
  attachPauseControls(ui, createPauseControlFixture());

  // Use the real game API and spy only on the reset boundary.
  const game = new Minesweeper({ width: 9, height: 9, mines: 10 });
  game.timer = 5;
  game.flags = 2;
  game.revealedCount = 5;
  const originalReset = game.reset.bind(game);
  let resetCallCount = 0;
  game.reset = () => {
    resetCallCount += 1;
    originalReset();
  };

  // Spy methods
  let updateAllCellsCalled = false;
  let updateCountersCalled = false;
  let setFaceStateCalled = false;
  let setFaceStateArg: Parameters<UIInstance['setFaceState']>[0] | null = null;
  ui.updateAllCells = () => { updateAllCellsCalled = true; };
  ui.updateCounters = () => { updateCountersCalled = true; };
  ui.setFaceState = (state) => {
    setFaceStateCalled = true;
    setFaceStateArg = state;
  };

  // Inject mock game
  ui.game = game;

  // Call resetGame
  ui.resetGame();

  // Verify all expected calls
  assert.strictEqual(resetCallCount, 1, 'game.reset was called exactly once');
  assert.strictEqual(updateAllCellsCalled, true, 'updateAllCells was called');
  assert.strictEqual(updateCountersCalled, true, 'updateCounters was called');
  assert.strictEqual(setFaceStateCalled, true, 'setFaceState was called');
  assert.strictEqual(setFaceStateArg, 'normal', 'setFaceState called with normal');
});

test('UI - Single-click chord preview (mousedown on revealed digit)', async () => {
  const { UI } = await import('../src/UI.ts');
  const { Minesweeper, CELL_STATE, STATE } = await import('../src/Game.ts');

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
  const closedNeighbor = neighbors.find(n => n.x === 3 && n.y === 3);
  if (closedNeighbor) closedNeighbor.state = CELL_STATE.CLOSED;
  // neighbor at (3,4) - FLAGGED (should NOT get pressing)
  const flaggedNeighbor = neighbors.find(n => n.x === 3 && n.y === 4);
  if (flaggedNeighbor) flaggedNeighbor.state = CELL_STATE.FLAGGED;
  // neighbor at (3,5) - QUESTIONED
  const questionedNeighbor = neighbors.find(n => n.x === 3 && n.y === 5);
  if (questionedNeighbor) questionedNeighbor.state = CELL_STATE.QUESTIONED;
  // neighbor at (4,3) - REVEALED (already revealed, should NOT get pressing)
  const revealedNeighbor = neighbors.find(n => n.x === 4 && n.y === 3);
  if (revealedNeighbor) revealedNeighbor.state = CELL_STATE.REVEALED;

  // Create minimal UI without DOM for testing highlightChordNeighbors
  const ui = createBareUI(UI);
  ui.game = game;
  ui.element = createPartialElements({ cells: new Map() });

  // Mock DOM cells for neighbors with tracked classList operations
  const neighborsMap = new Map<string, {
    added: Set<string>;
    removed: Set<string>;
    state: CellState;
  }>();
  for (const neighbor of neighbors) {
    const tracked = createTrackedButton();
    ui.element.cells.set(`${neighbor.x},${neighbor.y}`, tracked.element);
    neighborsMap.set(`${neighbor.x},${neighbor.y}`, {
      added: tracked.added,
      removed: tracked.removed,
      state: neighbor.state
    });
  }

  // Call highlightChordNeighbors (should add 'pressing' to CLOSED and QUESTIONED only)
  ui.highlightChordNeighbors(4, 4);

  // Verify which cells got 'pressing' class added
  for (const [key, data] of neighborsMap.entries()) {
    if (data.state === CELL_STATE.CLOSED || data.state === CELL_STATE.QUESTIONED) {
      assert.ok(data.added.has('pressing'), `CLOSED/QUESTIONED cell ${key} should get pressing`);
    } else if (data.state === CELL_STATE.FLAGGED || data.state === CELL_STATE.REVEALED) {
      assert.ok(!data.added.has('pressing'), `FLAGGED/REVEALED cell ${key} should NOT get pressing`);
    }
  }

  // Clear pressing
  ui.clearBoardPressing();

  // Verify pressing removed for all
  for (const [key, data] of neighborsMap.entries()) {
    assert.ok(data.removed.has('pressing'), `Cell ${key} should have pressing removed`);
  }

  game.stopTimer();
});

test('UI - Face SVG for terminal states', async () => {
  const { UI } = await import('../src/UI.ts');

  // Create minimal UI prototype instance without DOM
  const ui = createBareUI(UI);

  // Get SVG icons for won and dead states
  const wonSvg = ui.getFaceSvg('won');
  const deadSvg = ui.getFaceSvg('dead');

  // Won state should contain pixel art sunglasses (angled stepped lenses) and smile
  assert.ok(wonSvg.includes('viewBox="0 0 24 24"'),
    'Won face should have viewBox="0 0 24 24"');
  assert.ok(wonSvg.includes('fill="gold"'),
    'Won face should have gold fill');
  assert.ok(wonSvg.includes('stroke="black"'),
    'Won face should have black outline');
  assert.ok(wonSvg.includes('fill="black"'),
    'Won face should have black lenses');
  assert.ok(wonSvg.includes('M4 7H10V10L9 12H6L5 10H4Z'),
    'Won face should have left angled lens');
  assert.ok(wonSvg.includes('M14 7H20V10L19 12H16L15 10H14Z'),
    'Won face should have right angled lens');
  assert.ok(wonSvg.includes('M10 8H14V9H10Z'),
    'Won face should have bridge');
  assert.ok(wonSvg.includes('M3 7H4V8H3Z'),
    'Won face should have left temple');
  assert.ok(wonSvg.includes('M20 7H21V8H20Z'),
    'Won face should have right temple');
  assert.ok(wonSvg.includes('M7 16H8V17H10V18H14V17H16V16H17V18H16V19H14V20H10V19H8V18H7Z'),
    'Won face should have pixel smile');

  // Dead state should contain X-eyes (two diagonal lines per eye)
  assert.ok(deadSvg.includes('stroke="black"'),
    'Dead face should have X-eyes (black stroke)');
});

test('UI - closeAllMenus closes dropdown without focus reopening', async () => {
  const { UI } = await import('../src/UI.ts');

  // Create minimal UI prototype instance without DOM
  const ui = createBareUI(UI);

  // Mock dropdown elements
  const gameMenu = createMenuTracker(true);
  const helpMenu = createMenuTracker(true);
  ui.element = createPartialElements({
    menuDropdowns: { game: gameMenu.element, help: helpMenu.element }
  });

  // Call closeAllMenus
  ui.closeAllMenus();

  // Verify dropdowns are closed
  assert.strictEqual(gameMenu.isShown(), false, 'Game menu dropdown should be closed');
  assert.strictEqual(helpMenu.isShown(), false, 'Help menu dropdown should be closed');

  // Verify styles were cleared
  assert.strictEqual(gameMenu.element.style.position, '', 'Game menu position should be empty');
  assert.strictEqual(gameMenu.element.style.left, '', 'Game menu left should be empty');
  assert.strictEqual(gameMenu.element.style.top, '', 'Game menu top should be empty');
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
  // Updated: removed ::after for wrong-flag (now unified sprite in ::before only)
  const iconSelectorBlockPattern = /\.cell\.mine::before,\s*\.cell\.flagged::before,\s*\.cell\.flagged\.wrong-flag::before,\s*\.cell\.wrong-flag:not\(\.flagged\)::before,\s*\.cell\.questioned::before\s*\{([^}]+)\}/s;
  const iconBlockMatch = cssContent.match(iconSelectorBlockPattern);
  assert.ok(iconBlockMatch, 'Combined icon pseudo-element selector block should exist');
  assert.ok(iconBlockMatch[1].includes('flex: 0 0 auto;'), 'Combined block should have flex: 0 0 auto');
});

test('CSS - Pause overlay is opaque in both themes and enlarged for coarse pointers', async () => {
  const fs = await import('node:fs');
  const cssContent = fs.readFileSync(new URL('../src/styles.css', import.meta.url).pathname, 'utf8');

  assert.match(cssContent, /:root\s*\{[^}]*--pause-overlay-bg:\s*#c0c0c0;/s);
  assert.match(cssContent, /:root\.dark-theme\s*\{[^}]*--pause-overlay-bg:\s*#333333;/s);

  const overlayRule = cssContent.match(/\.pause-overlay\s*\{([^}]+)\}/s);
  assert.ok(overlayRule, 'Pause overlay rule should exist');
  assert.ok(overlayRule[1].includes('position: absolute;'));
  assert.ok(overlayRule[1].includes('inset: 0;'));
  assert.ok(overlayRule[1].includes('background-color: var(--pause-overlay-bg);'));
  assert.ok(overlayRule[1].includes('pointer-events: auto;'));

  const coarseRule = cssContent.match(/@media\s+\(pointer:\s*coarse\)[\s\S]*?\.pause-overlay\s*\{([^}]+)\}/);
  assert.ok(coarseRule, 'Coarse-pointer pause overlay rule should exist');
  assert.ok(coarseRule[1].includes('font-size: 16px;'));
});

test('CSS - Game zoom participates in layout and keeps overflowing content reachable', async () => {
  const fs = await import('node:fs');
  const cssContent = fs.readFileSync(new URL('../src/styles.css', import.meta.url).pathname, 'utf8');

  const bodyRule = cssContent.match(/body\s*\{([^}]+)\}/s);
  assert.ok(bodyRule, 'Body rule should exist');
  assert.ok(bodyRule[1].includes('justify-content: safe center;'));

  const windowRule = cssContent.match(/\.window\s*\{([^}]+)\}/s);
  assert.ok(windowRule, 'Window rule should exist');
  assert.ok(windowRule[1].includes('--game-zoom: 1;'));
  assert.ok(windowRule[1].includes('zoom: var(--game-zoom);'));
  assert.ok(!windowRule[1].includes('transform:'), 'Layout zoom must not use a visual-only transform');

  const controlRule = cssContent.match(/\.window-control\s*\{([^}]+)\}/s);
  assert.ok(controlRule, 'Accessible window control button rule should exist');
  assert.ok(controlRule[1].includes('cursor: pointer;'));
  assert.match(cssContent, /\.window-control:disabled\s*\{[^}]*cursor:\s*not-allowed;/s);
});

test('CSS - Touch action panel is coarse-pointer only and uses accessible Win95 buttons', async () => {
  const fs = await import('node:fs');
  const cssContent = fs.readFileSync(new URL('../src/styles.css', import.meta.url).pathname, 'utf8');

  const panelRule = cssContent.match(/\.touch-controls\s*\{([^}]+)\}/s);
  assert.ok(panelRule, 'Touch action panel rule should exist');
  assert.ok(panelRule[1].includes('display: none;'));

  const coarsePanelRule = cssContent.match(/@media\s+\(pointer:\s*coarse\)\s*\{\s*\.touch-controls\s*\{([^}]+)\}/);
  assert.ok(coarsePanelRule, 'Coarse-pointer touch action panel rule should exist');
  assert.match(coarsePanelRule[1], /display:\s*(flex|grid);/);

  const buttonRule = cssContent.match(/\.touch-action-button\s*\{([^}]+)\}/s);
  assert.ok(buttonRule, 'Touch action button rule should exist');
  assert.ok(buttonRule[1].includes('cursor: pointer;'));
  assert.match(cssContent, /\.touch-action-button\[aria-pressed="true"\]\s*\{/);
  assert.doesNotMatch(cssContent, /\.touch-status\s*\{/);
  assert.doesNotMatch(cssContent, /\.touch-mode-toggle\s*\{/);
});

// === MENU REGRESSION TESTS ===

test('UI - handleMenuClick method exists and is a function', async () => {
  const { UI } = await import('../src/UI.ts');

  // Check that handleMenuClick exists and is a function
  assert.ok(UI.prototype.handleMenuClick, 'handleMenuClick should exist on UI prototype');
  assert.strictEqual(typeof UI.prototype.handleMenuClick, 'function', 'handleMenuClick should be a function');
});

test('UI - handleDropdownClick method exists and is a function', async () => {
  const { UI } = await import('../src/UI.ts');

  // Check that handleDropdownClick exists and is a function
  assert.ok(UI.prototype.handleDropdownClick, 'handleDropdownClick should exist on UI prototype');
  assert.strictEqual(typeof UI.prototype.handleDropdownClick, 'function', 'handleDropdownClick should be a function');
});

test('UI - handleMenuClick opens dropdown and closes others without focus', async () => {
  const { UI } = await import('../src/UI.ts');

  // Create minimal UI prototype instance without DOM
  const ui = createBareUI(UI);

  // Mock menu items and dropdowns
  const menuGame = createMenuTracker();
  const menuHelp = createMenuTracker();

  ui.element = createPartialElements({
    menuItems: new Map([
      ['menu-game-dropdown', menuGame.element],
      ['menu-help-dropdown', menuHelp.element]
    ]),
    menuDropdowns: { game: menuGame.element, help: menuHelp.element }
  });

  // Spy closeAllMenus
  let closeAllMenusCalled = false;
  ui.closeAllMenus = () => { closeAllMenusCalled = true; };

  // Mock item with getBoundingClientRect and closest method
  const mockItem = createMenuItem({ menuId: 'menu-game-dropdown', left: 100, bottom: 50 });

  // Mock event
  const mockEvent = createMouseEvent(mockItem);

  // Call handleMenuClick
  ui.handleMenuClick(mockEvent);

  // Verify closeAllMenus was called
  assert.strictEqual(closeAllMenusCalled, true, 'closeAllMenus should be called');

  // Verify dropdown was opened with correct position
  assert.ok(menuGame.isShown(), 'Game menu should have show class added');
  assert.strictEqual(menuGame.element.style.position, 'fixed', 'Dropdown should have fixed position');
  assert.strictEqual(menuGame.element.style.left, '100px', 'Dropdown should have correct left position');
  assert.strictEqual(menuGame.element.style.top, '52px', 'Dropdown should have correct top position (bottom + 2)');

  // Verify help menu was closed
  assert.strictEqual(menuHelp.isShown(), false, 'Help menu should be closed');
});

test('UI - handleMenuClick toggles already open menu closed', async () => {
  const { UI } = await import('../src/UI.ts');

  // Create minimal UI prototype instance without DOM
  const ui = createBareUI(UI);

  // Mock menu items with classList.contains spy
  const menuGame = createMenuTracker(true);

  ui.element = createPartialElements({
    menuItems: new Map([
      ['menu-game-dropdown', menuGame.element]
    ]),
    menuDropdowns: { game: menuGame.element }
  });

  // Spy closeAllMenus
  let closeAllMenusCalled = false;
  ui.closeAllMenus = () => { closeAllMenusCalled = true; };

  // Mock item with closest method
  const mockItem = createMenuItem({ menuId: 'menu-game-dropdown', left: 100, bottom: 50 });

  const mockEvent = createMouseEvent(mockItem);

  // Call handleMenuClick on already open menu
  ui.handleMenuClick(mockEvent);

  // Verify menu is now closed
  assert.strictEqual(menuGame.isShown(), false, 'Already open menu should be closed on second click');
});

test('UI - handleDropdownClick new action resets game', async () => {
  const { UI } = await import('../src/UI.ts');

  const ui = createBareUI(UI);

  // Mock methods
  let resetGameCalled = false;
  let closeAllMenusCalled = false;

  ui.resetGame = () => { resetGameCalled = true; };
  ui.closeAllMenus = () => { closeAllMenusCalled = true; };

  // Mock item for 'new' action
  const mockItem = createMenuItem({ action: 'new' });

  const mockEvent = createMouseEvent(mockItem);

  // Call handleDropdownClick
  ui.handleDropdownClick(mockEvent);

  // Verify closeAllMenus called first
  assert.strictEqual(closeAllMenusCalled, true, 'closeAllMenus should be called first');

  // Verify resetGame was called
  assert.strictEqual(resetGameCalled, true, 'resetGame should be called for new action');
});

test('UI - handleDropdownClick difficulty action sets difficulty', async () => {
  const { UI } = await import('../src/UI.ts');

  const ui = createBareUI(UI);

  // Mock methods with spies
  let closeAllMenusCalled = false;
  let setDifficultyCalled = false;
  let setDifficultyValue: string | null = null;
  let updateCheckmarksCalled = false;
  let updateCheckmarksValue: string | null = null;

  ui.closeAllMenus = () => { closeAllMenusCalled = true; };
  ui.setDifficulty = (value) => { setDifficultyCalled = true; setDifficultyValue = value; };
  ui.updateDifficultyCheckmarks = (value) => { updateCheckmarksCalled = true; updateCheckmarksValue = value; };

  // Mock item for 'difficulty' action with 'intermediate' value
  const mockItem = createMenuItem({ action: 'difficulty', value: 'intermediate' });

  const mockEvent = createMouseEvent(mockItem);

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
  const { UI } = await import('../src/UI.ts');

  const ui = createBareUI(UI);

  // Mock methods with spies
  let closeAllMenusCalled = false;
  let openCustomDialogCalled = false;

  ui.closeAllMenus = () => { closeAllMenusCalled = true; };
  ui.openCustomDialog = () => { openCustomDialogCalled = true; };

  // Mock item for 'custom' action
  const mockItem = createMenuItem({ action: 'custom', value: 'custom' });

  const mockEvent = createMouseEvent(mockItem);

  // Call handleDropdownClick
  ui.handleDropdownClick(mockEvent);

  // Verify closeAllMenus called first
  assert.strictEqual(closeAllMenusCalled, true, 'closeAllMenus should be called first');

  // Verify openCustomDialog was called
  assert.strictEqual(openCustomDialogCalled, true, 'openCustomDialog should be called for custom action');
});

// === TRI-STATE THEME INTEGRATION TESTS ===

// ThemeMenuDependency for UI - minimal interface for theme menu behavior
type ThemeMenuDependency = Pick<ThemeController, 'cycle' | 'getMenuLabel'>;

// Structural fake that satisfies ThemeMenuDependency without as any
function createThemeMenuFake(): ThemeMenuDependency {
  let preference = 'system';
  const labels: Record<string, string> = {
    'system': 'Тема: система',
    'light': 'Тема: светлая',
    'dark': 'Тема: тёмная'
  };
  return {
    cycle() {
      preference = preference === 'system' ? 'light' : preference === 'light' ? 'dark' : 'system';
    },
    getMenuLabel() {
      return labels[preference];
    }
  };
}

// Test: createMenuDropdowns sets initial label from controller (not hardcoded)
test('UI - tri-state theme action: createMenuDropdowns reads initial label from controller', async () => {
  const { UI } = await import('../src/UI.ts');

  const ui = createBareUI(UI);
  const fake = createThemeMenuFake();
  ui.themeController = fake;

  // Mock just the themeMenuItem element
  const mockItem = { textContent: '', classList: { add: () => {}, remove: () => {}, contains: () => false } } as unknown as HTMLDivElement;
  ui.element = createPartialElements({ themeMenuItem: mockItem }) as UIInstance['element'];

  // Call updateThemeMenuItemLabel which is what createMenuDropdowns invokes
  ui.updateThemeMenuItemLabel();

  // Verify label set from controller (not hardcoded)
  assert.ok(ui.element.themeMenuItem);
  assert.strictEqual(ui.element.themeMenuItem.textContent, 'Тема: система', 'initial label from getMenuLabel()');
});

// Test: handleDropdownClick calls cycle once and updates label
test('UI - tri-state theme action: handleDropdownClick calls cycle once and refreshes label', async () => {
  const { UI } = await import('../src/UI.ts');

  const ui = createBareUI(UI);
  const fake = createThemeMenuFake();
  ui.themeController = fake;

  let cycleCount = 0;
  const originalCycle = fake.cycle;
  fake.cycle = () => { cycleCount++; originalCycle.call(fake); };

  const mockItem = { textContent: '', classList: { add: () => {}, remove: () => {}, contains: () => false } } as unknown as HTMLDivElement;
  ui.element = createPartialElements({ themeMenuItem: mockItem }) as UIInstance['element'];
  assert.ok(ui.element.themeMenuItem);

  ui.element.themeMenuItem.textContent = fake.getMenuLabel();
  assert.strictEqual(ui.element.themeMenuItem.textContent, 'Тема: система');

  ui.handleDropdownClick(createMouseEvent({ dataset: { action: 'theme' }, closest: () => ({ dataset: { action: 'theme' } }) } as unknown as HTMLDivElement));

  assert.strictEqual(cycleCount, 1, 'cycle called exactly once');
  assert.strictEqual(ui.element.themeMenuItem!.textContent, 'Тема: светлая', 'label refreshed after cycle');
});

// Test: closeAllMenus called before cycle
test('UI - tri-state theme action: closeAllMenus order trace', async () => {
  const { UI } = await import('../src/UI.ts');

  const ui = createBareUI(UI);
  const fake = createThemeMenuFake();
  ui.themeController = fake;

  const order: string[] = [];
  ui.closeAllMenus = () => order.push('close');
  fake.cycle = () => order.push('cycle');

  ui.element = createPartialElements({ themeMenuItem: { textContent: '', classList: { add: () => {}, remove: () => {}, contains: () => false } } as unknown as HTMLDivElement }) as UIInstance['element'];

  ui.handleDropdownClick(createMouseEvent({ dataset: { action: 'theme' }, closest: () => ({ dataset: { action: 'theme' } }) } as unknown as HTMLDivElement));

  assert.deepStrictEqual(order, ['close', 'cycle'], 'closeAllMenus before cycle');
});

// Test: checked state irrelevant
test('UI - tri-state theme action: checked state irrelevant', async () => {
  const { UI } = await import('../src/UI.ts');

  const ui = createBareUI(UI);
  const fake = createThemeMenuFake();
  ui.themeController = fake;

  let cycleCount = 0;
  fake.cycle = () => { cycleCount++; };

  ui.element = createPartialElements({ themeMenuItem: { textContent: '', classList: { add: () => {}, remove: () => {}, contains: () => false } } as unknown as HTMLDivElement }) as UIInstance['element'];

  for (const checked of [true, false, undefined] as const) {
    const item = createMenuItem({ action: 'theme', checked });
    ui.handleDropdownClick(createMouseEvent(item));
  }
  assert.strictEqual(cycleCount, 3, 'cycle called regardless of checked state');
});

// Test: old methods removed
test('UI - tri-state theme action: old methods removed', async () => {
  const { UI } = await import('../src/UI.ts');

  assert.strictEqual('toggleTheme' in UI.prototype, false, 'toggleTheme removed');
  assert.strictEqual('applyTheme' in UI.prototype, false, 'applyTheme removed');
});

test('UI - handleDropdownClick controls action opens dialog', async () => {
  const { UI } = await import('../src/UI.ts');

  const ui = createBareUI(UI);

  // Mock methods with spies
  let closeAllMenusCalled = false;
  let openControlsDialogCalled = false;

  ui.closeAllMenus = () => { closeAllMenusCalled = true; };
  ui.openControlsDialog = () => { openControlsDialogCalled = true; };

  // Mock item for 'controls' action
  const mockItem = createMenuItem({ action: 'controls' });

  const mockEvent = createMouseEvent(mockItem);

  // Call handleDropdownClick
  ui.handleDropdownClick(mockEvent);

  // Verify closeAllMenus called first
  assert.strictEqual(closeAllMenusCalled, true, 'closeAllMenus should be called first');

  // Verify openControlsDialog was called
  assert.strictEqual(openControlsDialogCalled, true, 'openControlsDialog should be called for controls action');
});

test('UI - handleDropdownClick about action opens dialog', async () => {
  const { UI } = await import('../src/UI.ts');

  const ui = createBareUI(UI);

  // Mock methods with spies
  let closeAllMenusCalled = false;
  let openAboutDialogCalled = false;

  ui.closeAllMenus = () => { closeAllMenusCalled = true; };
  ui.openAboutDialog = () => { openAboutDialogCalled = true; };

  // Mock item for 'about' action
  const mockItem = createMenuItem({ action: 'about' });

  const mockEvent = createMouseEvent(mockItem);

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
  const { UI } = await import('../src/UI.ts');

  // Create minimal UI prototype instance without DOM
  const ui = createBareUI(UI);

  // Get SVG icon for won state
  const wonSvg = ui.getFaceSvg('won');

  // Should contain two separate angled stepped lenses
  const lensMatches = wonSvg.match(/<path[^>]*fill="black"[^>]*>/g);
  assert.ok(lensMatches && lensMatches.length >= 2, 'Won face should have at least two black-filled lenses');

  // Should contain bridge, temples, and pixel smile
  assert.ok(wonSvg.includes('M10 8H14V9H10Z'), 'Won face should have bridge');
  assert.ok(wonSvg.includes('M3 7H4V8H3Z'), 'Won face should have left temple');
  assert.ok(wonSvg.includes('M20 7H21V8H20Z'), 'Won face should have right temple');
  assert.ok(wonSvg.includes('M7 16H8V17H10V18H14V17H16V16H17V18H16V19H14V20H10V19H8V18H7Z'),
    'Won face should have pixel smile');
});

test('UI - Face button mousedown does not replace SVG', async () => {
  const { UI } = await import('../src/UI.ts');

  // Create minimal UI prototype instance without DOM
  const ui = createBareUI(UI);

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

test('CSS - Modal dialog has max-height 90% and scrollable body only in .modal-body', async () => {
  const fs = await import('node:fs');
  const cssContent = fs.readFileSync(new URL('../src/styles.css', import.meta.url).pathname, 'utf8');

  // Test 1: .modal-overlay should exist
  const modalOverlayRule = cssContent.match(/\.modal-overlay\s*\{([^}]+)\}/s);
  assert.ok(modalOverlayRule, '.modal-overlay rule should exist');
  assert.ok(modalOverlayRule[1].includes('position: fixed;'), '.modal-overlay should be fixed position');
  assert.ok(modalOverlayRule[1].includes('z-index: 200;'), '.modal-overlay should have z-index 200');

  // Test 2: .modal should have max-height: 90% and overflow: hidden (NO auto scroll on .modal)
  const modalRule = cssContent.match(/\.modal\s*\{([^}]+)\}/s);
  assert.ok(modalRule, '.modal rule should exist');
  assert.ok(modalRule[1].includes('max-height: 90%'), '.modal should have max-height: 90%');
  assert.ok(modalRule[1].includes('overflow: hidden;'), '.modal should have overflow: hidden to prevent container scroll');
  assert.ok(!modalRule[1].includes('overflow-y: auto'), '.modal should NOT have overflow-y: auto (scroll should be on body only)');
  assert.ok(!modalRule[1].includes('overflow: auto'), '.modal should NOT have overflow: auto');

  // Test 3: .modal should use flex layout
  assert.ok(modalRule[1].includes('display: flex;'), '.modal should use flex layout');
  assert.ok(modalRule[1].includes('flex-direction: column;'), '.modal should use column flex');

  // Test 4: .modal should have box-sizing: border-box for correct max-height calculation
  assert.ok(modalRule[1].includes('box-sizing: border-box;'), '.modal should have box-sizing: border-box');

  // Test 5: .modal-body should have min-height: 0 and overflow-y: auto
  const modalBodyRule = cssContent.match(/\.modal-body\s*\{([^}]+)\}/s);
  assert.ok(modalBodyRule, '.modal-body rule should exist');
  assert.ok(modalBodyRule[1].includes('min-height: 0;'), '.modal-body should have min-height: 0');
  assert.ok(modalBodyRule[1].includes('overflow-y: auto;'), '.modal-body should have overflow-y: auto');

  // Test 6: .modal-header and .modal-footer should not be scrollable (flex-shrink: 0)
  const modalHeaderRule = cssContent.match(/\.modal-header\s*\{([^}]+)\}/s);
  assert.ok(modalHeaderRule, '.modal-header rule should exist');
  assert.ok(modalHeaderRule[1].includes('flex-shrink: 0;') ||
            modalHeaderRule[1].includes('flex: 0 0 auto;'),
    '.modal-header should have flex-shrink: 0 or flex: 0 0 auto');

  const modalFooterRule = cssContent.match(/\.modal-footer\s*\{([^}]+)\}/s);
  assert.ok(modalFooterRule, '.modal-footer rule should exist');
  assert.ok(modalFooterRule[1].includes('flex-shrink: 0;') ||
            modalFooterRule[1].includes('flex: 0 0 auto;'),
    '.modal-footer should have flex-shrink: 0 or flex: 0 0 auto');
});

/**
 * SVG Sprite Regression Tests for Terminal States
 */

test('UI - Won face SVG has Win95-style structure with angled stepped lenses', async () => {
  const { UI } = await import('../src/UI.ts');
  const ui = createBareUI(UI);

  const wonSvg = ui.getFaceSvg('won');

  // Win95 fixed won face requirements (24x24 grid, all coordinates 0..24):
  // - viewBox="0 0 24 24", width="24", height="24"
  // - shape-rendering="crispEdges"
  // - Face: circle cx="12" cy="12" r="10" fill="gold" stroke="black" stroke-width="1"
  // - Left lens: M4 7H10V10L9 12H6L5 10H4Z (stepped pattern x4..10)
  // - Right lens: M14 7H20V10L19 12H16L15 10H14Z (stepped pattern x14..20)
  // - Bridge: M10 8H14V9H10Z (bridge x10..14)
  // - Left temple: M3 7H4V8H3Z (x3..4)
  // - Right temple: M20 7H21V8H20Z (x20..21)
  // - Pixel smile: M7 16H8V17H10V18H14V17H16V16H17V18H16V19H14V20H10V19H8V18H7Z (x7..17, y16..20)
  // - NO solid rectangles, NO Q curves, NO coordinates >24

  // Test: SVG dimensions and rendering
  assert.ok(wonSvg.includes('viewBox="0 0 24 24"'),
    'Won face should have viewBox="0 0 24 24"');
  assert.ok(wonSvg.includes('width="24"'), 'Won face should have width="24"');
  assert.ok(wonSvg.includes('height="24"'), 'Won face should have height="24"');
  assert.ok(wonSvg.includes('shape-rendering="crispEdges"'),
    'Won face should use crispEdges rendering');

  // Test: Face has gold fill and black stroke
  assert.ok(wonSvg.includes('cx="12" cy="12" r="10" fill="gold" stroke="black" stroke-width="1"'),
    'Won face should have circle cx="12" cy="12" r="10" fill="gold" stroke="black" stroke-width="1"');

  // Test: Left lens - stepped pattern x4..10
  assert.ok(wonSvg.includes('M4 7H10V10L9 12H6L5 10H4Z'),
    'Won face should have left lens M4 7H10V10L9 12H6L5 10H4Z');

  // Test: Right lens - stepped pattern x14..20
  assert.ok(wonSvg.includes('M14 7H20V10L19 12H16L15 10H14Z'),
    'Won face should have right lens M14 7H20V10L19 12H16L15 10H14Z');

  // Test: Bridge x10..14
  assert.ok(wonSvg.includes('M10 8H14V9H10Z'),
    'Won face should have bridge M10 8H14V9H10Z');

  // Test: Left temple x3..4
  assert.ok(wonSvg.includes('M3 7H4V8H3Z'),
    'Won face should have left temple M3 7H4V8H3Z');

  // Test: Right temple x20..21
  assert.ok(wonSvg.includes('M20 7H21V8H20Z'),
    'Won face should have right temple M20 7H21V8H20Z');

  // Test: Pixel smile x7..17, y16..20
  assert.ok(wonSvg.includes('M7 16H8V17H10V18H14V17H16V16H17V18H16V19H14V20H10V19H8V18H7Z'),
    'Won face should have pixel smile M7 16H8V17H10V18H14V17H16V16H17V18H16V19H14V20H10V19H8V18H7Z');

  // Test: NO old buggy patterns
  assert.ok(!wonSvg.includes('M7 9 L12 9 L12 13 L7 13 Z'),
    'Won face should NOT have left solid rectangle lens');
  assert.ok(!wonSvg.includes('M20 9 L25 9 L25 13 L20 13 Z'),
    'Won face should NOT have right solid rectangle lens with x=25');
  assert.ok(!wonSvg.includes('Q'),
    'Won face should NOT have Q curves (pixel art, no curves)');
  assert.ok(!wonSvg.includes('M22 8 L25 8'),
    'Won face should NOT have coordinates exceeding 24');
});

test('CSS - Wrong-flag has flat cell with unified mine+diagonal-X sprite', async () => {
  const fs = await import('node:fs');
  const cssContent = fs.readFileSync(new URL('../src/styles.css', import.meta.url).pathname, 'utf8');

  // Win95 fixed wrong-flag requirements:
  // 1. .cell.flagged.wrong-flag with flat border (no bevel)
  // 2. Single unified ::before sprite containing mine + diagonal red X
  // 3. NO ::after rule at all (not content: none, but complete absence)
  // 4. Diagonal red X as path d='M3 3 L13 13 M13 3 L3 13'
  // 5. NO desktop left/top shrink hack

  // Test 1: .cell.flagged.wrong-flag should have flat border
  const flaggedWrongRule = cssContent.match(/\.cell\.flagged\.wrong-flag\s*\{([^}]+)\}/s);
  assert.ok(flaggedWrongRule, '.cell.flagged.wrong-flag rule should exist');
  const flaggedWrongContent = flaggedWrongRule[1];

  // Flat styling requires background-color and 1px border
  assert.ok(flaggedWrongContent.includes('background-color: var(--bg-gray)'),
    '.cell.flagged.wrong-flag should have flat background (var(--bg-gray))');
  assert.ok(flaggedWrongContent.includes('border: 1px solid var(--dark-gray)'),
    '.cell.flagged.wrong-flag should have flat border (1px solid var(--dark-gray))');

  // Test 2: .cell.flagged.wrong-flag::before should have unified mine+diagonal-X sprite
  const flaggedWrongBefore = cssContent.match(/\.cell\.flagged\.wrong-flag::before\s*\{([^}]+)\}/s);
  assert.ok(flaggedWrongBefore, 'flagged.wrong-flag::before rule should exist');
  const beforeContent = flaggedWrongBefore[1];

  // Must have mine geometry (center + rays)
  assert.ok(beforeContent.includes('fill="%23000"') || beforeContent.includes("fill='%23000'"),
    'flagged.wrong-flag::before should have mine (black)');

  // Must have diagonal X as path (not rectangular blocks)
  assert.ok(beforeContent.includes("path d='M3 3 L13 13 M13 3 L3 13'") ||
            beforeContent.includes('path d="M3 3 L13 13 M13 3 L3 13"'),
    'flagged.wrong-flag::before should have diagonal red X path');

  // Must NOT have rectangular blocks for X (the bug)
  assert.ok(!beforeContent.includes("rect x='4' y='2' width='8' height='2'"),
    'flagged.wrong-flag::before should NOT have rectangular blocks for X');

  // Test 3: NO ::after rule for .cell.flagged.wrong-flag at all (complete absence)
  // The after rule must not exist anywhere in the CSS
  assert.ok(!cssContent.includes('.cell.flagged.wrong-flag::after'),
    'CSS must have NO .cell.flagged.wrong-flag::after rule at all');

  // Test 4: NO desktop left/top shrink hack for .cell.flagged.wrong-flag::after
  const desktopHackPattern = /@media\s+\(pointer:\s*fine\)\s+and\s+\(min-width:\s*769px\)[^}]*\.cell\.flagged\.wrong-flag::after[^}]*left:\s*1px[^}]*top:\s*1px/s;
  assert.ok(!desktopHackPattern.test(cssContent),
    'CSS should NOT have desktop left/top shrink hack for flagged wrong-flag');

  // Test 5: .cell.wrong-flag:not(.flagged) should also have unified sprite
  const wrongNotFlaggedBefore = cssContent.match(/\.cell\.wrong-flag:not\(\.flagged\)::before\s*\{([^}]+)\}/s);
  assert.ok(wrongNotFlaggedBefore, 'wrong-flag:not(.flagged)::before rule should exist');
  const notFlaggedBeforeContent = wrongNotFlaggedBefore[1];

  // Must have mine geometry
  assert.ok(notFlaggedBeforeContent.includes('fill="%23000"') || notFlaggedBeforeContent.includes("fill='%23000'"),
    'wrong-flag:not(.flagged)::before should have mine (black)');

  // Must have diagonal X as path
  assert.ok(notFlaggedBeforeContent.includes("path d='M3 3 L13 13 M13 3 L3 13'") ||
            notFlaggedBeforeContent.includes('path d="M3 3 L13 13 M13 3 L3 13"'),
    'wrong-flag:not(.flagged)::before should have diagonal red X path');

  // Must NOT have rectangular blocks for X
  assert.ok(!notFlaggedBeforeContent.includes("rect x='4' y='2' width='8' height='2'"),
    'wrong-flag:not(.flagged)::before should NOT have rectangular blocks for X');
});

type FakeTreeElement = {
  name: string;
  children: FakeTreeElement[];
  appendChild(child: FakeTreeElement): FakeTreeElement;
};

const makeNode = (name: string): FakeTreeElement => ({
  name,
  children: [],
  appendChild(child: FakeTreeElement) { this.children.push(child); return child; }
});

test('DOM - assembleBoardArea appends controls, boardScroll(boardFrame), touchControls', async () => {
  const { UI } = await import('../src/UI.ts');
  const ui = createBareUI(UI);

  const boardArea = makeNode('board-area');
  const controls = makeNode('controls');
  const boardScroll = makeNode('board-scroll');
  const boardFrame = makeNode('board-frame');
  const touchControls = makeNode('touch-controls');

  ui.assembleBoardArea(
    boardArea as unknown as HTMLDivElement,
    controls as unknown as HTMLDivElement,
    boardScroll as unknown as HTMLDivElement,
    boardFrame as unknown as HTMLDivElement,
    touchControls as unknown as HTMLDivElement
  );

  assert.strictEqual(boardArea.children.length, 3);
  assert.strictEqual(boardArea.children[0].name, 'controls');
  assert.strictEqual(boardArea.children[1].name, 'board-scroll');
  assert.strictEqual(boardArea.children[2].name, 'touch-controls');

  assert.strictEqual(boardScroll.children.length, 1);
  assert.strictEqual(boardScroll.children[0].name, 'board-frame');

  assert.strictEqual(boardScroll.children.find(c => c.name === 'controls'), undefined, 'controls not in boardScroll');
  assert.strictEqual(boardScroll.children.find(c => c.name === 'touch-controls'), undefined, 'touchControls not in boardScroll');
});

test('CSS - board-area/scroll scroll contract and window percentage constraint', async () => {
  const fs = await import('node:fs');
  const cssContent = fs.readFileSync(new URL('../src/styles.css', import.meta.url).pathname, 'utf8');

  const boardAreaMatch = cssContent.match(/\.board-area\s*\{([^}]+)\}/s);
  assert.ok(boardAreaMatch, '.board-area CSS rule should exist');
  assert.ok(boardAreaMatch[1].includes('overflow: hidden;'), 'board-area must have overflow: hidden');
  assert.ok(boardAreaMatch[1].includes('flex: 1 1 auto;'), 'board-area must have flex: 1 1 auto');

  const boardScrollMatch = cssContent.match(/\.board-scroll\s*\{([^}]+)\}/s);
  assert.ok(boardScrollMatch, '.board-scroll CSS rule should exist');
  assert.ok(boardScrollMatch[1].includes('overflow: auto;'), 'board-scroll must have overflow: auto');

  const windowMatch = cssContent.match(/\.window\s*\{([^}]+)\}/s);
  assert.ok(windowMatch, '.window CSS rule should exist');
  assert.ok(windowMatch[1].includes('--inverse-viewport-constraint: 100%;'), 'window must define inverse constraint');
  assert.ok(windowMatch[1].includes('max-width: var(--inverse-viewport-constraint);'), 'window max-width uses constraint');
  assert.ok(windowMatch[1].includes('max-height: var(--inverse-viewport-constraint);'), 'window max-height uses constraint');
});

test('UI - updateZoomUI sets --inverse-viewport-constraint as percentage at all zoom levels', async () => {
  const { UI } = await import('../src/UI.ts');
  const ui = createBareUI(UI);
  ui.game = new Minesweeper({ width: 9, height: 9, mines: 10 });

  const setPropertyCalls: { name: string; value: string }[] = [];
  const windowEl = {
    dataset: {},
    style: { setProperty: (n: string, v: string) => setPropertyCalls.push({ name: n, value: v }) }
  } as unknown as HTMLDivElement;

  ui.element = createPartialElements({
    window: windowEl,
    zoomOutBtn: { disabled: false, textContent: '', title: '', setAttribute: () => {} } as unknown as HTMLButtonElement,
    zoomResetBtn: { disabled: false, textContent: '', title: '', setAttribute: () => {} } as unknown as HTMLButtonElement,
    zoomInBtn: { disabled: false, textContent: '', title: '', setAttribute: () => {} } as unknown as HTMLButtonElement
  });

  const zoomLevels: (75 | 100 | 125 | 150 | 175 | 200)[] = [75, 100, 125, 150, 175, 200];
  for (const level of zoomLevels) {
    setPropertyCalls.length = 0;
    ui.zoomLevel = level;
    ui.updateZoomUI();

    const inverseConstraint = setPropertyCalls.find(c => c.name === '--inverse-viewport-constraint');
    assert.ok(inverseConstraint, `Level ${level}% must set --inverse-viewport-constraint`);
    assert.strictEqual(inverseConstraint.value, String(100 / (level / 100)) + '%');
  }
});
