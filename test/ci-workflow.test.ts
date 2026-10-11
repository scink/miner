/**
 * CI workflow contract tests
 * Run with: node --test --test-name-pattern="CI workflow"
 */

import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CI_YAML_PATH = join(import.meta.dirname, '..', '.github', 'workflows', 'ci.yml');

test('CI workflow runs on every push only', () => {
  const content = readFileSync(CI_YAML_PATH, 'utf8');

  // Assert unfiltered push trigger
  assert.match(content, /push:\s*$/m, 'push trigger should be present without filters');

  // Assert NO pull_request trigger
  assert.doesNotMatch(content, /pull_request:\s*$/m, 'pull_request trigger should NOT be present');

  // Assert actions/checkout@v6
  assert.match(content, /actions\/checkout@v6/, 'should use actions/checkout@v6');

  // Assert actions/setup-node@v6
  assert.match(content, /actions\/setup-node@v6/, 'should use actions/setup-node@v6');

  // Assert node-version: 24
  assert.match(content, /node-version:\s*24/m, 'should use node-version 24');

  // Assert cache: npm
  assert.match(content, /cache:\s*npm/m, 'should cache npm');

  // Assert npm ci
  assert.match(content, /npm ci/, 'should run npm ci');
});

test('CI workflow installs and checks the project without a lint step', () => {
  const content = readFileSync(CI_YAML_PATH, 'utf8');

  // Assert ordered commands: npm run typecheck, npm test, npm run build
  const typecheckIndex = content.indexOf('npm run typecheck');
  const testIndex = content.indexOf('npm test');
  const buildIndex = content.indexOf('npm run build');

  assert.ok(typecheckIndex > 0, 'should contain npm run typecheck');
  assert.ok(testIndex > 0, 'should contain npm test');
  assert.ok(buildIndex > 0, 'should contain npm run build');

  assert.ok(
    typecheckIndex < testIndex && testIndex < buildIndex,
    'commands should be in order: typecheck, test, build'
  );

  // Assert NO npm run lint
  assert.equal(
    content.indexOf('npm run lint'),
    -1,
    'should NOT contain npm run lint'
  );
});
