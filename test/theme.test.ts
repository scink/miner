/**
 * Theme Controller tests
 * Run with: node --test --test-name-pattern="Theme"
 */

import test from 'node:test';
import assert from 'node:assert';

// Import the theme module
import {
  normalizeThemePreference,
  nextThemePreference,
  resolveEffectiveTheme,
  getMenuLabel,
  ThemeController,
  type ThemePreference,
  type EffectiveTheme,
  type ThemeControllerOptions,
} from '../src/theme.ts';

// Import Telegram types
import type { TelegramColorScheme, TelegramBridge } from '../src/telegram.ts';

// Types for test fakes
interface FakeStorage {
  store: Record<string, string>;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  throwOnGet?: boolean;
  throwOnSet?: boolean;
}

interface FakeMediaQuery {
  matches: boolean;
  addEventListener(type: string, listener: (event: { matches: boolean }) => void): void;
  removeEventListener(type: string, listener: (event: { matches: boolean }) => void): void;
  capturedListener?: (event: { matches: boolean }) => void;
  listenerCount: number;
}

interface FakeRoot {
  classList: {
    value: string[];
    add(cls: string): void;
    remove(cls: string): void;
    contains(cls: string): boolean;
    addCallCount: number;
    removeCallCount: number;
  };
}

interface FakeTelegram {
  isAvailable: boolean;
  getColorScheme(): TelegramColorScheme | null;
  onThemeChanged(listener: (scheme: TelegramColorScheme | null) => void): () => void;
  ready(): void;
  expand(): void;
  scheme: TelegramColorScheme | null;
  listener?: (scheme: TelegramColorScheme | null) => void;
  subscriptionCount: number;
}

// Fakes for testing
function createFakeTelegram(
  overrides: Partial<FakeTelegram> = {}
): FakeTelegram {
  const tg: FakeTelegram = {
    isAvailable: false,
    scheme: null,
    subscriptionCount: 0,
    getColorScheme: () => tg.scheme,
    onThemeChanged: (listener: (scheme: TelegramColorScheme | null) => void): () => void => {
      tg.listener = listener;
      tg.subscriptionCount++;
      return () => {
        if (tg.listener === listener) {
          tg.listener = undefined;
          tg.subscriptionCount--;
        }
      };
    },
    ready: () => {},
    expand: () => {},
    ...overrides,
  };
  return tg;
}

function createFakeStorage(
  overrides: Partial<FakeStorage> = {}
): FakeStorage {
  const store = overrides.store || {};
  const storage: FakeStorage = {
    store,
    getItem: (key: string): string | null => {
      if (storage.throwOnGet) {
        throw new Error('Storage getItem error');
      }
      return key in store ? store[key] : null;
    },
    setItem: (key: string, value: string): void => {
      if (storage.throwOnSet) {
        throw new Error('Storage setItem error');
      }
      store[key] = value;
    },
    ...overrides,
  };
  return storage;
}

function createFakeMediaQuery(
  overrides: Partial<FakeMediaQuery> = {}
): FakeMediaQuery {
  const mq: FakeMediaQuery = {
    matches: false,
    listenerCount: 0,
    capturedListener: undefined,
    addEventListener: (_type: string, listener: (event: { matches: boolean }) => void): void => {
      mq.capturedListener = listener;
      mq.listenerCount++;
    },
    removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void): void => {
      if (mq.capturedListener === listener) {
        mq.capturedListener = undefined;
      }
      if (mq.listenerCount > 0) {
        mq.listenerCount--;
      }
    },
    ...overrides,
  };
  return mq;
}

function createFakeRoot(
  overrides: Partial<FakeRoot> = {}
): FakeRoot {
  const classList = {
    value: [] as string[],
    addCallCount: 0,
    removeCallCount: 0,
    add(cls: string): void {
      classList.addCallCount++;
      if (!classList.value.includes(cls)) {
        classList.value.push(cls);
      }
    },
    remove(cls: string): void {
      classList.removeCallCount++;
      if (classList.value.includes(cls)) {
        classList.value = classList.value.filter(c => c !== cls);
      }
    },
    contains(cls: string): boolean {
      return classList.value.includes(cls);
    },
  };
  return {
    classList,
    ...overrides,
  };
}

// Helper: create ThemeController with fakes
function createController(
  options: Partial<ThemeControllerOptions> & { root: FakeRoot }
): ThemeController {
  const root = options.root;
  const storage = options.storage as FakeStorage | undefined;
  const mediaQuery = options.mediaQuery as FakeMediaQuery | undefined;
  const telegram = options.telegram as FakeTelegram;
  
  return new ThemeController({
    root,
    storage,
    mediaQuery,
    telegram,
  });
}

// Pure function tests
test('Theme - normalizeThemePreference', () => {
  // Unknown or absent values normalize to 'system'
  assert.strictEqual(normalizeThemePreference(null), 'system', 'null normalizes to system');
  assert.strictEqual(normalizeThemePreference(''), 'system', 'empty string normalizes to system');
  assert.strictEqual(normalizeThemePreference('invalid'), 'system', 'invalid string normalizes to system');
  assert.strictEqual(normalizeThemePreference(' '), 'system', 'whitespace normalizes to system');

  // Valid values preserved
  assert.strictEqual(normalizeThemePreference('system'), 'system', 'system preserved');
  assert.strictEqual(normalizeThemePreference('light'), 'light', 'light preserved');
  assert.strictEqual(normalizeThemePreference('dark'), 'dark', 'dark preserved');
});

test('Theme - nextThemePreference', () => {
  // Exact cycle: system/light/dark/system
  assert.strictEqual(nextThemePreference('system'), 'light', 'system -> light');
  assert.strictEqual(nextThemePreference('light'), 'dark', 'light -> dark');
  assert.strictEqual(nextThemePreference('dark'), 'system', 'dark -> system');
});

test('Theme - getMenuLabel', () => {
  // Exact Russian labels
  assert.strictEqual(getMenuLabel('system'), 'Тема: система', 'system label');
  assert.strictEqual(getMenuLabel('light'), 'Тема: светлая', 'light label');
  assert.strictEqual(getMenuLabel('dark'), 'Тема: тёмная', 'dark label');
});

test('Theme - resolveEffectiveTheme', () => {
  // Explicit preferences override sources
  // system: prefers valid Telegram scheme, then browser, then light
  assert.strictEqual(
    resolveEffectiveTheme('system', 'dark', false),
    'dark',
    'system with Telegram dark scheme'
  );
  assert.strictEqual(
    resolveEffectiveTheme('system', 'light', true),
    'light',
    'system with Telegram light scheme'
  );
  
  // system: null Telegram falls back to browser
  assert.strictEqual(
    resolveEffectiveTheme('system', null, true),
    'dark',
    'system with null Telegram, browser prefers dark'
  );
  assert.strictEqual(
    resolveEffectiveTheme('system', null, false),
    'light',
    'system with null Telegram, browser prefers light'
  );

  // light/dark explicit always override
  assert.strictEqual(
    resolveEffectiveTheme('light', 'dark', true),
    'light',
    'light explicit overrides Telegram dark'
  );
  assert.strictEqual(
    resolveEffectiveTheme('dark', null, false),
    'dark',
    'dark explicit overrides browser light'
  );
});

// Controller tests
test('Theme - ThemeController start() reads storage and applies dark-theme class', () => {
  const storage = createFakeStorage({ store: { 'minesweeper-theme': 'dark' } });
  const root = createFakeRoot();
  const telegram = createFakeTelegram({ isAvailable: false });
  const mediaQuery = createFakeMediaQuery({ matches: false });

  const controller = createController({ root, storage, mediaQuery, telegram });
  controller.start();

  assert.strictEqual(root.classList.contains('dark-theme'), true, 'dark-theme class applied');
  assert.strictEqual(storage.store['minesweeper-theme'], 'dark', 'storage read');
});

test('Theme - ThemeController start() with light preference', () => {
  const storage = createFakeStorage({ store: { 'minesweeper-theme': 'light' } });
  const root = createFakeRoot();
  const telegram = createFakeTelegram({ isAvailable: false });
  const mediaQuery = createFakeMediaQuery({ matches: true });

  const controller = createController({ root, storage, mediaQuery, telegram });
  controller.start();

  assert.strictEqual(root.classList.contains('dark-theme'), false, 'dark-theme class not applied');
  assert.strictEqual(root.classList.contains('light-theme'), false, 'light-theme class never added');
});

test('Theme - ThemeController start() with system preference and Telegram dark', () => {
  const storage = createFakeStorage({ store: { 'minesweeper-theme': 'system' } });
  const root = createFakeRoot();
  const telegram = createFakeTelegram({ isAvailable: true, scheme: 'dark' });
  const mediaQuery = createFakeMediaQuery({ matches: false });

  const controller = createController({ root, storage, mediaQuery, telegram });
  controller.start();

  assert.strictEqual(root.classList.contains('dark-theme'), true, 'dark-theme class applied from Telegram');
});

test('Theme - ThemeController start() subscribes to Telegram and media query', () => {
  const storage = createFakeStorage({ store: { 'minesweeper-theme': 'system' } });
  const root = createFakeRoot();
  const telegram = createFakeTelegram({ isAvailable: true });
  const mediaQuery = createFakeMediaQuery();

  const controller = createController({ root, storage, mediaQuery, telegram });
  controller.start();

  // Verify listeners were registered
  assert.ok(mediaQuery.capturedListener, 'mediaQuery listener registered');
  assert.ok(telegram.listener, 'Telegram listener registered');
});

test('Theme - ThemeController system preference reapplies on Telegram event (mutating Telegram fake)', () => {
  const storage = createFakeStorage({ store: { 'minesweeper-theme': 'system' } });
  const root = createFakeRoot();
  const telegram = createFakeTelegram({ isAvailable: true, scheme: 'light' });
  const mediaQuery = createFakeMediaQuery({ matches: false });

  const controller = createController({ root, storage, mediaQuery, telegram });
  controller.start();

  // Initially light (Telegram scheme is light), so dark-theme should not be present
  assert.strictEqual(root.classList.contains('dark-theme'), false, 'initial: dark-theme not applied');

  // Mutate Telegram fake to return dark
  telegram.scheme = 'dark';

  // Invoke the Telegram listener (simulating themeChanged event)
  if (telegram.listener) {
    telegram.listener('dark');
  }

  // Now dark-theme should be applied
  assert.strictEqual(root.classList.contains('dark-theme'), true, 'dark-theme applied after Telegram event');
});

test('Theme - ThemeController manual mode ignores source events', () => {
  const storage = createFakeStorage({ store: { 'minesweeper-theme': 'dark' } });
  const root = createFakeRoot();
  const telegram = createFakeTelegram({ isAvailable: true, scheme: 'light' });
  const mediaQuery = createFakeMediaQuery({ matches: true });

  const controller = createController({ root, storage, mediaQuery, telegram });
  controller.start();

  // Snapshot counters after start
  const initialAddCount = root.classList.addCallCount;
  const initialRemoveCount = root.classList.removeCallCount;

  // dark explicit should override both sources
  assert.strictEqual(root.classList.contains('dark-theme'), true, 'dark explicit overrides Telegram');

  // Mutate Telegram to dark and invoke listener
  telegram.scheme = 'dark';
  if (telegram.listener) {
    telegram.listener('dark');
  }
  // Still dark (explicit mode) - counters should be unchanged
  assert.strictEqual(root.classList.contains('dark-theme'), true, 'still dark after Telegram event');
  assert.strictEqual(root.classList.addCallCount, initialAddCount, 'no add calls from Telegram event');
  assert.strictEqual(root.classList.removeCallCount, initialRemoveCount, 'no remove calls from Telegram event');

  // Mutate media query and invoke listener
  mediaQuery.matches = false;
  if (mediaQuery.capturedListener) {
    mediaQuery.capturedListener({ matches: false });
  }
  // Still dark (explicit mode) - counters should be unchanged
  assert.strictEqual(root.classList.contains('dark-theme'), true, 'still dark after media query event');
  assert.strictEqual(root.classList.addCallCount, initialAddCount, 'no add calls from media query event');
  assert.strictEqual(root.classList.removeCallCount, initialRemoveCount, 'no remove calls from media query event');
});

test('Theme - ThemeController cycle() persists and immediately applies', () => {
  const storage = createFakeStorage({ store: { 'minesweeper-theme': 'system' } });
  const root = createFakeRoot();
  const telegram = createFakeTelegram({ isAvailable: false });
  const mediaQuery = createFakeMediaQuery({ matches: false });

  const controller = createController({ root, storage, mediaQuery, telegram });
  controller.start();

  // Initial: system -> no Telegram -> no media query -> light
  assert.strictEqual(root.classList.contains('dark-theme'), false, 'initial: light');

  // Cycle to light (system -> light)
  controller.cycle();

  // Verify storage was updated
  assert.strictEqual(storage.store['minesweeper-theme'], 'light', 'storage updated to light');
  assert.strictEqual(root.classList.contains('dark-theme'), false, 'dark-theme not applied in light mode');

  // Cycle to dark (light -> dark)
  controller.cycle();
  assert.strictEqual(storage.store['minesweeper-theme'], 'dark', 'storage updated to dark');
  assert.strictEqual(root.classList.contains('dark-theme'), true, 'dark-theme applied in dark mode');

  // Cycle back to system (dark -> system)
  controller.cycle();
  assert.strictEqual(storage.store['minesweeper-theme'], 'system', 'storage updated to system');
  // Back to system: no Telegram -> no media query -> light
  assert.strictEqual(root.classList.contains('dark-theme'), false, 'back to light from system');
});

test('Theme - ThemeController cycle() in system mode applies Telegram if available', () => {
  const storage = createFakeStorage({ store: { 'minesweeper-theme': 'system' } });
  const root = createFakeRoot();
  const telegram = createFakeTelegram({ isAvailable: true, scheme: 'dark' });
  const mediaQuery = createFakeMediaQuery({ matches: false });

  const controller = createController({ root, storage, mediaQuery, telegram });
  controller.start();

  // Initially dark from Telegram
  assert.strictEqual(root.classList.contains('dark-theme'), true, 'initial: dark from Telegram');

  // Cycle to light
  controller.cycle();
  assert.strictEqual(storage.store['minesweeper-theme'], 'light', 'storage updated to light');
  assert.strictEqual(root.classList.contains('dark-theme'), false, 'dark-theme removed');
});

test('Theme - ThemeController throwing storage setItem does not escape and cycles in memory', () => {
  const storage = createFakeStorage({ store: { 'minesweeper-theme': 'dark' }, throwOnSet: true });
  const root = createFakeRoot();
  const telegram = createFakeTelegram({ isAvailable: false });
  const mediaQuery = createFakeMediaQuery({ matches: false });

  const controller = createController({ root, storage, mediaQuery, telegram });
  controller.start();

  // Should not throw
  assert.doesNotThrow(() => {
    controller.cycle();
  }, 'cycle should not throw on storage setItem error');

  // Verify cycle happened in memory (dark -> system)
  assert.strictEqual(controller.getPreference(), 'system', 'preference cycled in memory');
});

test('Theme - ThemeController throwing storage getItem does not escape and uses default system', () => {
  const storage = createFakeStorage({ throwOnGet: true });
  const root = createFakeRoot();
  const telegram = createFakeTelegram({ isAvailable: false });
  const mediaQuery = createFakeMediaQuery({ matches: false });

  const controller = createController({ root, storage, mediaQuery, telegram });
  controller.start();

  // Should not throw, uses default 'system'
  assert.strictEqual(controller.getPreference(), 'system', 'preference defaults to system on getItem error');

  // Cycle should still work in memory
  controller.cycle();
  assert.strictEqual(controller.getPreference(), 'light', 'can cycle after getItem error');
});

test('Theme - ThemeController destroy() removes both listeners', () => {
  const storage = createFakeStorage({ store: { 'minesweeper-theme': 'system' } });
  const root = createFakeRoot();
  const telegram = createFakeTelegram({ isAvailable: true });
  const mediaQuery = createFakeMediaQuery();

  const controller = createController({ root, storage, mediaQuery, telegram });
  controller.start();

  // Verify listeners were added
  assert.ok(telegram.listener, 'Telegram listener registered');
  assert.ok(mediaQuery.capturedListener, 'mediaQuery listener registered');

  // Destroy
  controller.destroy();

  // Verify listeners were removed
  assert.strictEqual(telegram.listener, undefined, 'Telegram listener removed');
  assert.strictEqual(mediaQuery.capturedListener, undefined, 'mediaQuery listener removed');
});

test('Theme - ThemeController start() idempotent without duplicate listeners', () => {
  const storage = createFakeStorage({ store: { 'minesweeper-theme': 'system' } });
  const root = createFakeRoot();
  const telegram = createFakeTelegram({ isAvailable: true });
  const mediaQuery = createFakeMediaQuery();

  const controller = createController({ root, storage, mediaQuery, telegram });
  controller.start();
  controller.start(); // Second start
  controller.start(); // Third start

  // Verify exactly one listener each (no duplicates)
  // Telegram subscription: onThemeChanged is called once, subscriptionCount stays 1
  // Media query: addEventListener is called once, listenerCount is 1
  assert.ok(telegram.listener, 'Telegram listener present');
  assert.strictEqual(telegram.subscriptionCount, 1, 'Telegram subscription count exactly 1');
  assert.strictEqual(mediaQuery.listenerCount, 1, 'mediaQuery listener count exactly 1');
});

test('Theme - ThemeController destroy() idempotent', () => {
  const storage = createFakeStorage({ store: { 'minesweeper-theme': 'system' } });
  const root = createFakeRoot();
  const telegram = createFakeTelegram({ isAvailable: false });
  const mediaQuery = createFakeMediaQuery({ matches: false });

  const controller = createController({ root, storage, mediaQuery, telegram });
  controller.start();
  controller.destroy();
  
  // Should not throw on second destroy
  assert.doesNotThrow(() => {
    controller.destroy();
  }, 'destroy should be idempotent');
});

test('Theme - ThemeController getPreference() returns current preference', () => {
  const storage = createFakeStorage({ store: { 'minesweeper-theme': 'dark' } });
  const root = createFakeRoot();
  const telegram = createFakeTelegram({ isAvailable: false });
  const mediaQuery = createFakeMediaQuery({ matches: false });

  const controller = createController({ root, storage, mediaQuery, telegram });
  controller.start();
  assert.strictEqual(controller.getPreference(), 'dark', 'getPreference returns stored value');
});

test('Theme - ThemeController getMenuLabel() returns correct label', () => {
  const storage = createFakeStorage({ store: { 'minesweeper-theme': 'system' } });
  const root = createFakeRoot();
  const telegram = createFakeTelegram({ isAvailable: false });
  const mediaQuery = createFakeMediaQuery({ matches: false });

  const controller = createController({ root, storage, mediaQuery, telegram });
  controller.start();
  assert.strictEqual(controller.getMenuLabel(), 'Тема: система', 'getMenuLabel returns system label');

  controller.cycle(); // -> light
  assert.strictEqual(controller.getMenuLabel(), 'Тема: светлая', 'getMenuLabel returns light label');

  controller.cycle(); // -> dark
  assert.strictEqual(controller.getMenuLabel(), 'Тема: тёмная', 'getMenuLabel returns dark label');
});

test('Theme - ThemeController system mode media query event reapplies theme', () => {
  const storage = createFakeStorage({ store: { 'minesweeper-theme': 'system' } });
  const root = createFakeRoot();
  const telegram = createFakeTelegram({ isAvailable: false });
  const mediaQuery = createFakeMediaQuery({ matches: false });

  const controller = createController({ root, storage, mediaQuery, telegram });
  controller.start();

  // Initially light (no Telegram, no media query dark)
  assert.strictEqual(root.classList.contains('dark-theme'), false, 'initial: light');

  // Mutate media query to dark
  mediaQuery.matches = true;
  
  // Invoke the media query listener
  if (mediaQuery.capturedListener) {
    mediaQuery.capturedListener({ matches: true });
  }

  // Now dark-theme should be applied
  assert.strictEqual(root.classList.contains('dark-theme'), true, 'dark-theme applied after media query event');
});

test('Theme - ThemeController system mode Telegram available with null scheme falls back to browser', () => {
  const storage = createFakeStorage({ store: { 'minesweeper-theme': 'system' } });
  const root = createFakeRoot();
  // Telegram available but returns null scheme
  const telegram = createFakeTelegram({ isAvailable: true, scheme: null });
  const mediaQuery = createFakeMediaQuery({ matches: true });

  const controller = createController({ root, storage, mediaQuery, telegram });
  controller.start();

  // Falls back to browser (dark)
  assert.strictEqual(root.classList.contains('dark-theme'), true, 'dark-theme applied via browser fallback');

  // Mutate browser to light
  mediaQuery.matches = false;
  if (mediaQuery.capturedListener) {
    mediaQuery.capturedListener({ matches: false });
  }

  // Now falls back to light (default when no sources)
  assert.strictEqual(root.classList.contains('dark-theme'), false, 'dark-theme removed after browser fallback to light');
});

test('Theme - ThemeController start->destroy->start creates one fresh pair without duplicates', () => {
  const storage = createFakeStorage({ store: { 'minesweeper-theme': 'system' } });
  const root = createFakeRoot();
  const telegram = createFakeTelegram({ isAvailable: true });
  const mediaQuery = createFakeMediaQuery();

  const controller = createController({ root, storage, mediaQuery, telegram });
  
  // First start
  controller.start();
  const firstTelegramListener = telegram.listener;
  const firstMediaQueryListener = mediaQuery.capturedListener;
  assert.ok(firstTelegramListener, 'first Telegram listener exists');
  assert.ok(firstMediaQueryListener, 'first mediaQuery listener exists');
  assert.strictEqual(telegram.subscriptionCount, 1, 'first Telegram subscription count is 1');
  assert.strictEqual(mediaQuery.listenerCount, 1, 'first media query listener count is 1');

  // Destroy
  controller.destroy();
  assert.strictEqual(telegram.listener, undefined, 'first Telegram listener removed');
  assert.strictEqual(telegram.subscriptionCount, 0, 'first Telegram subscription count is 0');
  assert.strictEqual(mediaQuery.capturedListener, undefined, 'first mediaQuery listener removed');
  assert.strictEqual(mediaQuery.listenerCount, 0, 'first media query listener count is 0');

  // Second start
  controller.start();
  const secondTelegramListener = telegram.listener;
  const secondMediaQueryListener = mediaQuery.capturedListener;
  assert.ok(secondTelegramListener, 'second Telegram listener exists');
  assert.ok(secondMediaQueryListener, 'second mediaQuery listener exists');
  assert.notStrictEqual(secondTelegramListener, firstTelegramListener, 'second Telegram listener is fresh');
  assert.notStrictEqual(secondMediaQueryListener, firstMediaQueryListener, 'second mediaQuery listener is fresh');
  assert.strictEqual(telegram.subscriptionCount, 1, 'second Telegram subscription count is 1 (not 2)');
  assert.strictEqual(mediaQuery.listenerCount, 1, 'second media query listener count is 1 (not 2)');

  // Destroy again
  controller.destroy();
  assert.strictEqual(telegram.listener, undefined, 'second Telegram listener removed');
  assert.strictEqual(telegram.subscriptionCount, 0, 'second Telegram subscription count is 0');
  assert.strictEqual(mediaQuery.capturedListener, undefined, 'second mediaQuery listener removed');
  assert.strictEqual(mediaQuery.listenerCount, 0, 'second media query listener count is 0');
});
