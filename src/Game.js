/**
 * Minesweeper Game Logic
 *完全 отделённая от DOM логика игры
 */

import { createBoard, countMines, getNeighbors, getSafeZone, isValidConfig } from './utils.js';

// Helper function to validate config and throw if invalid
function assertValidConfig(config) {
  const { valid, error } = isValidConfig(config);
  if (!valid) {
    throw new RangeError(error);
  }
}

export const DIFFICULTY = {
  BEGINNER: { width: 9, height: 9, mines: 10, label: 'beginner' },
  INTERMEDIATE: { width: 16, height: 16, mines: 40, label: 'intermediate' },
  EXPERT: { width: 30, height: 16, mines: 99, label: 'expert' }
};

export const STATE = {
  READY: 'ready',
  RUNNING: 'running',
  WON: 'won',
  LOST: 'lost'
};

export const CELL_STATE = {
  CLOSED: 'closed',
  FLAGGED: 'flagged',
  QUESTIONED: 'questioned',
  REVEALED: 'revealed'
};

/**
 * Класс Minesweeper - ядро игры, полностью автономен от DOM
 */
export class Minesweeper {
  /**
   * @param {Object} config
   * @param {number} config.width - ширина доски (9-30)
   * @param {number} config.height - высота доски (9-24)
   * @param {number} config.mines - количество мин
   */
  constructor(config = { width: 9, height: 9, mines: 10 }) {
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
  reset() {
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
  setConfig(config) {
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
  getConfig() {
    return { ...this.config };
  }

  /**
   * Получение текущего состояния игры
   * @returns {Object}
   */
  getState() {
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
  getCell(x, y) {
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
  static validateConfig(config) {
    return isValidConfig(config);
  }

  /**
   * Начало игры (только размещает мины и запускает таймер, НЕ раскрывает клетки)
   * Вызывается после первого клика
   * @param {number} startX
   * @param {number} startY
   */
  startGame(startX, startY) {
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
   * Расстановка мин методом полного Fisher-Yates
   * Создаем список всех доступных клеток и перемешиваем
   * @param {Set<string>} excluded - координаты, исключённые из размещения мин
   */
  placeMines(excluded) {
    const totalCells = this.width * this.height;
    const available = [];
    
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
  calculateNumbers() {
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
  getNeighbors(x, y) {
    return getNeighbors(this.board, x, y, this.width, this.height);
  }

  /**
   * Раскрытие клетки (Left Click) - ИТЕРАТИВНЫЙ flood fill
   * @param {number} x
   * @param {number} y
   * @returns {Object} { result: 'ok'|'flagged'|'terminal', cells: Array }
   */
  reveal(x, y) {
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
    if (this.state === STATE.WON) {
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
  revealFlood(startX, startY) {
    const revealed = [];
    const stack = [[startX, startY]];
    const visited = new Set();
    
    while (stack.length > 0) {
      const [x, y] = stack.pop();
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
   * @returns {Object} { state: new state, flagsChanged: boolean }
   */
  cycleFlag(x, y) {
    const cell = this.getCell(x, y);
    
    if (!cell || cell.state === CELL_STATE.REVEALED) {
      return { state: cell?.state, flagsChanged: false };
    }
    
    // Если уже проиграли или выиграли - не делаем ничего
    if (this.state === STATE.LOST || this.state === STATE.WON) {
      return { state: cell.state, flagsChanged: false };
    }
    
    const states = [CELL_STATE.CLOSED, CELL_STATE.FLAGGED, CELL_STATE.QUESTIONED];
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
    
    return { state: nextState, flagsChanged: true };
  }

  /**
   * Chording: раскрытие соседей при равенстве флагов и цифры
   * @param {number} x
   * @param {number} y
   * @returns {Object} { result: 'ok'|'terminal', cells: Array }
   */
  chord(x, y) {
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
      const revealed = [];
      
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
   */
  toggleFlag(x, y) {
    const cell = this.getCell(x, y);
    
    if (!cell || cell.state === CELL_STATE.REVEALED) {
      return;
    }
    
    // Если уже проиграли или выиграли - не делаем ничего
    if (this.state === STATE.LOST || this.state === STATE.WON) {
      return;
    }
    
    if (cell.state === CELL_STATE.CLOSED) {
      cell.state = CELL_STATE.FLAGGED;
      this.flags++;
    } else if (cell.state === CELL_STATE.FLAGGED) {
      cell.state = CELL_STATE.CLOSED;
      this.flags--;
    }
  }

  /**
   * Поражение - показать все мины
   * @param {number} explodedX
   * @param {number} explodedY
   */
  loseGame(explodedX, explodedY) {
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
  winGame() {
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
  getAllCells() {
    const cells = [];
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
  getRevealedCells() {
    const cells = [];
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
  startTimer() {
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
  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /**
   * Проверка валидности конфигурации
   * @param {number} width
   * @param {number} height
   * @param {number} mines
   * @returns {Object}
   */
  static isValidConfig(width, height, mines) {
    return isValidConfig({ width, height, mines });
  }
}

// Экспорт утилит
export * from './utils.js';
