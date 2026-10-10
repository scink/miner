/**
 * Main entry point
 * Инициализация игры и UI
 */

import { Minesweeper, DIFFICULTY } from './Game.js';
import { UI } from './UI.js';

/**
 * Безопасное чтение из localStorage
 */
function getSafeStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

/**
 * Безопасная запись в localStorage
 */
function setSafeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    // Ignore errors
  }
}

/**
 * Получение стандартной сложности
 * Returns valid difficulty string or null if not standard
 */
function getStandardDifficulty(config) {
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

/**
 * Validate and normalize difficulty value
 * Returns valid difficulty or 'beginner' fallback
 */
function normalizeDifficulty(difficulty) {
  const validDifficulties = ['beginner', 'intermediate', 'expert', 'custom'];
  if (validDifficulties.includes(difficulty)) {
    return difficulty;
  }
  return 'beginner';
}

/**
 * Инициализация игры
 */
function initGame() {
  // Получаем сохранённый конфиг
  const savedConfig = getSafeStorage('minesweeper-config');
  let initialDifficulty = 'beginner';
  let customConfig = null;
  
  if (savedConfig) {
    try {
      const parsed = JSON.parse(savedConfig);
      if (parsed.difficulty) {
        // Validate and normalize difficulty - fallback to 'beginner' if invalid
        const normalized = normalizeDifficulty(parsed.difficulty);
        if (normalized === 'custom') {
          // Custom requires valid custom config object
          if (parsed.custom) {
            customConfig = parsed.custom;
            initialDifficulty = 'custom';
          } else {
            // No custom config - fallback to beginner
            initialDifficulty = 'beginner';
            customConfig = null;
          }
        } else {
          initialDifficulty = normalized;
          customConfig = null;
        }
      }
    } catch (e) {
      console.warn('Ошибка загрузки сохранённого конфига:', e);
    }
  }
  
  // Валидация конфига
  if (initialDifficulty === 'custom' && customConfig) {
    const validation = Minesweeper.isValidConfig(customConfig.width, customConfig.height, customConfig.mines);
    if (!validation.valid) {
      console.warn('Неверный сохранённый custom config, используем beginner:', validation.error);
      initialDifficulty = 'beginner';
      customConfig = null;
    }
  }
  
  // Создаём игру с начальной конфигурацией
  const game = new Minesweeper(DIFFICULTY.BEGINNER);
  
  // Создаём UI
  const ui = new UI(game);
  
  // Устанавливаем начальный режим
  if (initialDifficulty === 'custom' && customConfig) {
    ui.setDifficultyFromConfig(customConfig);
  } else {
    ui.setInitialDifficulty(initialDifficulty);
  }
  
  // Обработка глобальных клавиш
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F2') {
      e.preventDefault();
      ui.resetGame();
    }
  });
  
  // Сохранение конфигурации при смене режима через setConfig
  const originalSetConfig = game.setConfig.bind(game);
  game.setConfig = function(config) {
    const standard = getStandardDifficulty(config);
    const savedConfig = getSafeStorage('minesweeper-config') || '{}';
    let cfg = {};
    try { cfg = JSON.parse(savedConfig); } catch (e) {}
    
    if (standard) {
      cfg.difficulty = standard;
      delete cfg.custom;
    } else {
      cfg.difficulty = 'custom';
      cfg.custom = { ...config };
    }
    
    setSafeStorage('minesweeper-config', JSON.stringify(cfg));
    originalSetConfig(config);
  };
  
  // Обновление сложности в UI
  const originalSetDifficulty = ui.setDifficulty.bind(ui);
  ui.setDifficulty = function(difficulty) {
    const savedConfig = getSafeStorage('minesweeper-config') || '{}';
    let cfg = {};
    try { cfg = JSON.parse(savedConfig); } catch (e) {}
    
    if (difficulty === 'custom') {
      cfg.difficulty = 'custom';
    } else {
      cfg.difficulty = difficulty;
      delete cfg.custom;
    }
    
    setSafeStorage('minesweeper-config', JSON.stringify(cfg));
    originalSetDifficulty(difficulty);
    ui.updateDifficultyCheckmarks(difficulty);
  };
  
  // Установка custom конфига
  const originalSetDifficultyFromConfig = ui.setDifficultyFromConfig.bind(ui);
  ui.setDifficultyFromConfig = function(config) {
    const standard = getStandardDifficulty(config);
    if (standard) {
      ui.setDifficulty(standard);
    } else {
      // Для custom режима обновляем только доску
      ui.boardWidth = config.width;
      ui.boardHeight = config.height;
      game.setConfig(config);
      ui.updateAll();
      ui.updateDifficultyCheckmarks('custom');
    }
  };
  
  console.log('Сапёр инициализирован');
}

// Запуск при загрузке
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGame);
} else {
  initGame();
}

// Экспорт для тестов
if (typeof window !== 'undefined') {
  window.Minesweeper = Minesweeper;
  window.DIFFICULTY = DIFFICULTY;
}

export { initGame };
