/**
 * Telegram WebApp bridge
 * Provides safe access to Telegram WebApp SDK with error handling
 */

export type TelegramColorScheme = 'light' | 'dark';

export interface TelegramBridge {
  isAvailable: boolean;
  getColorScheme(): TelegramColorScheme | null;
  onThemeChanged(listener: (scheme: TelegramColorScheme | null) => void): () => void;
  ready(): void;
  expand(): void;
}

interface TelegramWebApp {
  platform?: string;
  colorScheme?: string;
  ready?: () => void;
  expand?: () => void;
  onEvent?: (event: string, listener: (...args: unknown[]) => void) => void;
  offEvent?: (event: string, listener?: (...args: unknown[]) => void) => void;
}

interface Telegram {
  WebApp?: TelegramWebApp;
}

interface WindowWithTelegram {
  Telegram?: Telegram;
}

/**
 * Normalize color scheme to valid TelegramColorScheme
 * @param scheme - Raw color scheme from SDK
 * @returns 'light', 'dark', or null for invalid/missing values
 */
function normalizeColorScheme(scheme: string | undefined): TelegramColorScheme | null {
  if (scheme === 'light') {
    return 'light';
  }
  if (scheme === 'dark') {
    return 'dark';
  }
  // Return null for invalid/empty/undefined values
  return null;
}

/**
 * Safely check if WebApp is available - catches all getter throws
 * @param webApp - Telegram WebApp instance
 * @returns true if platform is valid, false otherwise
 */
function isWebAppAvailableSafe(webApp: TelegramWebApp | undefined): boolean {
  try {
    if (!webApp?.platform) {
      return false;
    }
    const platform = webApp.platform.trim();
    return platform.length > 0 && platform !== 'unknown';
  } catch {
    return false;
  }
}

/**
 * Safely call ready() on WebApp - catches all getter and call throws
 * @param webApp - Telegram WebApp instance
 */
function callReadySafe(webApp: TelegramWebApp): void {
  try {
    const ready = webApp.ready;
    if (typeof ready === 'function') {
      ready.call(webApp);
    }
  } catch {
    // Ignore errors from SDK
  }
}

/**
 * Safely call expand() on WebApp - catches all getter and call throws
 * @param webApp - Telegram WebApp instance
 */
function callExpandSafe(webApp: TelegramWebApp): void {
  try {
    const expand = webApp.expand;
    if (typeof expand === 'function') {
      expand.call(webApp);
    }
  } catch {
    // Ignore errors from SDK
  }
}

/**
 * Safely register themeChanged listener - catches all getter throws
 * @param webApp - Telegram WebApp instance
 * @param listener - Listener to call when theme changes
 * @returns disposer function to unregister the listener
 */
function registerThemeListenerSafe(
  webApp: TelegramWebApp,
  listener: (scheme: TelegramColorScheme | null) => void
): () => void {
  try {
    const onEvent = webApp.onEvent;
    if (typeof onEvent !== 'function') {
      return () => {};
    }

    // Create wrapper that reads current WebApp.colorScheme when event fires
    // Telegram themeChanged event has no useful color payload
    const listenerWrapper = (_data?: unknown) => {
      const scheme = getColorSchemeSafe(webApp);
      listener(scheme);
    };

    // Call onEvent with webApp as receiver to preserve receiver context
    onEvent.call(webApp, 'themeChanged', listenerWrapper);

    // Return disposer that calls offEvent
    return () => {
      try {
        webApp.offEvent?.('themeChanged', listenerWrapper);
      } catch {
        // Ignore errors in disposer
      }
    };
  } catch {
    // Return no-op disposer on error
    return () => {};
  }
}

/**
 * Safely extract WebApp from host, returning undefined if any getter throws
 * @param windowWithTelegram - Host with optional Telegram
 * @returns TelegramWebApp instance or undefined
 */
function getWebAppSafely(windowWithTelegram: WindowWithTelegram | undefined): TelegramWebApp | undefined {
  try {
    return windowWithTelegram?.Telegram?.WebApp;
  } catch {
    return undefined;
  }
}

/**
 * Get color scheme safely, returning null on error
 * @param webApp - Telegram WebApp instance
 * @returns color scheme or null
 */
function getColorSchemeSafe(webApp: TelegramWebApp): TelegramColorScheme | null {
  try {
    const scheme = webApp.colorScheme;
    return normalizeColorScheme(scheme);
  } catch {
    // Return null if getter throws
    return null;
  }
}

/**
 * Create a Telegram WebApp bridge
 * @param host - Optional host window. If omitted, uses global window (if available).
 * @returns TelegramBridge instance
 */
export function createTelegramBridge(host?: Window): TelegramBridge {
  // Use provided host or global window (safe check for browser environment)
  const windowWithTelegram = (host ?? (typeof window !== 'undefined' ? window : undefined)) as WindowWithTelegram | undefined;
  const webApp = getWebAppSafely(windowWithTelegram);

  const isAvailable = isWebAppAvailableSafe(webApp);

  return {
    isAvailable,

    getColorScheme(): TelegramColorScheme | null {
      // Return null when SDK is unavailable
      if (!isAvailable) {
        return null;
      }
      return getColorSchemeSafe(webApp!);
    },

    onThemeChanged(listener: (scheme: TelegramColorScheme | null) => void): () => void {
      // If not available, return no-op disposer
      if (!isAvailable) {
        return () => {};
      }
      return registerThemeListenerSafe(webApp!, listener);
    },

    ready(): void {
      if (!isAvailable) {
        return;
      }
      callReadySafe(webApp!);
    },

    expand(): void {
      if (!isAvailable) {
        return;
      }
      callExpandSafe(webApp!);
    },
  };
}
