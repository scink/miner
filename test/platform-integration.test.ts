/**
 * Platform integration tests for Telegram startup order and safe-area layout
 * Run with: node --test --test-name-pattern="platform startup|safe-area|Telegram SDK"
 */

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

// ============== Test Helpers ==============

// Single shared calls array for order verification
function createMockThemeController(calls: string[]): {
  start(): void;
} {
  return {
    start() {
      calls.push('theme.start');
    },
  };
}

function createMockTelegramBridge(calls: string[]): {
  ready(): void;
  expand(): void;
} {
  return {
    ready() {
      calls.push('telegram.ready');
    },
    expand() {
      calls.push('telegram.expand');
    },
  };
}

// Import the function from platform.ts
import { initializePlatformUi } from '../src/platform.ts';

// ============== Test Suite ==============

// Step 1: Test startup order and return value
test('platform startup - initializePlatformUi enforces theme.start() → createUi() → telegram.ready() → telegram.expand()', () => {
  const calls: string[] = [];
  
  const ui = initializePlatformUi(
    createMockThemeController(calls),
    () => {
      calls.push('createUi');
      return { id: 'test-ui' };
    },
    createMockTelegramBridge(calls)
  );
  
  // Verify exact order: theme.start -> createUi -> telegram.ready -> telegram.expand
  assert.deepStrictEqual(
    calls,
    ['theme.start', 'createUi', 'telegram.ready', 'telegram.expand'],
    'Startup order must be exactly: theme.start -> createUi -> telegram.ready -> telegram.expand'
  );
  
  // Verify return value identity
  assert.strictEqual(ui.id, 'test-ui', 'initializePlatformUi returns the created UI value');
});

// Step 2: Test Telegram SDK script position in index.html
test('Telegram SDK - official script appears before module script in index.html', () => {
  const htmlPath = path.join(process.cwd(), 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf-8');

  // Find positions of both scripts
  const sdkScriptMatch = htmlContent.match(/src="https:\/\/telegram\.org\/js\/telegram-web-app\.js"/);
  const moduleScriptMatch = htmlContent.match(/src="src\/main\.ts"/);

  assert.ok(sdkScriptMatch, 'Telegram SDK script should be present');
  assert.ok(moduleScriptMatch, 'Module script should be present');

  const sdkPosition = htmlContent.indexOf(sdkScriptMatch![0]);
  const modulePosition = htmlContent.indexOf(moduleScriptMatch![0]);

  assert.strictEqual(
    sdkPosition < modulePosition,
    true,
    'Telegram SDK script should appear before the module script in index.html'
  );
});

// Step 3: Test CSS safe-area layout
test('safe-area - body uses min-height: 100dvh fallback plus --tg-viewport-stable-height', () => {
  const cssPath = path.join(process.cwd(), 'src/styles.css');
  const cssContent = fs.readFileSync(cssPath, 'utf-8');
  
  // Find the body rule
  const bodyMatch = cssContent.match(/body\s*\{[^}]+\}/s);
  assert.ok(bodyMatch, 'body rule should exist');
  
  const bodyRule = bodyMatch[0];
  
  // Check for min-height: 100dvh
  assert.ok(
    bodyRule.includes('min-height: 100dvh'),
    'body should use min-height: 100dvh'
  );
  
  // Check for Telegram viewport variable
  assert.ok(
    bodyRule.includes('--tg-viewport-stable-height'),
    'body should use --tg-viewport-stable-height Telegram variable'
  );
});

test('safe-area - all four sides use Telegram content-safe-area-inset-* variables with browser env() fallbacks', () => {
  const cssPath = path.join(process.cwd(), 'src/styles.css');
  const cssContent = fs.readFileSync(cssPath, 'utf-8');
  
  // Find the body rule
  const bodyMatch = cssContent.match(/body\s*\{[^}]+\}/s);
  assert.ok(bodyMatch, 'body rule should exist');
  
  const bodyRule = bodyMatch[0];
  
  // Exact expected pattern for each side: var(--tg-content-safe-area-inset-SIDE, env(safe-area-inset-SIDE, 20px))
  const sides = ['top', 'right', 'bottom', 'left'] as const;
  
  for (const side of sides) {
    const pattern = new RegExp(
      `padding-${side}:\\s*var\\(--tg-content-safe-area-inset-${side},\\s*env\\(safe-area-inset-${side},\\s*20px\\)\\)`
    );
    assert.ok(
      cssContent.match(pattern),
      `body should use var(--tg-content-safe-area-inset-${side}, env(safe-area-inset-${side}, 20px))`
    );
  }
});

test('safe-area - narrow/coarse rules retain safe-area padding', () => {
  const cssPath = path.join(process.cwd(), 'src/styles.css');
  const cssContent = fs.readFileSync(cssPath, 'utf-8');
  
  // First, assert that NO @media block resets body padding to 0 (which would override safe-area)
  const paddingZeroPattern = /@media.*body\s*\{[^}]*padding:\s*0[^}]*\}/s;
  assert.strictEqual(
    cssContent.match(paddingZeroPattern),
    null,
    'No @media block should reset body padding to 0 (this overrides safe-area)'
  );

  // Find the @media (max-width: 768px) body rule that preserves safe-area padding
  const mediaBlockMatch = cssContent.match(/@media\s+\(max-width:\s*768px\)\s*\{[^}]*body\s*\{[^}]*padding-left[^}]*\}/s);
  
  assert.ok(
    mediaBlockMatch,
    'narrow viewport body should retain padding-left with safe-area env() fallbacks'
  );
  
  // Verify that padding is NOT simply reset to 0
  // Check that we use var() with env() fallbacks for safe-area
  const safeAreaPattern = /padding-left:\s*var\(--tg-content-safe-area-inset-left,\s*env\(safe-area-inset-left,\s*20px\)\)/;
  assert.ok(
    cssContent.match(safeAreaPattern),
    'narrow viewport should use var(--tg-content-safe-area-inset-left, env(safe-area-inset-left, 20px))'
  );
});

test('safe-area - body/board overflow and .modal-body { overflow-y: auto; } remain available', () => {
  const cssPath = path.join(process.cwd(), 'src/styles.css');
  const cssContent = fs.readFileSync(cssPath, 'utf-8');
  
  // Check that body has overflow: auto for zoom scrolling
  const bodyMatch = cssContent.match(/body\s*\{[^}]+\}/s);
  assert.ok(bodyMatch, 'body rule should exist');
  const bodyRule = bodyMatch[0];
  assert.ok(
    bodyRule.includes('overflow: auto'),
    'body should have overflow: auto for zoom scrolling'
  );
  
  // Check that board-area has overflow: auto
  const boardAreaMatch = cssContent.match(/\.board-area\s*\{[^}]*overflow:\s*auto[^}]*\}/s);
  assert.ok(boardAreaMatch, '.board-area should have overflow: auto');
  
  // Check that .modal-body has overflow-y: auto
  const modalBodyMatch = cssContent.match(/\.modal-body\s*\{[^}]*overflow-y:\s*auto[^}]*\}/s);
  assert.ok(modalBodyMatch, '.modal-body should have overflow-y: auto');
});

test('safe-area - no fixed pixel height added to .window', () => {
  const cssPath = path.join(process.cwd(), 'src/styles.css');
  const cssContent = fs.readFileSync(cssPath, 'utf-8');
  
  // Find .window rule
  const windowMatch = cssContent.match(/\.window\s*\{[^}]+\}/s);
  assert.ok(windowMatch, '.window rule should exist');
  
  const windowRule = windowMatch[0];
  // Should not contain height: followed by a pixel value
  assert.ok(
    !windowRule.match(/height\s*:\s*\d+px/),
    '.window should not have fixed pixel height'
  );
});
