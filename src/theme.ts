/**
 * Theme Controller Module
 * System-aware theme controller with Telegram and browser media query support
 */

import type { TelegramBridge, TelegramColorScheme } from './telegram.ts';

/**
 * Theme preferences
 */
export type ThemePreference = 'system' | 'light' | 'dark';

/**
 * Effective theme applied
 */
export type EffectiveTheme = 'light' | 'dark';

/**
 * Theme controller options
 */
export interface ThemeControllerOptions {
  root: {
    classList: {
      add(cls: string): void;
      remove(cls: string): void;
      contains(cls: string): boolean;
    };
  };
  storage?: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
  };
  mediaQuery?: {
    matches: boolean;
    addEventListener(type: string, listener: (event: { matches: boolean }) => void): void;
    removeEventListener(type: string, listener: (event: { matches: boolean }) => void): void;
  };
  telegram: TelegramBridge;
}

/**
 * Normalize a theme preference value to valid ThemePreference
 * @param value - Raw value from storage or external source
 * @returns Valid ThemePreference (defaults to 'system')
 */
export function normalizeThemePreference(value: string | null): ThemePreference {
  if (value === null || value === undefined) {
    return 'system';
  }
  
  const trimmed = String(value).trim().toLowerCase();
  
  if (trimmed === 'system') {
    return 'system';
  }
  if (trimmed === 'light') {
    return 'light';
  }
  if (trimmed === 'dark') {
    return 'dark';
  }
  
  return 'system';
}

/**
 * Get next theme preference in cycle
 * Cycle: system -> light -> dark -> system
 * @param current - Current theme preference
 * @returns Next theme preference
 */
export function nextThemePreference(current: ThemePreference): ThemePreference {
  if (current === 'system') {
    return 'light';
  }
  if (current === 'light') {
    return 'dark';
  }
  // dark -> system
  return 'system';
}

/**
 * Resolve effective theme based on preference and available sources
 * @param preference - User's theme preference
 * @param telegramScheme - Telegram color scheme (null if unavailable)
 * @param browserPrefersDark - Browser media query result
 * @returns Effective theme ('light' or 'dark')
 */
export function resolveEffectiveTheme(
  preference: ThemePreference,
  telegramScheme: TelegramColorScheme | null,
  browserPrefersDark: boolean
): EffectiveTheme {
  // Explicit preferences always override
  if (preference === 'light') {
    return 'light';
  }
  if (preference === 'dark') {
    return 'dark';
  }

  // system preference: prefer valid Telegram scheme
  if (preference === 'system') {
    // Telegram scheme is valid if not null
    if (telegramScheme) {
      return telegramScheme;
    }

    // Fall back to browser preference
    if (browserPrefersDark) {
      return 'dark';
    }

    // Default to light when no sources available
    return 'light';
  }

  // Fallback (should not reach here)
  return 'light';
}

/**
 * Get menu label for theme preference
 * @param preference - Theme preference
 * @returns Russian menu label
 */
export function getMenuLabel(preference: ThemePreference): string {
  if (preference === 'system') {
    return 'Тема: система';
  }
  if (preference === 'light') {
    return 'Тема: светлая';
  }
  if (preference === 'dark') {
    return 'Тема: тёмная';
  }
  // Fallback (should not reach here)
  return 'Тема: система';
}

/**
 * ThemeController class
 * Manages theme preference with Telegram and browser media query integration
 */
export class ThemeController {
  private readonly root: ThemeControllerOptions['root'];
  private readonly storage?: ThemeControllerOptions['storage'];
  private readonly mediaQuery?: ThemeControllerOptions['mediaQuery'];
  private readonly telegram: TelegramBridge;

  private preference: ThemePreference = 'system';
  private telegramDisposer?: () => void;
  private mediaQueryDisposer?: () => void;
  private isStarted = false;

  constructor(options: ThemeControllerOptions) {
    this.root = options.root;
    this.storage = options.storage;
    this.mediaQuery = options.mediaQuery;
    this.telegram = options.telegram;
  }

  /**
   * Start the theme controller
   * Reads storage, applies theme, and subscribes to sources
   */
  start(): void {
    // Avoid duplicate subscriptions
    if (this.isStarted) {
      return;
    }
    this.isStarted = true;

    // Read from storage
    try {
      const stored = this.storage?.getItem('minesweeper-theme') ?? null;
      this.preference = normalizeThemePreference(stored);
    } catch {
      // Storage read error - use default
      this.preference = 'system';
    }

    // Apply current theme
    this.applyTheme();

    // Subscribe to Telegram theme changes (only for system mode)
    this.telegramDisposer = this.telegram.onThemeChanged((_scheme) => {
      // Only reapply if preference is system
      if (this.preference === 'system') {
        this.applyTheme();
      }
    });

    // Subscribe to browser media query changes (only for system mode)
    if (this.mediaQuery) {
      const handleMediaChange = (_event: { matches: boolean }): void => {
        // Only reapply if preference is system
        if (this.preference === 'system') {
          this.applyTheme();
        }
      };
      
      this.mediaQuery.addEventListener('change', handleMediaChange);
      this.mediaQueryDisposer = (): void => {
        this.mediaQuery?.removeEventListener('change', handleMediaChange);
      };
    }
  }

  /**
   * Cycle to next theme preference and apply
   */
  cycle(): void {
    // Cycle preference
    this.preference = nextThemePreference(this.preference);

    // Persist to storage (ignore errors)
    try {
      if (this.storage) {
        this.storage.setItem('minesweeper-theme', this.preference);
      }
    } catch {
      // Storage write error - continue with in-memory cycle
    }

    // Apply new theme
    this.applyTheme();
  }

  /**
   * Get current theme preference
   * @returns Current theme preference
   */
  getPreference(): ThemePreference {
    return this.preference;
  }

  /**
   * Get menu label for current preference
   * @returns Russian menu label
   */
  getMenuLabel(): string {
    return getMenuLabel(this.preference);
  }

  /**
   * Get current effective theme (private - used internally)
   * @returns Current effective theme
   */
  private getEffectiveTheme(): EffectiveTheme {
    // Get Telegram scheme (null if unavailable or not valid)
    const telegramScheme = this.telegram.isAvailable ? this.telegram.getColorScheme() : null;

    // Get browser preference
    const browserPrefersDark = this.mediaQuery ? this.mediaQuery.matches : false;

    return resolveEffectiveTheme(this.preference, telegramScheme, browserPrefersDark);
  }

  /**
   * Apply current theme to root element
   */
  private applyTheme(): void {
    // Get effective theme
    const effectiveTheme = this.getEffectiveTheme();

    // Toggle dark-theme class only (never light-theme)
    if (effectiveTheme === 'dark') {
      this.root.classList.add('dark-theme');
    } else {
      this.root.classList.remove('dark-theme');
    }
  }

  /**
   * Destroy the controller and remove listeners
   */
  destroy(): void {
    // Prevent double destruction
    if (!this.isStarted) {
      return;
    }
    this.isStarted = false;

    // Remove Telegram listener
    if (this.telegramDisposer) {
      this.telegramDisposer();
      this.telegramDisposer = undefined;
    }

    // Remove media query listener
    if (this.mediaQueryDisposer) {
      this.mediaQueryDisposer();
      this.mediaQueryDisposer = undefined;
    }
  }
}
