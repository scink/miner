/**
 * Minesweeper Game Logic
 *完全 отделённая от DOM логика игры
 */

import { createBoard, countMines, getNeighbors, getSafeZone, isValidConfig } from './utils.ts';

export interface GameConfig {
  width: number;
  height: number;
  mines: number;
  label?: StandardDifficulty;
}

export interface GameConfigInput {
  width: unknown;
  height: unknown;
  mines: unknown;
  label?: StandardDifficulty;
}

export type StandardDifficulty = 'beginner' | 'intermediate' | 'expert';

export interface DifficultyConfig extends GameConfig {
  label: StandardDifficulty;
}

export const DIFFICULTY = {
  BEGINNER: { width: 9, height: 9, mines: 10, label: 'beginner' },
  INTERMEDIATE: { width: 16, height: 16, mines: 40, label: 'intermediate' },
  EXPERT: { width: 30, height: 16, mines: 99, label: 'expert' }
} as const satisfies Record<'BEGINNER' | 'INTERMEDIATE' | 'EXPERT', DifficultyConfig>;

export const STATE = {
  READY: 'ready',
  RUNNING: 'running',
  PAUSED: 'paused',
  WON: 'won',
  LOST: 'lost'
} as const;

export type GameState = typeof STATE[keyof typeof STATE];

export const CELL_STATE = {
  CLOSED: 'closed',
  FLAGGED: 'flagged',
  QUESTIONED: 'questioned',
  REVEALED: 'revealed'
} as const;

export type CellState = typeof CELL_STATE[keyof typeof CELL_STATE];

export type CellMarker = 'flag' | 'question';

export interface Coordinate {
  x: number;
  y: number;
}

export interface Cell extends Coordinate {
  isMine: boolean;
  neighbors: number;
  state: CellState;
  exploded: boolean;
  wrongFlag: boolean;
}

export type Board = Cell[][];

export type ValidationResult =
  | { valid: true }
  | { valid: false; error: string };

export interface GameSnapshot {
  state: GameState;
  timer: number;
  flags: number;
  mines: number;
  minesLeft: number;
  revealedCount: number;
  totalCells: number;
}

export interface RevealResult {
  result: 'ok' | 'flagged' | 'paused' | 'terminal';
  cells: Cell[];
}

export interface FlagCycleResult {
  result: 'ok' | 'paused' | 'terminal';
  state: CellState | undefined;
  flagsChanged: boolean;
}

export interface CellMarkerResult {
  result: 'ok' | 'paused' | 'terminal';
  state: CellState | undefined;
  cellChanged: boolean;
  flagCountChanged: boolean;
}

// Helper function to validate config and throw if invalid
function assertValidConfig(config: GameConfigInput): asserts config is GameConfig {
  const validation = isValidConfig(config);
  if (!validation.valid) {
    throw new RangeError(validation.error);
  }
}

/**
 * Класс Minesweeper - ядро игры, полностью автономен от DOM
 */
export class Minesweeper {
  width: number;
  height: number;
  totalMines: number;
  config: GameConfig;
  board: Board = [];
  state: GameState = STATE.READY;
  flags = 0;
  timer = 0;
  timerInterval: ReturnType<typeof setInterval> | null = null;
  firstReveal = true;
  revealedCount = 0;
  gameOver = false;

  /**
   * @param {Object} config
   * @param {number} config.width - ширина доски (9-30)
   * @param {number} config.height - высота доски (9-24)
   * @param {number} config.mines - количество мин
   */
  constructor(config: GameConfigInput = { width: 9, height: 9, mines: 10 }) {
    assertValidConfig(config);
    this.width = config.width;
    this.height = config.height;
    this.totalMines = config.mines;
    this.config = { ...config };
    this.reset();
  }

  /**
   * Сброс игры в начальное состояние
   */
  reset(): void {
    this.stopTimer();
    this.board = createBoard(this.width, this.height);
    this.state = STATE.READY;
    this.flags = 0;
    this.timer = 0;
    this.timerInterval = null;
    this.firstReveal = true;
    this.revealedCount = 0;
    this.gameOver = false;
  }

  /**
   * Установка конфигурации
   * @param {Object} config
   */
  setConfig(config: GameConfigInput): void {
    assertValidConfig(config);
    this.width = config.width;
    this.height = config.height;
    this.totalMines = config.mines;
    this.config = { ...config };
    this.reset();
  }

  /**
   * Получение конфигурации
   * @returns {Object}
   */
  getConfig(): GameConfig {
    return { ...this.config };
  }

  /**
   * Получение текущего состояния игры
   * @returns {Object}
   */
  getState(): GameSnapshot {
    return {
      state: this.state,
      timer: this.timer,
      flags: this.flags,
      mines: this.totalMines,
      minesLeft: this.totalMines - this.flags,
      revealedCount: this.revealedCount,
      totalCells: this.width * this.height
    };
  }

  /**
   * Получить клетку по координатам
   * @param {number} x
   * @param {number} y
   * @returns {Object|null}
   */
  getCell(x: number, y: number): Cell | null {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return null;
    }
    return this.board[y][x];
  }

  /**
   * Проверка валидности конфигурации
   * @param {Object} config
   * @returns {Object} { valid: boolean, error?: string }
   */
  static validateConfig(config: GameConfigInput): ValidationResult {
    return isValidConfig(config);
  }

  /**
   * Начало игры (только размещает мины и запускает таймер, НЕ раскрывает клетки)
   * Вызывается после первого клика
   * @param {number} startX
   * @param {number} startY
   */
  startGame(startX: number, startY: number): void {
    if (this.state !== STATE.READY) {
      return;
    }

    // Определяем безопасную зону вокруг первого клика
    const safeZone = getSafeZone(startX, startY, this.width, this.height);
    
    // Расставляем мины, исключая безопасную зону
    this.placeMines(safeZone);
    
    // Вычисляем числа вокруг мин
    this.calculateNumbers();
    
    // Начинаем таймер
    this.state = STATE.RUNNING;
    this.timer = 0;
    this.startTimer();
    
    this.firstReveal = false;
  }

  /**
   * Приостанавливает только активную игру, сохраняя прошедшее время.
   */
  pause(): boolean {
    if (this.state !== STATE.RUNNING) {
      return false;
    }

    this.stopTimer();
    this.state = STATE.PAUSED;
    return true;
  }

  /**
   * Возобновляет только приостановленную игру и продолжает таймер.
   */
  resume(): boolean {
    if (this.state !== STATE.PAUSED) {
      return false;
    }

    this.state = STATE.RUNNING;
    this.startTimer();
    return true;
  }

  /**
   * Расстановка мин методом полного Fisher-Yates
   * Создаем список всех доступных клеток и перемешиваем
   * @param {Set<string>} excluded - координаты, исключённые из размещения мин
   */
  placeMines(excluded: ReadonlySet<string>): void {
    const totalCells = this.width * this.height;
    const available: Coordinate[] = [];
    
    // Собираем доступные клетки
    for (let i = 0; i < totalCells; i++) {
      const x = i % this.width;
      const y = Math.floor(i / this.width);
      const key = `${x},${y}`;
      
      if (!excluded.has(key)) {
        available.push({ x, y });
      }
    }
    
    // Проверяем, что достаточно клеток для мин
    if (available.length < this.totalMines) {
      throw new Error(`Не хватает клеток для размещения ${this.totalMines} мин`);
    }
    
    // Полный Fisher-Yates shuffle
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }
    
    // Расставляем мины
    for (let i = 0; i < this.totalMines; i++) {
      const { x, y } = available[i];
      this.board[y][x].isMine = true;
    }
  }

  /**
   * Вычисление чисел вокруг мин
   */
  calculateNumbers(): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (!this.board[y][x].isMine) {
          this.board[y][x].neighbors = countMines(this.board, x, y, this.width, this.height);
        }
      }
    }
  }

  /**
   * Получить координаты соседей
   * @param {number} x
   * @param {number} y
   * @returns {Array}
   */
  getNeighbors(x: number, y: number): Cell[] {
    return getNeighbors(this.board, x, y, this.width, this.height);
  }

  /**
   * Раскрытие клетки (Left Click) - ИТЕРАТИВНЫЙ flood fill
   * @param {number} x
   * @param {number} y
   * @returns {Object} { result: 'ok'|'flagged'|'paused'|'terminal', cells: Array }
   */
  reveal(x: number, y: number): RevealResult {
    if (this.state === STATE.PAUSED) {
      return { result: 'paused', cells: [] };
    }

    const cell = this.getCell(x, y);
    
    // Проверки
    if (!cell) {
      return { result: 'ok', cells: [] };
    }
    
    // Если уже проиграли или выиграли - не делаем ничего
    if (this.state === STATE.LOST || this.state === STATE.WON) {
      return { result: 'terminal', cells: [] };
    }
    
    if (cell.state === CELL_STATE.REVEALED) {
      return { result: 'ok', cells: [] };
    }
    
    if (cell.state === CELL_STATE.FLAGGED) {
      return { result: 'flagged', cells: [] };
    }
    
    // Если игра не началась, начинаем (но НЕ раскрываем клетку)
    if (this.state === STATE.READY) {
      this.startGame(x, y);
    }
    
    // Если это мина - поражение
    if (cell.isMine) {
      this.loseGame(x, y);
      return { result: 'terminal', cells: this.getAllCells() };
    }
    
    // Раскрываем клетку (итеративный flood fill)
    const revealed = this.revealFlood(x, y);
    
    // Проверка на победу
    if (this.revealedCount === this.width * this.height - this.totalMines) {
      this.winGame();
    }
    
    // Возвращаем результат
    if (this.hasState(STATE.WON)) {
      return { result: 'terminal', cells: this.getAllCells() };
    }
    
    return { result: 'ok', cells: revealed };
  }

  /**
   * Итеративное раскрытие (flood fill) пустых клеток - БЕЗ РЕКУРСИИ
   * @param {number} startX
   * @param {number} startY
   * @returns {Array} раскрытые клетки
   */
  revealFlood(startX: number, startY: number): Cell[] {
    const revealed: Cell[] = [];
    const stack: Array<[number, number]> = [[startX, startY]];
    const visited = new Set<string>();
    
    while (stack.length > 0) {
      const position = stack.pop();
      if (!position) break;
      const [x, y] = position;
      const key = `${x},${y}`;
      
      if (visited.has(key)) continue;
      visited.add(key);
      
      const cell = this.getCell(x, y);
      if (!cell || cell.state === CELL_STATE.REVEALED) continue;
      if (cell.state === CELL_STATE.FLAGGED) continue; // FLAGGED блокирует flood
      
      cell.state = CELL_STATE.REVEALED;
      revealed.push(cell);
      this.revealedCount++;
      
      // Если это пустая клетка (0 соседей), добавляем соседей в стек
      if (cell.neighbors === 0) {
        const neighbors = getNeighbors(this.board, x, y, this.width, this.height);
        for (const neighbor of neighbors) {
          if (neighbor.state !== CELL_STATE.REVEALED) {
            stack.push([neighbor.x, neighbor.y]);
          }
        }
      }
    }
    
    // Проверка на победу
    if (this.revealedCount === this.width * this.height - this.totalMines) {
      this.winGame();
    }
    
    return revealed;
  }

  /**
   * Циклическое изменение состояния клетки (Right Click)
   * closed -> flagged -> questioned -> closed
   * @param {number} x
   * @param {number} y
   * @returns {Object} { result, state: new state, flagsChanged: boolean }
   */
  cycleFlag(x: number, y: number): FlagCycleResult {
    const cell = this.getCell(x, y);

    if (this.state === STATE.PAUSED) {
      return { result: 'paused', state: cell?.state, flagsChanged: false };
    }
    
    if (!cell || cell.state === CELL_STATE.REVEALED) {
      return { result: 'ok', state: cell?.state, flagsChanged: false };
    }
    
    // Если уже проиграли или выиграли - не делаем ничего
    if (this.state === STATE.LOST || this.state === STATE.WON) {
      return { result: 'terminal', state: cell.state, flagsChanged: false };
    }
    
    const states: CellState[] = [CELL_STATE.CLOSED, CELL_STATE.FLAGGED, CELL_STATE.QUESTIONED];
    const currentIndex = states.indexOf(cell.state);
    const nextState = states[(currentIndex + 1) % states.length];
    
    let flagsDelta = 0;
    
    // FLAGGED -> QUESTIONED: уменьшаем счетчик
    if (cell.state === CELL_STATE.FLAGGED && nextState === CELL_STATE.QUESTIONED) {
      flagsDelta = -1;
    }
    // QUESTIONED -> CLOSED: не меняем счетчик
    // CLOSED -> FLAGGED: увеличиваем счетчик
    else if (cell.state === CELL_STATE.CLOSED && nextState === CELL_STATE.FLAGGED) {
      flagsDelta = 1;
    }
    
    cell.state = nextState;
    this.flags += flagsDelta;
    
    return { result: 'ok', state: nextState, flagsChanged: true };
  }

  /**
   * Применяет выбранный UI-маркер без циклического переключения.
   * Повторный выбор активного маркера снимает его, другой маркер заменяет текущий.
   */
  applyCellMarker(x: number, y: number, marker: CellMarker): CellMarkerResult {
    const cell = this.getCell(x, y);

    if (this.state === STATE.PAUSED) {
      return {
        result: 'paused',
        state: cell?.state,
        cellChanged: false,
        flagCountChanged: false
      };
    }

    if (this.state === STATE.LOST || this.state === STATE.WON) {
      return {
        result: 'terminal',
        state: cell?.state,
        cellChanged: false,
        flagCountChanged: false
      };
    }

    if (!cell || cell.state === CELL_STATE.REVEALED) {
      return {
        result: 'ok',
        state: cell?.state,
        cellChanged: false,
        flagCountChanged: false
      };
    }

    const markerState = marker === 'flag' ? CELL_STATE.FLAGGED : CELL_STATE.QUESTIONED;
    const nextState = cell.state === markerState ? CELL_STATE.CLOSED : markerState;
    const wasFlagged = cell.state === CELL_STATE.FLAGGED;
    const willBeFlagged = nextState === CELL_STATE.FLAGGED;

    if (wasFlagged && !willBeFlagged) {
      this.flags--;
    } else if (!wasFlagged && willBeFlagged) {
      this.flags++;
    }

    cell.state = nextState;

    return {
      result: 'ok',
      state: nextState,
      cellChanged: true,
      flagCountChanged: wasFlagged !== willBeFlagged
    };
  }

  /**
   * Chording: раскрытие соседей при равенстве флагов и цифры
   * @param {number} x
   * @param {number} y
   * @returns {Object} { result: 'ok'|'paused'|'terminal', cells: Array }
   */
  chord(x: number, y: number): RevealResult {
    if (this.state === STATE.PAUSED) {
      return { result: 'paused', cells: [] };
    }

    const cell = this.getCell(x, y);
    
    if (!cell || cell.state !== CELL_STATE.REVEALED || cell.neighbors === 0) {
      return { result: 'ok', cells: [] };
    }
    
    // Если уже проиграли или выиграли
    if (this.state === STATE.LOST || this.state === STATE.WON) {
      return { result: 'terminal', cells: [] };
    }
    
    // Считаем количество соседних флагов
    const neighbors = getNeighbors(this.board, x, y, this.width, this.height);
    const flagCount = neighbors.filter(n => n.state === CELL_STATE.FLAGGED).length;
    
    // Если флагов совпадает с цифрой
    if (flagCount === cell.neighbors) {
      const revealed: Cell[] = [];
      
      for (const neighbor of neighbors) {
        // Reveal CLOSED and QUESTIONED cells (but not FLAGGED or already REVEALED)
        if (neighbor.state === CELL_STATE.CLOSED || neighbor.state === CELL_STATE.QUESTIONED) {
          const result = this.reveal(neighbor.x, neighbor.y);
          if (result.result === 'terminal') {
            return { result: 'terminal', cells: this.getAllCells() };
          }
          revealed.push(...result.cells);
        }
      }
      
      return { result: 'ok', cells: revealed };
    }
    
    return { result: 'ok', cells: [] };
  }

  /**
   * Установка/снятие флага (для клавиатуры)
   * @param {number} x
   * @param {number} y
   * @returns {Object} { result, state: new state, flagsChanged: boolean }
   */
  toggleFlag(x: number, y: number): FlagCycleResult {
    const cell = this.getCell(x, y);

    if (this.state === STATE.PAUSED) {
      return { result: 'paused', state: cell?.state, flagsChanged: false };
    }
    
    if (!cell || cell.state === CELL_STATE.REVEALED) {
      return { result: 'ok', state: cell?.state, flagsChanged: false };
    }
    
    // Если уже проиграли или выиграли - не делаем ничего
    if (this.state === STATE.LOST || this.state === STATE.WON) {
      return { result: 'terminal', state: cell.state, flagsChanged: false };
    }
    
    if (cell.state === CELL_STATE.CLOSED) {
      cell.state = CELL_STATE.FLAGGED;
      this.flags++;
      return { result: 'ok', state: cell.state, flagsChanged: true };
    } else if (cell.state === CELL_STATE.FLAGGED) {
      cell.state = CELL_STATE.CLOSED;
      this.flags--;
      return { result: 'ok', state: cell.state, flagsChanged: true };
    }

    return { result: 'ok', state: cell.state, flagsChanged: false };
  }

  /**
   * Поражение - показать все мины
   * @param {number} explodedX
   * @param {number} explodedY
   */
  loseGame(explodedX: number, explodedY: number): void {
    this.state = STATE.LOST;
    this.stopTimer();
    
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = this.board[y][x];
        
        if (cell.isMine) {
          // Keep FLAGGED mines as flags, only reveal unflagged mines
          if (cell.state !== CELL_STATE.FLAGGED) {
            cell.state = CELL_STATE.REVEALED;
          }
          if (x === explodedX && y === explodedY) {
            cell.exploded = true;
          }
        } else if (cell.state === CELL_STATE.FLAGGED) {
          cell.wrongFlag = true;
        }
      }
    }
  }

  /**
   * Победа - поставить флаги на оставшиеся мины
   */
  winGame(): void {
    this.state = STATE.WON;
    this.stopTimer();
    this.timer = Math.min(999, this.timer);
    
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = this.board[y][x];
        
        if (cell.isMine && cell.state !== CELL_STATE.FLAGGED) {
          cell.state = CELL_STATE.FLAGGED;
        }
      }
    }
    
    this.flags = this.totalMines;
  }

  /**
   * Получить все клетки (для полной перерисовки)
   * @returns {Array}
   */
  getAllCells(): Cell[] {
    const cells: Cell[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        cells.push(this.board[y][x]);
      }
    }
    return cells;
  }

  /**
   * Получить все раскрытые клетки (для отрисовки)
   * @returns {Array}
   */
  getRevealedCells(): Cell[] {
    const cells: Cell[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.board[y][x].state === CELL_STATE.REVEALED) {
          cells.push(this.board[y][x]);
        }
      }
    }
    return cells;
  }

  /**
   * Запуск таймера
   */
  startTimer(): void {
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      if (this.timer < 999) {
        this.timer++;
      }
    }, 1000);
  }

  /**
   * Остановка таймера
   */
  stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private hasState(state: GameState): boolean {
    return this.state === state;
  }

  /**
   * Проверка валидности конфигурации
   * @param {number} width
   * @param {number} height
   * @param {number} mines
   * @returns {Object}
   */
  static isValidConfig(width: unknown, height: unknown, mines: unknown): ValidationResult {
    return isValidConfig({ width, height, mines });
  }
}

// Экспорт утилит
export * from './utils.ts';
