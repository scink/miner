/**
 * Documentation contract tests
 * Run with: node --test --test-name-pattern="README documents Pages and Telegram"
 */

import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

const README_PATH = join(__dirname, '..', 'README.md');

function readReadme(): string {
  return readFileSync(README_PATH, 'utf8');
}

test('README documents Pages and Telegram', () => {
  const content = readReadme();

  // Assert README contains the configured live Pages URL
  assert.match(content, /https:\/\/scink\.github\.io\/miner\//, 'should contain Pages URL');

  // Assert README contains all exact theme labels
  assert.match(content, /Тема: система/, 'should contain "Тема: система"');
  assert.match(content, /Тема: светлая/, 'should contain "Тема: светлая"');
  assert.match(content, /Тема: тёмная/, 'should contain "Тема: тёмная"');

  // Assert README contains Telegram theme vs browser prefers-color-scheme fallback
  assert.match(content, /Telegram/, 'should mention Telegram');
  assert.match(content, /prefers-color-scheme/, 'should mention browser prefers-color-scheme fallback');

  // Assert README contains ready() and expand() behavior in Telegram section
  assert.match(content, /ready\(\)/, 'should mention ready()');
  assert.match(content, /expand\(\)/, 'should mention expand()');

  // Assert README contains BotFather (separate from main Mini App/Menu Button assertions)
  assert.match(content, /BotFather/, 'should mention BotFather');

  // Assert README contains exact Main Mini App path
  assert.match(content, /\/mybots/, 'should mention /mybots for Main Mini App');
  assert.match(content, /Main Mini App/, 'should mention Main Mini App');

  // Assert README contains exact Menu Button path
  assert.match(content, /\/setmenubutton/, 'should mention /setmenubutton');
  assert.match(content, /Menu Button/, 'should mention Menu Button');

  // Assert README explicitly states no backend (public static Pages)
  assert.match(content, /без бэкенда|публичное статическое приложение GitHub Pages/, 'should state no backend');

  // Assert README does not ask for or embed a bot token (no "токен" or "token")
  assert.doesNotMatch(content, /токен|token/, 'should not mention token');

  // Assert README does not claim deployment is already live
  assert.doesNotMatch(content, /уже запущен|deployed|live\s*сайт|проверьте живого/, 'should not claim deployment is done');
});
