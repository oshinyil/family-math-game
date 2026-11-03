import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createApp } from '../server.js';
import { joinUrls } from '../lib/network.js';

const output = path.resolve(process.env.SCREENSHOT_DIR ?? 'artifacts');
await mkdir(output, { recursive: true });
const app = createApp();
await new Promise(resolve => app.server.listen(0, '0.0.0.0', resolve));
const hostUrl = `http://127.0.0.1:${app.server.address().port}`;
const playerUrl = joinUrls(app.server.address().port)[0] ?? hostUrl;
let browser;
const errors = [];
const externalRequests = [];
try {
  browser = await chromium.launch();
  const pages = [];
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 657 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (!request.url().startsWith(hostUrl) && !request.url().startsWith(playerUrl) && !request.url().startsWith('data:')) {
        externalRequests.push(request.url());
      }
    });
    pages.push(page);
  }
  const [host, alex, sam] = pages;
  await host.goto(`${hostUrl}/host`);
  await host.locator('#connection').filter({ hasText: 'Connected' }).waitFor();
  await host.locator('#join-urls a').first().waitFor();
  if (await host.locator('#join-address option').count() > 1) {
    const before = await host.locator('#qr').getAttribute('src');
    await host.locator('#join-address').selectOption({ index: 1 });
    assert.notEqual(await host.locator('#qr').getAttribute('src'), before);
    await host.locator('#join-address').selectOption({ index: 0 });
  }
  for (const [page, name, avatar] of [[alex, 'Alex', 'fox'], [sam, 'Sam', 'panda']]) {
    await page.goto(playerUrl);
    await page.locator('#join-screen').waitFor();
    await page.getByRole('button', { name: avatar, exact: true }).click();
    await page.locator('#name').fill(name);
    await page.locator('#join-form button[type=submit]').click();
    await page.locator('#waiting-screen').waitFor();
  }
  await host.locator('#player-count').filter({ hasText: '2 ready' }).waitFor();
  await host.locator('#question-count').fill('2');
  await host.locator('#question-seconds').fill('30');
  await screenshot(host, 'host-lobby.png', true);
  await host.locator('#start').click();
  await Promise.all([alex, sam].map(page => page.locator('#play-screen').waitFor()));
  await fits(alex);
  assert.equal(await alex.locator('#equation').textContent(), await sam.locator('#equation').textContent());
  assert.equal(await alex.locator('#play-screen input').count(), 0, 'Answers must not use a text input');
  const originalEquation = await alex.locator('#equation').textContent();
  await alex.locator('#equation').evaluate(element => {
    element.textContent = '100 × 99 = 9900';
    element.classList.add('long');
  });
  await fits(alex);
  assert.equal(await alex.locator('#equation').evaluate(element => element.scrollWidth <= element.parentElement.clientWidth - 48), true, 'Largest multiplication reveal must fit its card');
  await alex.locator('#equation').evaluate((element, text) => {
    element.textContent = text;
    element.classList.toggle('long', text.length > 11);
  }, originalEquation);
  await screenshot(alex, 'player-question.png');
  await alex.locator('[data-key="submit"]').click();
  assert.equal(await alex.locator('#answer-display').textContent(), '?');
  assert.equal(app.game.responses.size, 0, 'Empty submit must not send an answer');
  await tap(alex, '07');
  assert.equal(await alex.locator('#answer-display').textContent(), '7', 'Leading zero should be replaced');
  await alex.locator('[data-key="clear"]').click();
  await tap(alex, '12345');
  assert.equal(await alex.locator('#answer-display').textContent(), '1234', 'Four-digit limit');
  await alex.locator('[data-key="back"]').click();
  assert.equal(await alex.locator('#answer-display').textContent(), '123');
  await alex.locator('[data-key="clear"]').click();
  await tap(alex, String(app.game.question.answer));
  await alex.locator('[data-key="submit"]').click();
  await alex.locator('#answer-display').filter({ hasText: 'Locked in!' }).waitFor();
  assert.equal(await alex.locator('[data-key="1"]').isDisabled(), true);
  assert.ok((await host.locator('#game-roster').textContent()).includes('Locked in'));
  await alex.reload();
  await alex.locator('#answer-display').filter({ hasText: 'Locked in!' }).waitFor();
  await tap(sam, String(app.game.question.answer + 1));
  await sam.locator('[data-key="submit"]').click();
  await alex.locator('#feedback').filter({ hasText: '+1 point' }).waitFor();
  await fits(alex);
  assert.equal(app.game.phase, 'reveal');
  await screenshot(alex, 'player-reveal.png');
  await screenshot(host, 'host-reveal.png');
  await host.locator('#next').click();
  await alex.locator('#round-label').filter({ hasText: 'Question 2' }).waitFor();
  await sam.locator('#round-label').filter({ hasText: 'Question 2' }).waitFor();
  // The keyboard is a backup, not a requirement; exercise it for the second round.
  await alex.keyboard.type(String(app.game.question.answer + 1));
  await alex.keyboard.press('Enter');
  await tap(sam, String(app.game.question.answer));
  await sam.locator('[data-key="submit"]').click();
  await host.locator('#next').filter({ hasText: 'See the winners' }).waitFor();
  await host.locator('#next').click();
  await alex.locator('#final-screen').waitFor();
  assert.equal(app.game.winners.length, 2);
  await host.locator('#tiebreaker').click();
  await alex.locator('#round-label').filter({ hasText: 'Tiebreaker' }).waitFor();
  await sam.locator('#round-label').filter({ hasText: 'Tiebreaker' }).waitFor();
  await tap(alex, String(app.game.question.answer));
  await alex.locator('[data-key="submit"]').click();
  await tap(sam, String(app.game.question.answer));
  await sam.locator('[data-key="submit"]').click();
  await host.locator('#next').waitFor();
  await host.locator('#next').click();
  await host.locator('#host-final').waitFor();
  assert.equal(await host.locator('#winner-title').textContent(), 'Alex wins!');
  await screenshot(host, 'final-scoreboard.png');
  await host.locator('#play-again').click();
  await alex.locator('#play-screen').waitFor();
  assert.ok(app.game.snapshot().players.every(player => player.score === 0));
  await alex.setViewportSize({ width: 390, height: 844 });
  assert.equal(await alex.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Narrow screen must not scroll horizontally');
  const columns = await alex.locator('.play-layout').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  assert.equal(columns, 1, 'Narrow screens should stack the question and keypad');
  await screenshot(alex, 'player-mobile.png', true);
  host.on('dialog', dialog => dialog.accept());
  await host.locator('#end-game').click();
  await host.locator('#host-lobby').waitFor();
  await host.locator('#question-count').fill('1');
  await host.locator('#question-seconds').fill('5');
  await host.locator('#start').click();
  await sam.locator('#play-screen').waitFor();
  const timeoutAnswer = String(app.game.question.answer);
  await tap(sam, timeoutAnswer);
  await sam.waitForFunction(() => document.getElementById('timer-fill').style.background === 'rgb(245, 158, 11)');
  await sam.waitForFunction(() => document.getElementById('timer-fill').style.background === 'rgb(239, 68, 68)');
  await sam.locator('#feedback').filter({ hasText: '+1 point' }).waitFor();
  assert.equal(app.game.phase, 'reveal');
  assert.equal(app.game.snapshot().players.find(player => player.name === 'Sam').answer, timeoutAnswer);
  await sam.reload();
  await sam.locator('#feedback').filter({ hasText: '+1 point' }).waitFor();
  await host.locator('#end-game').click();
  await host.locator('#host-lobby').waitFor();
  await host.getByRole('button', { name: 'Remove Sam' }).click();
  await sam.locator('#error').filter({ hasText: 'removed' }).waitFor();
  assert.deepEqual(errors, [], 'Browser JavaScript errors');
  assert.deepEqual(externalRequests, [], 'Game assets must be entirely local');
  console.log(`Browser checks passed: host + two LAN players, keypad, keyboard, early/timeout reveal, timer colors, scoring, tie/tiebreaker, refresh, replay, removal, QR selection, 1366x657 and narrow layouts.\nScreenshots: ${output}`);
} finally {
  await browser?.close();
  await app.close();
}

async function tap(page, digits) {
  for (const digit of digits) await page.locator(`[data-key="${digit}"]`).click();
}

async function fits(page) {
  const dimensions = await page.evaluate(() => ({
    width: innerWidth, height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
  }));
  assert.ok(dimensions.scrollWidth <= dimensions.width, JSON.stringify(dimensions));
  assert.ok(dimensions.scrollHeight <= dimensions.height, `Player screen must fit laptop viewport: ${JSON.stringify(dimensions)}`);
}

async function screenshot(page, filename, fullPage = false) {
  await page.screenshot({ path: path.join(output, filename), fullPage });
}
