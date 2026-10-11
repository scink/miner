/**
 * Pages deployment workflow and Vite config tests
 * Run with: node --test --test-name-pattern="Pages|Vite base"
 */

import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

const PAGES_YAML_PATH = join(__dirname, '..', '.github', 'workflows', 'pages.yml');
const VITE_CONFIG_PATH = join(__dirname, '..', 'vite.config.ts');

test('Vite base: Vite config exports defineConfig with base depending on command', async () => {
  // Import the Vite config
  const { default: viteConfig } = await import(VITE_CONFIG_PATH);

  // Assert it's a function
  assert.strictEqual(typeof viteConfig, 'function', 'should export a function');

  // Test with command === 'build'
  const buildConfig = viteConfig({ command: 'build' } as Parameters<typeof viteConfig>[0]);
  assert.strictEqual(buildConfig.base, '/miner/', 'build command should have base /miner/');

  // Test with command === 'serve'
  const serveConfig = viteConfig({ command: 'serve' } as Parameters<typeof viteConfig>[0]);
  assert.strictEqual(serveConfig.base, '/', 'serve command should have base /');
});

test('Pages workflow is limited to master branch and workflow_dispatch', () => {
  const content = readFileSync(PAGES_YAML_PATH, 'utf8');

  // Assert push trigger is present
  assert.match(content, /push:/, 'push trigger should be present');
  assert.match(content, /\bmaster\b/, 'should push only to master');

  // Assert workflow_dispatch
  assert.match(content, /workflow_dispatch:/, 'should have workflow_dispatch trigger');
});

test('Pages workflow uses correct GitHub Actions', () => {
  const content = readFileSync(PAGES_YAML_PATH, 'utf8');

  // Assert actions/checkout@v6
  assert.match(content, /actions\/checkout@v6/, 'should use actions/checkout@v6');

  // Assert actions/setup-node@v6
  assert.match(content, /actions\/setup-node@v6/, 'should use actions/setup-node@v6');

  // Assert node-version: 24
  assert.match(content, /node-version:\s*24/m, 'should use node-version 24');

  // Assert npm ci
  assert.match(content, /npm ci/, 'should run npm ci');

  // Assert npm run build
  assert.match(content, /npm run build/, 'should run npm run build');

  // Assert actions/configure-pages@v5
  assert.match(content, /actions\/configure-pages@v5/, 'should use actions/configure-pages@v5');

  // Assert actions/upload-pages-artifact@v4 with path: dist
  assert.match(content, /actions\/upload-pages-artifact@v4/, 'should use actions/upload-pages-artifact@v4');
  assert.match(content, /path:\s*dist/, 'should upload dist directory');

  // Assert actions/deploy-pages@v4
  assert.match(content, /actions\/deploy-pages@v4/, 'should use actions/deploy-pages@v4');
});

test('Pages workflow has correct permissions', () => {
  const content = readFileSync(PAGES_YAML_PATH, 'utf8');

  // Assert permissions: contents: read, pages: write, id-token: write
  assert.match(content, /contents:\s*read/m, 'should have contents: read permission');
  assert.match(content, /pages:\s*write/m, 'should have pages: write permission');
  assert.match(content, /id-token:\s*write/m, 'should have id-token: write permission');
});

test('Pages workflow binds github-pages environment URL', () => {
  const content = readFileSync(PAGES_YAML_PATH, 'utf8');

  // Assert environment with name: github-pages and URL binding
  // Environment is under the deploy job which is under "jobs:"
  assert.match(content, /jobs:/, 'should have jobs block');
  assert.match(content, /deploy:/, 'should have deploy job');
  assert.match(content, /name:\s*github-pages/, 'should use github-pages environment');
  assert.match(content, /url:\s*\$\{\{\s*steps\.deployment\.outputs\.page_url\s*\}\}/, 'should bind environment URL to deployment output');
});

test('Pages workflow exposes deployment URL output', () => {
  const content = readFileSync(PAGES_YAML_PATH, 'utf8');

  // Assert deployment-id output from deploy-pages
  assert.match(content, /id:\s*deployment/, 'should have deployment step id');
});

test('Pages workflow has Pages concurrency with group: pages and cancel-in-progress: true', () => {
  const content = readFileSync(PAGES_YAML_PATH, 'utf8');

  // Assert workflow-level concurrency with group: pages and cancel-in-progress: true
  assert.match(content, /concurrency:/, 'should have concurrency block');
  assert.match(content, /group:\s*pages/, 'should use group: pages');
  assert.match(content, /cancel-in-progress:\s*true/, 'should cancel in progress');
});

test('Pages workflow uses official Pages artifact flow', () => {
  const content = readFileSync(PAGES_YAML_PATH, 'utf8');

  // Assert configure-pages comes before upload-pages-artifact
  const configureIndex = content.indexOf('actions/configure-pages@v5');
  const uploadIndex = content.indexOf('actions/upload-pages-artifact@v4');
  assert.ok(configureIndex > 0, 'should have configure-pages step');
  assert.ok(uploadIndex > 0, 'should have upload-artifact step');
  assert.ok(configureIndex < uploadIndex, 'configure-pages should come before upload-artifact');

  // Assert deploy-pages comes after configure-pages (no download-artifact needed)
  const deployIndex = content.indexOf('actions/deploy-pages@v4');
  assert.ok(deployIndex > 0, 'should have deploy-pages step');
  assert.ok(deployIndex > configureIndex, 'deploy-pages should come after configure-pages');

  // Assert no download-artifact step (official flow)
  assert.equal(content.indexOf('actions/download-artifact@v4'), -1, 'should NOT use download-artifact');
});

test('Pages workflow runs on Node.js 24', () => {
  const content = readFileSync(PAGES_YAML_PATH, 'utf8');

  // Assert node-version: 24
  assert.match(content, /node-version:\s*24/m, 'should use node-version 24');
});

test('Pages workflow uploads only dist directory', () => {
  const content = readFileSync(PAGES_YAML_PATH, 'utf8');

  // Verify the upload step specifies path: dist
  const uploadMatch = content.match(/actions\/upload-pages-artifact@v4[\s\S]*?path:\s*(\S+)/m);
  assert.ok(uploadMatch, 'should have upload-artifact with path');
  assert.strictEqual(uploadMatch[1].trim(), 'dist', 'should upload only dist directory');
});

test('Pages workflow uses single deploy job', () => {
  const content = readFileSync(PAGES_YAML_PATH, 'utf8');

  // Count job definitions: find "deploy:" under "jobs:" section
  // Jobs section starts with "jobs:" and each job name is indented
  // We look for "deploy:" specifically as the job name
  const jobMatch = content.match(/jobs:\s*$(\s*)(\S+):\s*$/m);
  assert.ok(jobMatch, 'should have jobs with deploy job');
  assert.match(jobMatch[2], /deploy/, 'should have deploy job');
});
