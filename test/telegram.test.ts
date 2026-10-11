/**
 * Telegram WebApp bridge tests
 * Run with: node --test --test-name-pattern="Telegram bridge"
 */

import test from 'node:test';
import assert from 'node:assert';

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

function createMockWindow(webAppOverrides: Partial<TelegramWebApp> = {}): Window & WindowWithTelegram {
  return {
    Telegram: {
      WebApp: {
        platform: 'ios',
        colorScheme: 'light',
        ready: () => {},
        expand: () => {},
        onEvent: (event: string, listener: (...args: unknown[]) => void) => {
          // Mock does not return a disposer - onEvent is fire-and-forget
        },
        offEvent: () => {},
        ...webAppOverrides,
      },
    },
  } as Window & WindowWithTelegram;
}

// Import the bridge module
import type { TelegramColorScheme } from '../src/telegram.ts';
import { createTelegramBridge } from '../src/telegram.ts';

// Test helper: capture what listener receives
function captureListener<T extends (scheme: TelegramColorScheme | null) => void>(): { listener: T; captured: unknown[] } {
  const captured: unknown[] = [];
  const listener = ((scheme: TelegramColorScheme | null) => {
    captured.push(scheme);
  }) as T;
  return { listener, captured };
}

test('Telegram bridge - missing SDK', () => {
  const host = {} as Window & WindowWithTelegram;

  const bridge = createTelegramBridge(host);

  // isAvailable should be false
  assert.strictEqual(bridge.isAvailable, false, 'isAvailable should be false when SDK is missing');

  // getColorScheme should return null (never throw)
  assert.strictEqual(bridge.getColorScheme(), null, 'getColorScheme should return null when SDK is missing');

  // onThemeChanged should return no-op disposer
  const disposer = bridge.onThemeChanged(() => {});
  assert.strictEqual(typeof disposer, 'function', 'onThemeChanged should return a disposer');

  // Calling disposer should not throw
  assert.doesNotThrow(() => disposer(), 'disposer should not throw');

  // ready/expand should be no-ops
  assert.doesNotThrow(() => bridge.ready(), 'ready should be no-op when SDK missing');
  assert.doesNotThrow(() => bridge.expand(), 'expand should be no-op when SDK missing');
});

test('Telegram bridge - platform: unknown', () => {
  const host = createMockWindow({ platform: 'unknown' });

  const bridge = createTelegramBridge(host);

  assert.strictEqual(bridge.isAvailable, false, 'isAvailable should be false when platform is unknown');
  assert.strictEqual(bridge.getColorScheme(), null, 'getColorScheme should return null when platform is unknown');
});

test('Telegram bridge - valid Telegram platform', () => {
  const host = createMockWindow({ platform: 'ios' });

  const bridge = createTelegramBridge(host);

  assert.strictEqual(bridge.isAvailable, true, 'isAvailable should be true for valid platform');
});

test('Telegram bridge - colorScheme normalization (null for invalid)', () => {
  // Test 'light' normalization - returns 'light'
  {
    const host = createMockWindow({ platform: 'ios', colorScheme: 'light' });
    const bridge = createTelegramBridge(host);
    assert.strictEqual(bridge.getColorScheme(), 'light', 'light scheme should return "light"');
  }

  // Test 'dark' normalization - returns 'dark'
  {
    const host = createMockWindow({ platform: 'ios', colorScheme: 'dark' });
    const bridge = createTelegramBridge(host);
    assert.strictEqual(bridge.getColorScheme(), 'dark', 'dark scheme should return "dark"');
  }

  // Test invalid scheme normalization - returns null
  {
    const host = createMockWindow({ platform: 'ios', colorScheme: 'invalid' });
    const bridge = createTelegramBridge(host);
    assert.strictEqual(bridge.getColorScheme(), null, 'invalid scheme should return null');
  }

  // Test empty scheme normalization - returns null
  {
    const host = createMockWindow({ platform: 'ios', colorScheme: '' });
    const bridge = createTelegramBridge(host);
    assert.strictEqual(bridge.getColorScheme(), null, 'empty scheme should return null');
  }

  // Test undefined scheme normalization - returns null
  {
    const host = createMockWindow({ platform: 'ios', colorScheme: undefined });
    const bridge = createTelegramBridge(host);
    assert.strictEqual(bridge.getColorScheme(), null, 'undefined scheme should return null');
  }

  // Test missing colorScheme - returns null
  {
    const host = createMockWindow({ platform: 'ios', colorScheme: undefined });
    const bridge = createTelegramBridge(host);
    assert.strictEqual(bridge.getColorScheme(), null, 'missing colorScheme should return null');
  }
});

test('Telegram bridge - ready() forwarding', () => {
  const readyCalled: boolean[] = [];
  const host = createMockWindow({
    platform: 'ios',
    ready: () => {
      readyCalled.push(true);
    },
  });

  const bridge = createTelegramBridge(host);

  bridge.ready();
  assert.deepStrictEqual(readyCalled, [true], 'ready() should forward to SDK');
});

test('Telegram bridge - expand() forwarding', () => {
  const expandCalled: boolean[] = [];
  const host = createMockWindow({
    platform: 'ios',
    expand: () => {
      expandCalled.push(true);
    },
  });

  const bridge = createTelegramBridge(host);

  bridge.expand();
  assert.deepStrictEqual(expandCalled, [true], 'expand() should forward to SDK');
});

test('Telegram bridge - onThemeChanged subscription captures listener and reads current colorScheme', () => {
  // Track the listener passed to onEvent
  let capturedOnEventListener: ((...args: unknown[]) => void) | undefined;

  const host = createMockWindow({
    platform: 'ios',
    colorScheme: 'dark',
    onEvent: (event: string, onEventListener: (...args: unknown[]) => void) => {
      capturedOnEventListener = onEventListener;
      // Mock does not return a disposer
    },
  });

  const bridge = createTelegramBridge(host);

  const { listener, captured } = captureListener<(scheme: TelegramColorScheme | null) => void>();

  bridge.onThemeChanged(listener);

  // Assert that listener was registered
  assert.ok(capturedOnEventListener, 'onEvent should have been called with a listener');

  // Simulate themeChanged event firing (pass null as data since Telegram themeChanged event has no payload)
  capturedOnEventListener!(null);
  assert.deepStrictEqual(captured, ['dark'], 'listener should receive the current normalized scheme');
});

test('Telegram bridge - disposer calls offEvent with exact wrapper', () => {
  // Track listeners passed to onEvent and offEvent
  let capturedOnEventListener: ((...args: unknown[]) => void) | undefined;
  let capturedOffEventListener: ((...args: unknown[]) => void) | undefined;
  let capturedOnEventName: string | undefined;
  let capturedOffEventName: string | undefined;

  const host = createMockWindow({
    platform: 'ios',
    onEvent: (event: string, onEventListener: (...args: unknown[]) => void) => {
      capturedOnEventListener = onEventListener;
      capturedOnEventName = event;
      // Mock does not return a disposer
    },
    offEvent: (event: string, offEventListener?: (...args: unknown[]) => void) => {
      capturedOffEventListener = offEventListener;
      capturedOffEventName = event;
    },
  });

  const bridge = createTelegramBridge(host);

  const disposer = bridge.onThemeChanged(() => {});
  disposer();

  // Verify offEvent was called with the exact same listener as onEvent
  assert.ok(capturedOnEventListener, 'onEvent should have been called with a listener');
  assert.ok(capturedOffEventListener, 'offEvent should have been called with a listener');
  assert.strictEqual(capturedOffEventListener, capturedOnEventListener, 'offEvent should receive the exact same listener as onEvent');

  // Verify both events are exactly 'themeChanged'
  assert.strictEqual(capturedOnEventName, 'themeChanged', 'onEvent should be called with event name "themeChanged"');
  assert.strictEqual(capturedOffEventName, 'themeChanged', 'offEvent should be called with event name "themeChanged"');
});

test('Telegram bridge - onEvent preserves receiver context (this === WebApp)', () => {
  // Track the receiver context when onEvent is called
  let receiverContext: unknown;

  const host = createMockWindow({
    platform: 'ios',
    onEvent: function(this: TelegramWebApp, event: string, listener: (...args: unknown[]) => void) {
      receiverContext = this;
      // Mock does not return a disposer
    },
  });

  const bridge = createTelegramBridge(host);

  const { listener } = captureListener<(scheme: TelegramColorScheme | null) => void>();

  bridge.onThemeChanged(listener);

  // Verify that onEvent was called with webApp as receiver
  assert.ok(receiverContext, 'onEvent should have been called');
  assert.strictEqual(receiverContext, host.Telegram!.WebApp, 'onEvent should be called with webApp as receiver (this === WebApp)');
});

test('Telegram bridge - missing optional methods (ready, expand, onEvent)', () => {
  // Missing ready()
  {
    const host = createMockWindow({ platform: 'ios', ready: undefined });
    const bridge = createTelegramBridge(host);

    assert.doesNotThrow(() => {
      bridge.ready();
    }, 'ready() should not throw when SDK method is missing');
  }

  // Missing expand()
  {
    const host = createMockWindow({ platform: 'ios', expand: undefined });
    const bridge = createTelegramBridge(host);

    assert.doesNotThrow(() => {
      bridge.expand();
    }, 'expand() should not throw when SDK method is missing');
  }

  // Missing onEvent()
  {
    const host = createMockWindow({ platform: 'ios', onEvent: undefined });
    const bridge = createTelegramBridge(host);

    assert.doesNotThrow(() => {
      const disposer = bridge.onThemeChanged(() => {});
      assert.strictEqual(typeof disposer, 'function', 'onThemeChanged should return a disposer even when subscription unavailable');
    }, 'onThemeChanged should not throw when SDK method is missing');
  }
});

test('Telegram bridge - method/property getters that throw without escaping the bridge', () => {
  // Test getter that throws - use a mutable property pattern
  {
    const host = createMockWindow({ platform: 'ios', colorScheme: 'light' });

    // Replace colorScheme with a getter that throws when accessed
    Object.defineProperty(host.Telegram!.WebApp!, 'colorScheme', {
      get: () => {
        throw new Error('Intentional getter error');
      },
      configurable: true,
    });

    const bridge = createTelegramBridge(host);

    // getColorScheme should catch the error and return null
    assert.strictEqual(bridge.getColorScheme(), null, 'getColorScheme should return null when getter throws');
  }

  // ready() method that throws
  {
    const host = createMockWindow({
      platform: 'ios',
      ready: () => {
        throw new Error('Intentional ready error');
      },
    });

    const bridge = createTelegramBridge(host);

    // ready() should catch the error and not propagate
    assert.doesNotThrow(() => {
      bridge.ready();
    }, 'Bridge should catch errors from SDK ready()');
  }

  // expand() method that throws
  {
    const host = createMockWindow({
      platform: 'ios',
      expand: () => {
        throw new Error('Intentional expand error');
      },
    });

    const bridge = createTelegramBridge(host);

    assert.doesNotThrow(() => {
      bridge.expand();
    }, 'Bridge should catch errors from SDK expand()');
  }

  // Other methods should still work after getter error
  {
    const host = createMockWindow({ platform: 'ios', colorScheme: 'light' });

    // Replace colorScheme with a getter that throws when accessed
    Object.defineProperty(host.Telegram!.WebApp!, 'colorScheme', {
      get: () => {
        throw new Error('Intentional getter error');
      },
      configurable: true,
    });

    const bridge = createTelegramBridge(host);

    assert.strictEqual(bridge.getColorScheme(), null, 'Bridge should return null after getter error');
  }
});

test('Telegram bridge - available platform must be non-empty and not unknown', () => {
  // Empty string platform
  {
    const host = createMockWindow({ platform: '' });
    const bridge = createTelegramBridge(host);
    assert.strictEqual(bridge.isAvailable, false, 'Empty platform string should be unavailable');
  }

  // Whitespace-only platform
  {
    const host = createMockWindow({ platform: '   ' });
    const bridge = createTelegramBridge(host);
    assert.strictEqual(bridge.isAvailable, false, 'Whitespace-only platform should be unavailable');
  }
});

test('Telegram bridge - throwing getters during createTelegramBridge', () => {
  // Telegram.WebApp getter throws
  {
    const host = {} as Window & WindowWithTelegram;
    Object.defineProperty(host, 'Telegram', {
      get: () => {
        throw new Error('Telegram getter throws');
      },
      configurable: true,
    });

    const bridge = createTelegramBridge(host);
    assert.strictEqual(bridge.isAvailable, false, 'isAvailable should be false when Telegram getter throws');
    assert.strictEqual(bridge.getColorScheme(), null, 'getColorScheme should return null when Telegram getter throws');
  }

  // WebApp getter throws
  {
    const host = createMockWindow({ platform: 'ios' });
    Object.defineProperty(host.Telegram!, 'WebApp', {
      get: () => {
        throw new Error('WebApp getter throws');
      },
      configurable: true,
    });

    const bridge = createTelegramBridge(host);
    assert.strictEqual(bridge.isAvailable, false, 'isAvailable should be false when WebApp getter throws');
  }

  // WebApp.platform getter throws - isAvailable should still be false (safe check handles it)
  {
    const host = createMockWindow({ platform: 'ios' });
    Object.defineProperty(host.Telegram!.WebApp!, 'platform', {
      get: () => {
        throw new Error('platform getter throws');
      },
      configurable: true,
    });

    const bridge = createTelegramBridge(host);
    assert.strictEqual(bridge.isAvailable, false, 'isAvailable should be false when platform getter throws');
  }

  // WebApp.ready getter throws - bridge.ready() should catch and not propagate
  {
    const host = createMockWindow({ platform: 'ios' });
    Object.defineProperty(host.Telegram!.WebApp!, 'ready', {
      get: () => {
        throw new Error('ready getter throws');
      },
      configurable: true,
    });

    const bridge = createTelegramBridge(host);
    assert.strictEqual(bridge.isAvailable, true, 'isAvailable should be true when platform is valid');
    assert.doesNotThrow(() => {
      bridge.ready();
    }, 'Bridge should handle ready getter throwing');
  }

  // WebApp.expand getter throws - bridge.expand() should catch and not propagate
  {
    const host = createMockWindow({ platform: 'ios' });
    Object.defineProperty(host.Telegram!.WebApp!, 'expand', {
      get: () => {
        throw new Error('expand getter throws');
      },
      configurable: true,
    });

    const bridge = createTelegramBridge(host);
    assert.strictEqual(bridge.isAvailable, true, 'isAvailable should be true when platform is valid');
    assert.doesNotThrow(() => {
      bridge.expand();
    }, 'Bridge should handle expand getter throwing');
  }

  // WebApp.onEvent getter throws - onThemeChanged should handle it gracefully
  {
    const host = createMockWindow({ platform: 'ios' });
    Object.defineProperty(host.Telegram!.WebApp!, 'onEvent', {
      get: () => {
        throw new Error('onEvent getter throws');
      },
      configurable: true,
    });

    const bridge = createTelegramBridge(host);
    assert.strictEqual(bridge.isAvailable, true, 'isAvailable should be true when platform is valid');
    assert.doesNotThrow(() => {
      const disposer = bridge.onThemeChanged(() => {});
      assert.strictEqual(typeof disposer, 'function', 'onThemeChanged should return disposer');
    }, 'Bridge should handle onEvent getter throwing');
  }
});

test('Telegram bridge - invalid event state should not fabricate light (use null semantics)', () => {
  const host = createMockWindow({
    platform: 'ios',
    colorScheme: 'invalid',  // Invalid scheme should result in null
  });

  const bridge = createTelegramBridge(host);

  const { listener, captured } = captureListener<(scheme: TelegramColorScheme | null) => void>();

  // Track the listener passed to onEvent
  let capturedOnEventListener: ((...args: unknown[]) => void) | undefined;

  // Replace onEvent to capture the listener
  host.Telegram!.WebApp!.onEvent = (event: string, listener: (...args: unknown[]) => void) => {
    capturedOnEventListener = listener;
  };

  bridge.onThemeChanged(listener);

  // Assert that listener was registered
  assert.ok(capturedOnEventListener, 'onEvent should have been called with a listener');

  // When event fires with no payload, listener reads current colorScheme from WebApp
  capturedOnEventListener!(null);
  // Current colorScheme is 'invalid', which normalizes to null
  assert.deepStrictEqual(captured, [null], 'Listener should receive null for invalid colorScheme');
});

test('Telegram bridge - subscription listener receives current value when event fires with valid scheme', () => {
  const host = createMockWindow({
    platform: 'ios',
    colorScheme: 'dark',
  });

  const bridge = createTelegramBridge(host);

  const { listener, captured } = captureListener<(scheme: TelegramColorScheme | null) => void>();

  // Track the listener passed to onEvent
  let capturedOnEventListener: ((...args: unknown[]) => void) | undefined;

  // Replace onEvent to capture the listener
  host.Telegram!.WebApp!.onEvent = (event: string, listener: (...args: unknown[]) => void) => {
    capturedOnEventListener = listener;
  };

  bridge.onThemeChanged(listener);

  // Assert that listener was registered
  assert.ok(capturedOnEventListener, 'onEvent should have been called with a listener');

  // Event fires - wrapper reads colorScheme from WebApp, listener receives it
  capturedOnEventListener!(null);
  // The captured value should be 'dark' (from current WebApp.colorScheme)
  assert.deepStrictEqual(captured, ['dark'], 'Listener should receive dark scheme');
});
