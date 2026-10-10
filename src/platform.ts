/**
 * Platform initialization module
 * Handles Telegram startup order and UI initialization
 */

import type { ThemeController } from './theme.ts';
import type { TelegramBridge } from './telegram.ts';

/**
 * Initialize platform UI with required startup order
 * Order: theme.start() → createUi() → telegram.ready() → telegram.expand()
 * 
 * @param theme - Theme controller with start method
 * @param createUi - Factory function that creates the UI
 * @param telegram - Telegram bridge with ready() and expand() methods
 * @returns The created UI instance
 */
export function initializePlatformUi<T>(
  theme: Pick<ThemeController, 'start'>,
  createUi: () => T,
  telegram: Pick<TelegramBridge, 'ready' | 'expand'>
): T {
  // Step 1: Start theme controller (must be first)
  theme.start();
  
  // Step 2: Create UI
  const ui = createUi();
  
  // Step 3: Call telegram.ready() (must be after UI creation)
  telegram.ready();
  
  // Step 4: Call telegram.expand() (must be after ready)
  telegram.expand();
  
  return ui;
}
