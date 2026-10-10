/**
 * Вспомогательные функции для Minesweeper
 */

import { CELL_STATE } from './Game.js';

/**
 * Создание пустой доски
 * @param {number} width
 * @param {number} height
 * @returns {Array<Array<Object>>}
 */
export function createBoard(width, height) {
  const board = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      row.push({
        x,
        y,
        isMine: false,
        neighbors: 0,
        state: CELL_STATE.CLOSED,
        exploded: false,
        wrongFlag: false
      });
    }
    board.push(row);
  }
  return board;
}

/**
 * Подсчёт мин вокруг клетки
 * @param {Array<Array<Object>>} board
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @returns {number}
 */
export function countMines(board, x, y, width, height) {
  let count = 0;
  
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      
      const nx = x + dx;
      const ny = y + dy;
      
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        if (board[ny][nx].isMine) {
          count++;
        }
      }
    }
  }
  
  return count;
}

/**
 * Получение соседей клетки
 * @param {Array<Array<Object>>} board
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @returns {Array<Object>}
 */
export function getNeighbors(board, x, y, width, height) {
  const neighbors = [];
  
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      
      const nx = x + dx;
      const ny = y + dy;
      
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        neighbors.push(board[ny][nx]);
      }
    }
  }
  
  return neighbors;
}

/**
 * Получение безопасной зоны 3×3 вокруг точки
 * @param {number} x
 * @param {number} y
 * @param {number} boardWidth
 * @param {number} boardHeight
 * @returns {Set<string>}
 */
export function getSafeZone(x, y, boardWidth, boardHeight) {
  const safeZone = new Set();
  
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      
      if (nx >= 0 && nx < boardWidth && ny >= 0 && ny < boardHeight) {
        safeZone.add(`${nx},${ny}`);
      }
    }
  }
  
  return safeZone;
}

/**
 * Проверка валидности конфигурации
 * @param {Object} config
 * @returns {Object} { valid: boolean, error?: string }
 */
export function isValidConfig(config) {
  const { width, height, mines } = config;
  
  // Проверка типов - только конечные целые числа
  if (!Number.isFinite(width) || !Number.isInteger(width)) {
    return { valid: false, error: 'Ширина должна быть конечным целым числом' };
  }
  if (!Number.isFinite(height) || !Number.isInteger(height)) {
    return { valid: false, error: 'Высота должна быть конечным целым числом' };
  }
  if (!Number.isFinite(mines) || !Number.isInteger(mines)) {
    return { valid: false, error: 'Количество мин должно быть конечным целым числом' };
  }
  
  // Проверка границ
  if (width < 9 || width > 30) {
    return { valid: false, error: `Ширина должна быть от 9 до 30, указано: ${width}` };
  }
  
  if (height < 9 || height > 24) {
    return { valid: false, error: `Высота должна быть от 9 до 24, указано: ${height}` };
  }
  
  // Минимум 10 мин (ТЗ требует)
  const minMines = 10;
  const maxMines = Math.min(668, width * height - 9);
  
  if (mines < minMines) {
    return { valid: false, error: `Количество мин должно быть не менее ${minMines}, указано: ${mines}` };
  }
  
  if (mines > maxMines) {
    return { valid: false, error: `Максимальное количество мин для размера ${width}×${height} и 9-клеточной безопасной зоны: ${maxMines}` };
  }
  
  return { valid: true };
}

/**
 * Форматирование числа для LED-дисплея (три разряда)
 * @param {number} value
 * @returns {string}
 */
export function formatLedNumber(value) {
  const clamped = Math.max(-99, Math.min(999, value));
  const str = clamped.toString();
  
  if (clamped < 0) {
    return '-' + str.slice(1).padStart(2, '0');
  }
  
  return str.padStart(3, '0');
}

/**
 * Получение цвета цифры
 * @param {number} digit
 * @returns {string}
 */
export function getDigitColor(digit) {
  const colors = {
    1: '#0000FF',
    2: '#008000',
    3: '#FF0000',
    4: '#000080',
    5: '#800000',
    6: '#008080',
    7: '#000000',
    8: '#808080'
  };
  return colors[digit] || '#000000';
}

/**
 * Проверка, является ли конфигурация стандартной
 * @param {Object} config
 * @returns {string|null}
 */
export function getStandardDifficulty(config) {
  const { width, height, mines } = config;
  
  if (width === 9 && height === 9 && mines === 10) {
    return 'beginner';
  }
  if (width === 16 && height === 16 && mines === 40) {
    return 'intermediate';
  }
  if (width === 30 && height === 16 && mines === 99) {
    return 'expert';
  }
  
  return null;
}
