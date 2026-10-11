# GitHub Pages and Telegram Mini App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish Minesweeper through GitHub Pages and make it adapt cleanly to Telegram Mini Apps and browser system themes without adding a backend or user identity.

**Architecture:** Vite builds the static app with a production-only `/miner/` base and GitHub Actions publishes `dist`. A small Telegram bridge isolates the optional WebApp SDK, while a separate theme controller owns the persisted `system | light | dark` preference and effective theme. `UI` only renders and cycles the theme choice; `main.ts` wires the platform services and signals Telegram after the game UI exists.

**Tech Stack:** TypeScript 7, Vite 8, Node.js 24, Node test runner, CSS, GitHub Actions, official Telegram WebApp SDK.

**Spec:** `docs/superpowers/specs/2026-10-10-github-pages-telegram-mini-app-design.md`

## Global Constraints

- Use the existing branch `feature/github-pages-telegram-mini-app`; do not create another branch or worktree.
- Use TDD for every behavior change: prove the focused test fails before editing production files, then prove it passes.
- A coder receives exactly one numbered task per turn. Alternate coder A and coder B; at most Tasks 1 and 2 may run in parallel.
- The parent reviews each task before committing. Rework for a rejected task goes back to the same coder and does not count as a new task.
- Coders must not commit, push, create PRs, merge, or change GitHub repository settings.
- Do not add ESLint, Prettier, a Telegram package, a backend, a bot token, user identity, `initData` processing, fullscreen, or vertical-swipe suppression.
- The repository visibility must not be changed automatically. The Pages site is public.
- Preserve existing mouse, touch, pause, zoom, modal, game-state, and local-storage behavior outside the specified theme migration.
- All workflows use Node.js 24 and `npm ci`.

## Review Focus

- A partial or spoofed `window.Telegram` object must degrade to a browser no-op instead of throwing — covered by Task 3 adapter tests.
- Denied or throwing `localStorage` must still produce a usable system theme and allow cycling in memory — covered by Task 4 controller tests.
- Telegram with an unknown color scheme must fall back to browser preference, then light — covered by Task 4 resolver tests.
- Telegram safe areas must not remove scrolling for expert boards, zoomed layouts, or modal bodies — covered by Task 6 CSS regression tests.
- A Pages build must reference `/miner/` assets while dev keeps `/`, and deployment must upload only `dist` — covered by Task 2 configuration tests.

---

### Task 1: Continuous Integration Workflow

**Assignment:** coder A. May run in parallel with Task 2.

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `test/ci-workflow.test.ts`

**Interfaces:**
- Consumes: existing npm scripts `typecheck`, `test`, and `build` from `package.json`.
- Produces: CI workflow triggered by every `push` and `pull_request`, using Node.js 24 and the three commands in that order.

- [ ] **Step 1: Write the failing workflow contract test**

Add Node tests named `CI workflow runs on every push and pull request` and `CI workflow installs and checks the project without a lint step`. Read `.github/workflows/ci.yml` as text and assert: unfiltered `push`, `pull_request`, `actions/checkout@v6`, `actions/setup-node@v6`, `node-version: 24`, `cache: npm`, `npm ci`, then ordered `npm run typecheck`, `npm test`, `npm run build`; reject `npm run lint`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --test-name-pattern="CI workflow"`

Expected: FAIL because `.github/workflows/ci.yml` does not exist.

- [ ] **Step 3: Add the minimal CI workflow**

Create one `checks` job on `ubuntu-latest`. Do not add branch filters, matrices, deployment, linting, or third-party actions.

- [ ] **Step 4: Run the focused and full tests**

Run: `npm test -- --test-name-pattern="CI workflow"` and then `npm test`.

Expected: focused tests and the full suite PASS.

- [ ] **Step 5: Parent review and commit**

Review triggers, action versions, exact command order, absence of lint, and `git diff --check`. After approval, the parent commits only this task's files with `ci: add project checks workflow`.

### Task 2: Pages Build and Deployment Workflow

**Assignment:** coder B. May run in parallel with Task 1.

**Files:**
- Create: `vite.config.ts`
- Create: `.github/workflows/pages.yml`
- Create: `test/pages-deployment.test.ts`

**Interfaces:**
- Consumes: Vite `defineConfig`, existing `npm run build`, repository name `miner`, default branch `master`.
- Produces: Vite config whose build base is `/miner/` and serve base is `/`; Pages workflow that uploads `dist` and exposes the deployment URL.

- [ ] **Step 1: Write failing config and workflow tests**

Test the exported Vite config function with command `build` and command `serve`, asserting `/miner/` and `/`. Read `.github/workflows/pages.yml` and assert: push limited to `master`, `workflow_dispatch`, Pages concurrency, Node.js 24, `npm ci`, `npm run build`, `actions/configure-pages@v5`, `actions/upload-pages-artifact@v4` with `path: dist`, `actions/deploy-pages@v4`, permissions `contents: read`, `pages: write`, `id-token: write`, environment `github-pages`, and the deployment URL output.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --test-name-pattern="Pages|Vite base"`

Expected: FAIL because both configuration files are absent.

- [ ] **Step 3: Implement the Vite config and Pages workflow**

Export `defineConfig(({ command }) => ({ base: command === 'build' ? '/miner/' : '/' }))`. Build and deploy may be separate jobs only if deploy explicitly `needs` build; upload only `dist`. Deployment runs only from `master` or manual dispatch.

- [ ] **Step 4: Verify tests and generated asset paths**

Run: `npm test -- --test-name-pattern="Pages|Vite base"`, `npm run build`, and `rg -n '(/miner/).*(\.js|\.css)' dist/index.html`.

Expected: tests PASS, build succeeds, and generated JS/CSS URLs begin with `/miner/`.

- [ ] **Step 5: Parent review and commit**

Review permissions, artifact path, environment, concurrency, dev base, and `git diff --check`. After approval, the parent commits only this task's files with `ci: deploy the game to GitHub Pages`.

### Task 3: Safe Telegram WebApp Bridge

**Assignment:** coder A, after Tasks 1 and 2 are reviewed.

**Files:**
- Create: `src/telegram.ts`
- Create: `test/telegram.test.ts`

**Interfaces:**
- Consumes: an optional host shaped like `Window` with optional `Telegram.WebApp`.
- Produces: `TelegramColorScheme = 'light' | 'dark'`; `TelegramBridge` with `isAvailable`, `getColorScheme(): TelegramColorScheme | null`, `onThemeChanged(listener)`, `ready()`, and `expand()`; `createTelegramBridge(host?: Window): TelegramBridge`.

- [ ] **Step 1: Write failing bridge tests**

Cover: missing SDK; `platform: 'unknown'`; valid Telegram platform; normalization of `light`, `dark`, and invalid schemes; `ready()`/`expand()` forwarding; theme subscription forwarding the current normalized scheme; returned disposer calling `offEvent`; missing optional methods; and a method that throws without escaping the bridge.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --test-name-pattern="Telegram bridge"`

Expected: FAIL because `src/telegram.ts` does not exist.

- [ ] **Step 3: Implement the bridge**

Treat a WebApp as available only when its platform is a non-empty value other than `unknown`. `getColorScheme()` returns `null` when Telegram is unavailable, reports an invalid scheme, or throws. Every SDK call is guarded by method checks and `try/catch`. `onThemeChanged` returns a no-op disposer when subscription is unavailable.

- [ ] **Step 4: Run focused tests, typecheck, and the full suite**

Run: `npm test -- --test-name-pattern="Telegram bridge"`, `npm run typecheck`, and `npm test`.

Expected: all PASS.

- [ ] **Step 5: Parent review and commit**

Review detection, exception isolation, subscription cleanup, public types, and `git diff --check`. After approval, commit with `feat: add Telegram WebApp bridge`.

### Task 4: System-Aware Theme Controller

**Assignment:** coder B, after Task 3 is committed.

**Files:**
- Create: `src/theme.ts`
- Create: `test/theme.test.ts`

**Interfaces:**
- Consumes: `TelegramBridge`; root `classList`; optional storage compatible with `getItem`/`setItem`; optional media query compatible with `matches`, `addEventListener`, and `removeEventListener`.
- Produces: `ThemePreference = 'system' | 'light' | 'dark'`; `EffectiveTheme = 'light' | 'dark'`; `ThemeControllerOptions { root, storage, mediaQuery, telegram }`; `normalizeThemePreference(value: string | null): ThemePreference`; `nextThemePreference(value: ThemePreference): ThemePreference`; `resolveEffectiveTheme(preference: ThemePreference, telegramScheme: TelegramColorScheme | null, browserPrefersDark: boolean): EffectiveTheme`; `new ThemeController(options)` with methods `start()`, `cycle()`, `getPreference()`, `getMenuLabel()`, and `destroy()`.

- [ ] **Step 1: Write failing pure-function tests**

Assert unknown or absent values normalize to `system`; the exact cycle is system/light/dark/system; menu labels are `Тема: система`, `Тема: светлая`, `Тема: тёмная`; explicit preferences override sources; system prefers a valid Telegram scheme, otherwise browser preference, otherwise light.

- [ ] **Step 2: Write failing controller tests**

With fakes, assert `start()` reads storage, applies only the `dark-theme` root class, and subscribes to both sources; events reapply only while preference is `system`; `cycle()` persists and immediately applies; throwing storage does not escape and still cycles in memory; `destroy()` removes both listeners.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `npm test -- --test-name-pattern="Theme"`

Expected: FAIL because `src/theme.ts` does not exist.

- [ ] **Step 4: Implement the theme controller**

Use storage key `minesweeper-theme`. Keep DOM mutation limited to toggling `dark-theme`; do not introduce a light-theme class. Make repeated `start()` and `destroy()` safe.

- [ ] **Step 5: Run focused tests, typecheck, and the full suite**

Run: `npm test -- --test-name-pattern="Theme"`, `npm run typecheck`, and `npm test`.

Expected: all PASS.

- [ ] **Step 6: Parent review and commit**

Review source precedence, error fallbacks, listener lifecycle, exact Russian labels, and `git diff --check`. After approval, commit with `feat: add system-aware theme controller`.

### Task 5: Tri-State Theme Menu Integration

**Assignment:** coder A, after Task 4 is committed.

**Files:**
- Modify: `src/UI.ts:21-151, 303-360, 700-720, 1680-1716`
- Modify: `test/integration.test.ts:1-70, 1580-1610`

**Interfaces:**
- Consumes: an initialized `ThemeController` passed to `new UI(game, themeController)`.
- Produces: a theme menu item stored as `themeMenuItem`, displaying `ThemeController.getMenuLabel()` and cycling with `ThemeController.cycle()` on click.

- [ ] **Step 1: Replace the old binary-theme test with failing tri-state tests**

Assert constructor/type integration, initial label from the controller, one controller cycle per theme-menu click, label refresh after the cycle, and no dependence on a `checked` class. Retain a regression assertion that the menu closes before the action executes.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- --test-name-pattern="theme action|tri-state theme"`

Expected: FAIL because `UI` still owns binary `toggleTheme(boolean)` behavior.

- [ ] **Step 3: Integrate the controller into UI**

Add a `themeController` field and constructor parameter. Rename `themeCheckbox` to `themeMenuItem`; render the current label; replace the checked-state handler with `cycle()` plus label refresh; remove `toggleTheme()` and `applyTheme()` from `UI`.

- [ ] **Step 4: Run focused tests, typecheck, and the full suite**

Run: `npm test -- --test-name-pattern="theme action|tri-state theme"`, `npm run typecheck`, and `npm test`.

Expected: all PASS and no tests still describe a binary checkbox.

- [ ] **Step 5: Parent review and commit**

Review accessibility role/text, removal of old binary logic, all `UI` call sites, and `git diff --check`. After approval, commit with `feat: add tri-state theme menu`.

### Task 6: Telegram Startup, SDK, and Safe-Area Layout

**Assignment:** coder B, after Task 5 is committed.

**Files:**
- Modify: `index.html:1-15`
- Modify: `src/main.ts:1-252`
- Modify: `src/styles.css:1-115, 480-530`
- Create: `src/platform.ts`
- Create: `test/platform-integration.test.ts`

**Interfaces:**
- Consumes: `createTelegramBridge(window)`, `ThemeController`, and `UI(game, themeController)`.
- Produces: `initializePlatformUi<T>(theme: Pick<ThemeController, 'start'>, createUi: () => T, telegram: Pick<TelegramBridge, 'ready' | 'expand'>): T`, enforcing startup order `theme.start() → createUi() → telegram.ready() → telegram.expand()`; official Telegram SDK script; viewport/safe-area CSS with browser fallbacks.

- [ ] **Step 1: Write failing startup and HTML contract tests**

Assert `index.html` loads `https://telegram.org/js/telegram-web-app.js` before `src/main.ts`. Test `initializePlatformUi()` with ordered spies to prove theme starts before UI construction and Telegram `ready()`/`expand()` run after UI construction, exactly once, and that the created UI value is returned.

- [ ] **Step 2: Write failing layout regression tests**

Assert body uses `100dvh` fallback plus `--tg-viewport-stable-height`; all four sides combine Telegram content-safe-area variables with browser `env(safe-area-inset-*)`; the narrow/coarse rules retain safe-area padding rather than resetting it to zero; body/board overflow and `.modal-body { overflow-y: auto; }` remain available; no fixed pixel height is added to `.window`.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `npm test -- --test-name-pattern="platform startup|safe-area|Telegram SDK"`

Expected: FAIL because startup wiring, script, and safe-area styles are absent.

- [ ] **Step 4: Wire startup and platform layout**

Implement `initializePlatformUi()` in `src/platform.ts`. In `main.ts`, create the default bridge and controller, then call this helper with a closure that constructs `UI`. Add the SDK script before the module script. Use Telegram CSS variables only through fallbacks so browser layout remains valid.

- [ ] **Step 5: Run focused tests and all local verification**

Run: `npm test -- --test-name-pattern="platform startup|safe-area|Telegram SDK"`, `npm run typecheck`, `npm test`, and `npm run build`.

Expected: all PASS; built `dist/index.html` contains `/miner/` local assets and the Telegram SDK URL.

- [ ] **Step 6: Parent review and commit**

Review actual initialization order, no-op browser behavior, safe-area fallback syntax, scrolling at zoom 200%, modal scrolling, and `git diff --check`. After approval, commit with `feat: adapt startup for Telegram Mini Apps`.

### Task 7: User and BotFather Documentation

**Assignment:** coder A, after Task 6 is committed.

**Files:**
- Modify: `README.md`
- Create: `test/documentation.test.ts`

**Interfaces:**
- Consumes: final Pages URL and implemented theme/platform behavior.
- Produces: user-facing documentation for the live site, theme modes, browser/Telegram behavior, and later BotFather connection.

- [ ] **Step 1: Write a failing documentation contract test**

Assert README contains `https://scink.github.io/miner/`, the three exact theme labels, the distinction between Telegram theme and browser `prefers-color-scheme`, `ready()`/`expand()` behavior, and BotFather steps for Main Mini App or Menu Button without asking for or embedding a bot token.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --test-name-pattern="README documents Pages and Telegram"`

Expected: FAIL because the deployment and Telegram sections are absent.

- [ ] **Step 3: Update README**

Add a prominent play link, deployment description, tri-state theme behavior, Telegram/browser behavior, and a concise “Подключение бота позже” section. Update stale binary dark-theme wording elsewhere in README.

- [ ] **Step 4: Run focused tests and the full suite**

Run: `npm test -- --test-name-pattern="README documents Pages and Telegram"` and `npm test`.

Expected: all PASS.

- [ ] **Step 5: Parent review and commit**

Review URL accuracy, consistency with implementation, absence of secrets, and `git diff --check`. After approval, commit with `docs: document Pages and Telegram setup`.

### Task 8: Whole-Branch Verification, Review, and Publication

**Assignment:** parent agent; no coder implementation.

**Files:**
- Verify all changed files; modify only to address reviewed defects through the coder responsible for that task.

**Interfaces:**
- Consumes: Tasks 1–7 and the approved specification.
- Produces: reviewed PR, merged `master`, enabled Pages site, green CI/deployment, and verified public URL.

- [ ] **Step 1: Run local release checks**

Run `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check`. Inspect `dist/index.html` for `/miner/` asset paths.

- [ ] **Step 2: Request whole-branch code review**

Give a fresh reviewer the spec, plan, base commit, and head commit. Return findings to the coder that owns the affected task, then repeat focused and full checks.

- [ ] **Step 3: Push and open the PR**

Push `feature/github-pages-telegram-mini-app`, create a PR into `master`, and wait for the CI workflow. Do not merge if checks fail, mergeability is not clean, or review found unresolved defects.

- [ ] **Step 4: Merge and enable Pages**

Merge the clean PR. Configure repository Pages with `build_type: workflow` through GitHub API. If GitHub rejects Pages because the private repository is unsupported by the account plan, stop and ask the user; do not change repository visibility.

- [ ] **Step 5: Verify the deployment externally**

Wait for both CI and Pages workflows to succeed. Verify `https://scink.github.io/miner/` returns HTTP 200, its referenced JS/CSS assets return HTTP 200, and the repository Pages API reports `built` with the same URL.

- [ ] **Step 6: Report handoff**

Provide the PR, merge commit, Pages deployment run, live URL, verification results, and the remaining BotFather steps. Keep the feature branch unless the user asks to delete it.
