/**
 * Viewport manager behavioral tests
 * Tests createViewportSizeManager with DI-fakes
 */

import test from 'node:test';
import assert from 'node:assert';

import { createViewportSizeManager } from '../src/platform-viewport.ts';
import type { ViewportWindow, RootStyle } from '../src/platform-viewport.ts';

// Factory fake that is structurally compatible with ViewportWindow and RootStyle
function createFakeWindow(vvEnabled: boolean = true): {
  win: ViewportWindow;
  style: RootStyle;
  capture: {
    vvListeners: { type: string; listener: () => void }[];
    resizeListeners: { type: string; listener: () => void }[];
    styleProps: Map<string, string>;
    get vvRemoveCallCount(): number;
    get resizeRemoveCallCount(): number;
    setVisualSize(width: number, height: number): void;
    setInnerSize(width: number, height: number): void;
  };
} {
  const vvListeners: { type: string; listener: () => void }[] = [];
  const resizeListeners: { type: string; listener: () => void }[] = [];
  const styleProps = new Map<string, string>();
  let vvRemoveCallCount = 0;
  let resizeRemoveCallCount = 0;

  let vvWidth = 800;
  let vvHeight = 600;
  let innerWidthVal = 800;
  let innerHeightVal = 600;

  // Build visualViewport object with mutable width/height via closure
  const vvObj = {
    get width() { return vvWidth; },
    get height() { return vvHeight; },
    addEventListener(type: string, listener: () => void): void {
      vvListeners.push({ type, listener });
    },
    removeEventListener(type: string, listener: () => void): void {
      const idx = vvListeners.findIndex(l => l.listener === listener);
      if (idx >= 0) {
        vvListeners.splice(idx, 1);
        vvRemoveCallCount++;
      }
    },
  };

  const win: ViewportWindow = {
    get innerWidth() { return innerWidthVal; },
    get innerHeight() { return innerHeightVal; },
    visualViewport: vvEnabled ? vvObj : null,
    addEventListener(type: string, listener: () => void): void {
      if (type === 'resize') {
        resizeListeners.push({ type, listener });
      }
    },
    removeEventListener(type: string, listener: () => void): void {
      if (type === 'resize') {
        const idx = resizeListeners.findIndex(l => l.listener === listener);
        if (idx >= 0) {
          resizeListeners.splice(idx, 1);
          resizeRemoveCallCount++;
        }
      }
    },
  };

  const style: RootStyle = {
    setProperty(name: string, value: string): void {
      styleProps.set(name, value);
    },
  };

  return {
    win,
    style,
    capture: {
      vvListeners,
      resizeListeners,
      styleProps,
      get vvRemoveCallCount() { return vvRemoveCallCount; },
      get resizeRemoveCallCount() { return resizeRemoveCallCount; },
      setVisualSize(width: number, height: number): void {
        vvWidth = width;
        vvHeight = height;
      },
      setInnerSize(width: number, height: number): void {
        innerWidthVal = width;
        innerHeightVal = height;
      },
    },
  };
}

// ============== Behavioral Tests ==============

test('viewport manager - initial sync uses visualViewport dimensions', () => {
  const { win, style, capture } = createFakeWindow(true);

  const manager = createViewportSizeManager(win, style);

  // Initial sync should use visualViewport (800x600)
  assert.strictEqual(capture.styleProps.get('--app-viewport-width'), '800px');
  assert.strictEqual(capture.styleProps.get('--app-viewport-height'), '600px');

  manager.dispose();
});

test('viewport manager - visualViewport.resize listener updates CSS vars', () => {
  const { win, style, capture } = createFakeWindow(true);

  // Create fresh manager for this test
  const manager = createViewportSizeManager(win, style);

  // Mutate visualViewport dimensions (VV takes precedence)
  capture.setVisualSize(744, 744);

  // Call the captured visualViewport resize listener
  const vvListener = capture.vvListeners[0].listener;
  vvListener();

  // Check updated values
  assert.strictEqual(capture.styleProps.get('--app-viewport-width'), '744px');
  assert.strictEqual(capture.styleProps.get('--app-viewport-height'), '744px');

  manager.dispose();
});

test('viewport manager - window.resize listener updates CSS vars when VV is null (fallback)', () => {
  const { win, style, capture } = createFakeWindow(false);

  // Create fresh manager for this test
  const manager = createViewportSizeManager(win, style);

  // Mutate inner dimensions (fallback case)
  capture.setInnerSize(700, 700);

  // Call the captured window resize listener
  const windowListener = capture.resizeListeners[0].listener;
  windowListener();

  // Check updated values via fallback
  assert.strictEqual(capture.styleProps.get('--app-viewport-width'), '700px');
  assert.strictEqual(capture.styleProps.get('--app-viewport-height'), '700px');

  manager.dispose();
});

test('viewport manager - dispose removes both listeners exactly once', () => {
  const { win, style, capture } = createFakeWindow(true);

  // Create a fresh manager
  const manager = createViewportSizeManager(win, style);

  // Verify initial listener counts
  assert.strictEqual(capture.vvListeners.length, 1, 'should have 1 visualViewport listener');
  assert.strictEqual(capture.resizeListeners.length, 1, 'should have 1 window listener');

  // First dispose
  manager.dispose();

  // Verify listeners removed and removeEventListener called exactly once each
  assert.strictEqual(capture.vvListeners.length, 0, 'visualViewport listener removed');
  assert.strictEqual(capture.resizeListeners.length, 0, 'window listener removed');
  assert.strictEqual(capture.vvRemoveCallCount, 1, 'vv.removeEventListener called exactly once');
  assert.strictEqual(capture.resizeRemoveCallCount, 1, 'window.removeEventListener called exactly once');

  // Second dispose (idempotent)
  manager.dispose();

  // Counts should remain the same (no duplicate remove calls)
  assert.strictEqual(capture.vvRemoveCallCount, 1, 'vv.removeEventListener not called again');
  assert.strictEqual(capture.resizeRemoveCallCount, 1, 'window.removeEventListener not called again');
});
