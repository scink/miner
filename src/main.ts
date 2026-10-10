/**
 * Main entry point
 * Инициализация игры и UI
 */

import {
  Minesweeper,
  DIFFICULTY,
  type GameConfig,
  type GameConfigInput,
  type StandardDifficulty
} from './Game.ts';
import { UI } from './UI.ts';
import { ThemeController } from './theme.ts';
import { createTelegramBridge } from './telegram.ts';
import { initializePlatformUi } from './platform.ts';

type Difficulty = StandardDifficulty | 'custom';
type StoredConfig = Record<string, unknown>;

declare global {
  interface Window {
    Minesweeper: typeof Minesweeper;
    DIFFICULTY: typeof DIFFICULTY;
  }
}

function isRecord(value: unknown): value is StoredConfig {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStoredConfig(value: string): StoredConfig {
  const parsed: unknown = JSON.parse(value);
  return isRecord(parsed) ? parsed : {};
}

function parseStoredConfigOrEmpty(value: string): StoredConfig {
  try {
    return parseStoredConfig(value);
  } catch {
    return {};
  }
}

function toGameConfigInput(value: unknown): GameConfigInput {
  if (!isRecord(value)) {
    return { width: undefined, height: undefined, mines: undefined };
  }

  return {
    width: value.width,
    height: value.height,
    mines: value.mines
  };
}

function hasNumericGameConfig(config: GameConfigInput): config is GameConfig {
  return typeof config.width === 'number'
    && typeof config.height === 'number'
    && typeof config.mines === 'number';
}

/**
 * Безопасное чтение из localStorage
 */
function getSafeStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

/**
 * Безопасная запись в localStorage
 */
function setSafeStorage(key: string, value: string): void {
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
function getStandardDifficulty(config: GameConfigInput): StandardDifficulty | null {
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
function normalizeDifficulty(difficulty: unknown): Difficulty {
  switch (difficulty) {
    case 'beginner':
    case 'intermediate':
    case 'expert':
    case 'custom':
      return difficulty;
    default:
      return 'beginner';
  }
}

/**
 * Инициализация игры
 */
function initGame(): void {
  // Get saved config (same as original - before any UI creation)
  const savedConfig = getSafeStorage('minesweeper-config');
  let initialDifficulty: Difficulty = 'beginner';
  let customConfig: GameConfig | null = null;
  
  if (savedConfig) {
    try {
      const parsed = parseStoredConfig(savedConfig);
      if (parsed.difficulty) {
        const normalized = normalizeDifficulty(parsed.difficulty);
        if (normalized === 'custom') {
          if (parsed.custom) {
            const candidate = toGameConfigInput(parsed.custom);
            const validation = Minesweeper.validateConfig(candidate);
            if (validation.valid && hasNumericGameConfig(candidate)) {
              customConfig = candidate;
              initialDifficulty = 'custom';
            } else if (!validation.valid) {
              console.warn('Неверный сохранённый custom config, используем beginner:', validation.error);
            }
          } else {
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
  
  // Create Telegram bridge (safe no-op if SDK not available)
  const telegram = createTelegramBridge(window);
  
  // Create theme controller with proper dependencies
  const themeController = new ThemeController({
    root: document.documentElement,
    storage: {
      getItem(key: string): string | null {
        try {
          return localStorage.getItem(key);
        } catch {
          return null;
        }
      },
      setItem(key: string, value: string): void {
        try {
          localStorage.setItem(key, value);
        } catch {
          // Ignore errors
        }
      },
    },
    mediaQuery: typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : undefined,
    telegram,
  });
  
  // Platform initialization with required startup order:
  // theme.start() -> createUi() -> telegram.ready() -> telegram.expand()
  const ui = initializePlatformUi(
    themeController,
    () => {
      // Create game with default difficulty
      const game = new Minesweeper(DIFFICULTY.BEGINNER);

      // Create UI with theme controller integration
      const ui = new UI(game, themeController);

      // Set initial difficulty
      if (initialDifficulty === 'custom') {
        if (customConfig) {
          ui.setDifficultyFromConfig(customConfig);
        } else {
          ui.setInitialDifficulty('beginner');
        }
      } else {
        ui.setInitialDifficulty(initialDifficulty);
      }

      return ui;
    },
    telegram
  );

  // The UI returned by initializePlatformUi has the game accessible as ui.game.
  // Re-wire the game's setConfig to save to localStorage using ui.game.
  const originalSetConfig = ui.game.setConfig.bind(ui.game);
  ui.game.setConfig = function(config: GameConfigInput): void {
    const standard = getStandardDifficulty(config);
    const savedConfig = getSafeStorage('minesweeper-config') || '{}';
    const cfg = parseStoredConfigOrEmpty(savedConfig);
    
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
  
  // Re-wire setDifficulty to save to localStorage
  const originalSetDifficulty = ui.setDifficulty.bind(ui);
  ui.setDifficulty = function(difficulty: string): void {
    const savedConfig = getSafeStorage('minesweeper-config') || '{}';
    const cfg = parseStoredConfigOrEmpty(savedConfig);
    
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
  
  // Re-wire setDifficultyFromConfig
  const originalSetDifficultyFromConfig = ui.setDifficultyFromConfig.bind(ui);
  ui.setDifficultyFromConfig = function(config: GameConfig): void {
    const standard = getStandardDifficulty(config);
    if (standard) {
      ui.setDifficulty(standard);
    } else {
      ui.boardWidth = config.width;
      ui.boardHeight = config.height;
      ui.game.setConfig(config);
      ui.updateAll();
      ui.updateDifficultyCheckmarks('custom');
    }
  };
  
  // Global key handler for F2 (reset)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F2') {
      e.preventDefault();
      ui.resetGame();
    }
  });

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
