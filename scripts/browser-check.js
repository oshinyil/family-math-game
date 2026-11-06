import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createApp } from '../server.js';
import { joinUrls } from '../lib/network.js';
import { calculationQuestion, DEFAULT_SETTINGS, generateDeck } from '../lib/questions.js';
import { storyQuestion } from '../lib/stories.js';
import { patternPool } from '../lib/patterns.js';

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
    assert.equal(await page.locator('#avatars button').count(), 12);
    await fits(page);
    if (name === 'Alex') await screenshot(page, 'avatar-choices.png');
    await page.getByRole('button', { name: 'octopus', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'octopus', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'penguin', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'octopus', exact: true }).getAttribute('aria-pressed'), 'false');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Avatar picker must fit narrow screens');
    await page.setViewportSize({ width: 1366, height: 657 });
    await page.getByRole('button', { name: avatar, exact: true }).click();
    await page.locator('#name').fill(name);
    await page.locator('#join-form button[type=submit]').click();
    await page.locator('#waiting-screen').waitFor();
  }
  await host.locator('#player-count').filter({ hasText: '2 ready' }).waitFor();
  await fits(alex);
  await alex.locator('#edit-profile').click();
  await fits(alex);
  await screenshot(alex, 'edit-player-profile.png');
  assert.equal(await alex.locator('#name').inputValue(), 'Alex');
  assert.equal(await alex.getByRole('button', { name: 'fox', exact: true }).getAttribute('aria-pressed'), 'true');
  const originalToken = await alex.evaluate(() => localStorage.getItem('math-token'));
  await alex.locator('#name').fill(' sam ');
  await alex.getByRole('button', { name: 'octopus', exact: true }).click();
  await alex.locator('#profile-submit').click();
  await alex.locator('#error').filter({ hasText: 'already' }).waitFor();
  assert.equal(await alex.locator('#join-screen').isVisible(), true);
  await alex.locator('#name').fill('  Alex   Explorer  ');
  await alex.locator('#profile-submit').click();
  await alex.locator('#welcome').filter({ hasText: 'Alex Explorer' }).waitFor();
  await fits(alex);
  await host.locator('#roster').filter({ hasText: 'Alex Explorer' }).waitFor();
  await sam.locator('#lobby-players').filter({ hasText: 'Alex Explorer' }).waitFor();
  assert.ok((await host.locator('#roster').textContent()).includes('🐙'));
  assert.ok((await sam.locator('#lobby-players').textContent()).includes('🐙'));
  assert.equal(await alex.evaluate(() => localStorage.getItem('math-token')), originalToken);
  assert.equal(await alex.evaluate(() => localStorage.getItem('math-name')), 'Alex Explorer');
  assert.equal(await alex.evaluate(() => localStorage.getItem('math-avatar')), 'octopus');
  await alex.reload();
  await alex.locator('#welcome').filter({ hasText: 'Alex Explorer' }).waitFor();
  await alex.locator('#edit-profile').click();
  assert.equal(await alex.locator('#name').inputValue(), 'Alex Explorer');
  assert.equal(await alex.getByRole('button', { name: 'octopus', exact: true }).getAttribute('aria-pressed'), 'true');
  await alex.locator('#name').fill('Not saved');
  await alex.getByRole('button', { name: 'cat', exact: true }).click();
  await alex.locator('#profile-cancel').click();
  await alex.locator('#welcome').filter({ hasText: 'Alex Explorer' }).waitFor();
  await alex.locator('#edit-profile').click();
  assert.equal(await alex.locator('#name').inputValue(), 'Alex Explorer');
  await alex.locator('#name').fill('Alex');
  await alex.getByRole('button', { name: 'fox', exact: true }).click();
  await alex.locator('#profile-submit').click();
  await alex.locator('#waiting-screen').waitFor();
  await host.locator('#question-count').fill('2');
  await host.locator('#question-seconds').fill('30');
  await screenshot(host, 'host-lobby.png', true);
  await host.locator('#start').click();
  await Promise.all([alex, sam].map(page => page.locator('#play-screen').waitFor()));
  assert.equal(await alex.locator('#edit-profile').isVisible(), false);
  await fits(alex);
  assert.equal(await alex.locator('#equation').textContent(), await sam.locator('#equation').textContent());
  assert.equal(await alex.locator('#play-screen input').count(), 0, 'Answers must not use a text input');
  const originalEquation = await alex.locator('#equation').textContent();
  for (const base of [
    { a: 100, b: 100, op: '+', answer: 200 },
    { a: 100, b: 99, op: '-', answer: 1 },
    { a: 25, b: 4, op: '*', answer: 100 },
    { a: 100, b: 2, op: '/', answer: 50 },
  ]) {
    for (const blank of ['a', 'b', 'result']) {
      const fixture = calculationQuestion(base, blank);
      for (const [page, selector] of [[alex, '#equation'], [host, '#host-equation']]) {
        for (const text of [fixture.text, fixture.explanation]) {
          await page.locator(selector).evaluate((element, text) => {
            element.textContent = text;
            element.classList.toggle('long', text.length > 11);
          }, text);
          await fits(page, text);
        }
        await page.locator(selector).evaluate((element, text) => {
          element.textContent = text;
          element.classList.toggle('long', text.length > 11);
        }, originalEquation);
      }
    }
  }
  await alex.locator('#equation').evaluate(element => {
    element.textContent = '25 × 4 = 100';
    element.classList.add('long');
  });
  await fits(alex);
  assert.equal(await alex.locator('#equation').evaluate(element => element.scrollWidth <= element.clientWidth), true, 'Largest multiplication reveal must fit its card');
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
  await host.locator('#player-count').filter({ hasText: '1 ready' }).waitFor();
  await host.locator('#start').click();
  await alex.locator('#play-screen').waitFor();
  await tap(alex, String(app.game.question.answer));
  await alex.locator('[data-key="submit"]').click();
  await alex.locator('#feedback').filter({ hasText: '+1 point' }).waitFor();
  assert.ok(Date.now() < app.game.deadline, 'Solo submission should reveal early');
  await host.locator('#next').click();
  await alex.locator('#final-screen').waitFor();
  for (const page of [host, alex]) {
    assert.equal(await page.locator('#winner-title').textContent(), 'Great practice, Alex!');
    assert.equal(await page.locator('#winner-title').locator('..').locator('.eyebrow').textContent(), 'Practice complete');
    assert.match(await page.locator('#winner-message').textContent(), /1 of 1 questions correctly/);
    assert.doesNotMatch(await page.locator('#final-scores').textContent(), /👑/u);
  }
  assert.equal(await host.locator('#tiebreaker').isVisible(), false);
  assert.equal(await host.locator('#tie-rules').isVisible(), false);
  await screenshot(host, 'solo-results.png', true);
  await host.locator('#play-again').click();
  await alex.locator('#play-screen').waitFor();
  assert.equal(app.game.participants.length, 1);
  assert.equal(app.game.snapshot().players[0].score, 0);
  await host.locator('#end-game').click();
  await host.locator('#host-lobby').waitFor();
  await alex.setViewportSize({ width: 1366, height: 657 });
  await host.locator('#max-number').fill('50');
  for (const op of ['+', '-', '/']) await host.locator(`input[name="op"][value="${op}"]`).uncheck();
  await host.locator('#question-count').fill('3');
  assert.match(await host.locator('#number-limit-help').textContent(), /caps each multiplication result/);
  await host.locator('#start').click();
  assert.ok(app.game.deck.every(q => q.op === '*' && q.answer <= 50));
  const calculationBlanks = [];
  for (let round = 1; round <= 3; round++) {
    await alex.locator('#round-label').filter({ hasText: `Question ${round}` }).waitFor();
    assert.equal(app.game.question.op, '*');
    assert.ok(app.game.question.answer <= 50);
    calculationBlanks.push(app.game.question.blank);
    assert.equal(await alex.locator('#equation').textContent(), app.game.question.text);
    assert.equal(await host.locator('#host-equation').textContent(), app.game.question.text);
    await fits(alex);
    await tap(alex, String(app.game.question.answer));
    await alex.locator('[data-key="submit"]').click();
    await alex.locator('#feedback').filter({ hasText: '+1 point' }).waitFor();
    assert.equal(await alex.locator('#equation').textContent(), app.game.question.explanation);
    assert.equal(await host.locator('#host-equation').textContent(), app.game.question.explanation);
    await host.locator('#next').click();
  }
  assert.deepEqual(calculationBlanks.sort(), ['a', 'b', 'result']);
  await host.locator('#host-final').waitFor();
  await host.locator('#new-game').click();
  await host.locator('#question-type').selectOption('stories');
  await host.locator('#story-steps').selectOption('mixed');
  await host.locator('#question-count').fill('2');
  await host.locator('#max-number').fill('50');
  await host.locator('#story-seconds').fill('75');
  await screenshot(host, 'story-host-setup.png', true);
  await alex.setViewportSize({ width: 1366, height: 657 });
  await host.locator('#start').click();
  await alex.locator('#question-type').filter({ hasText: 'Story' }).waitFor();
  await host.locator('#host-type').filter({ hasText: 'Story' }).waitFor();
  const storyStepCounts = [];
  const storyFixtures = [];
  for (const base of [
    { a: 49, b: 50, op: '+', answer: 99 }, { a: 100, b: 2, op: '-', answer: 98 },
    { a: 2, b: 2, op: '*', answer: 4 }, { a: 100, b: 2, op: '/', answer: 50 },
  ]) {
    for (const twoStep of [false, true]) {
      for (let index = 0; index < (twoStep ? 8 : 12); index++) {
        storyFixtures.push(storyQuestion(base, 100, twoStep, values =>
          typeof values[0] === 'function' ? values[index] : typeof values[0] === 'number' ?
            values.at(-1) : values.reduce((a, b) => a.length >= b.length ? a : b)));
      }
    }
  }
  const tabletViewports = [
    { width: 768, height: 1024 }, { width: 1024, height: 768 },
    { width: 820, height: 1180 }, { width: 1180, height: 820 },
    { width: 800, height: 600 }, { width: 600, height: 800 },
    { width: 1024, height: 600 }, { width: 360, height: 740 },
    { width: 390, height: 844 }, { width: 1366, height: 657 },
  ];
  async function checkStoryControls() {
    const originalText = await alex.locator('#equation').textContent();
    const originalReasoning = await alex.locator('#reasoning').textContent();
    const longestStories = [...storyFixtures].sort((a, b) => b.text.length - a.text.length).slice(0, 4);
    for (const viewport of tabletViewports) {
      await alex.setViewportSize(viewport);
      for (const fixture of longestStories) {
        await alex.locator('#equation').evaluate((element, text) => { element.textContent = text; }, fixture.text);
        await alex.locator('#reasoning').evaluate((element, text) => { element.textContent = text; }, fixture.explanation);
        const context = `${viewport.width}x${viewport.height}: ${fixture.text}`;
        await fits(alex, context);
        const keys = await alex.locator('#keypad').evaluate(element => [...element.querySelectorAll('button')].map(button => {
          const { x, y, width, height } = button.getBoundingClientRect();
          return { x, y, width, height };
        }));
        for (const box of keys) {
          assert.ok(box.y >= 0 && box.y + box.height <= viewport.height &&
            box.x >= 0 && box.x + box.width <= viewport.width, `Every answer key must be in view: ${context}`);
          assert.ok(box.width >= 44 && box.height >= 44, `Touch targets must remain usable: ${context}`);
        }
        const content = alex.getByRole('region', { name: 'Question and solution' });
        assert.equal(await content.getAttribute('tabindex'), '0', 'Scrollable stories must be keyboard accessible');
        assert.equal(await alex.locator('#equation').textContent(), fixture.text, 'The entire story must be preserved');
        assert.ok(await content.evaluate(element => element.clientHeight >= 80), `Story panel needs readable space: ${context}`);
        assert.equal(await content.evaluate(element => element.scrollWidth <= element.clientWidth), true, `Stories must wrap: ${context}`);
        await content.evaluate(element => { element.scrollTop = element.scrollHeight; });
        const endVisible = await content.evaluate(element => {
          const last = [...element.children].filter(child => !child.hidden).at(-1);
          return last.getBoundingClientRect().bottom <= element.getBoundingClientRect().bottom + 1;
        });
        assert.equal(endVisible, true, `The end of the story/solution must be reachable: ${context}`);
        await content.evaluate(element => { element.scrollTop = 0; });
        if (await content.evaluate(element => element.scrollHeight > element.clientHeight)) {
          await content.focus();
          await alex.keyboard.press('PageDown');
          await alex.waitForFunction(() => document.querySelector('.question-content').scrollTop > 0);
          await content.evaluate(element => { element.scrollTop = 0; });
        }
        assert.equal(await alex.locator('[data-key="submit"]').evaluate(element => {
          const box = element.getBoundingClientRect();
          return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
        }), true, `Submit must not be covered by another panel: ${context}`);
      }
      if (viewport.width === 768 || viewport.width === 1024 || viewport.width === 390) {
        await screenshot(alex, `tablet-story-${viewport.width}x${viewport.height}-${app.game.phase}.png`);
      }
      if (app.game.phase === 'question') {
        await alex.locator('[data-key="7"]').click();
        assert.equal(await alex.locator('#answer-display').textContent(), '7');
        await alex.locator('[data-key="back"]').click();
        assert.equal(await alex.locator('#answer-display').textContent(), '?');
      }
    }
    await alex.setViewportSize({ width: 1366, height: 657 });
    await alex.locator('#equation').evaluate((element, text) => { element.textContent = text; }, originalText);
    await alex.locator('#reasoning').evaluate((element, text) => { element.textContent = text; }, originalReasoning);
  }
  for (let round = 1; round <= 2; round++) {
    await alex.locator('#round-label').filter({ hasText: `Question ${round}` }).waitFor();
    assert.equal(app.game.question.type, 'story');
    assert.equal(app.game.question.op, '*');
    assert.ok(app.game.question.steps.every(step => step.answer <= 50));
    storyStepCounts.push(app.game.question.steps.length);
    assert.equal(app.game.durationMs, 75000);
    assert.equal(await alex.locator('#timer').getAttribute('aria-valuemax'), '75');
    assert.equal(await alex.locator('#question-type').textContent(), '📖 Story');
    assert.equal(await alex.locator('#equation').textContent(), app.game.question.text);
    assert.equal(await host.locator('#host-equation').textContent(), app.game.question.text);
    assert.equal(await alex.locator('#reasoning').isVisible(), false);
    const timerPercent = await alex.locator('#timer-fill').evaluate(element => parseFloat(element.style.width));
    assert.ok(timerPercent > 90 && timerPercent <= 100, 'Story timer must use story duration');
    await fits(alex);
    await fits(host);
    if (round === 1) {
      await checkStoryControls();
      const originalText = app.game.question.text;
      for (const fixture of storyFixtures) {
        for (const [page, selector] of [[alex, '#equation'], [host, '#host-equation']]) {
          await page.locator(selector).evaluate((element, text) => { element.textContent = text; }, fixture.text);
          await fits(page);
        }
      }
      await alex.locator('#equation').evaluate((element, text) => { element.textContent = text; }, originalText);
      await host.locator('#host-equation').evaluate((element, text) => { element.textContent = text; }, originalText);
      await screenshot(alex, 'player-story-question.png');
      await alex.reload();
      await alex.locator('#question-type').filter({ hasText: 'Story' }).waitFor();
      assert.equal(await alex.locator('#timer').getAttribute('aria-valuemax'), '75');
    }
    await tap(alex, String(app.game.question.answer));
    await alex.locator('[data-key="submit"]').click();
    await alex.locator('#reasoning').waitFor();
    assert.equal(await alex.locator('#reasoning').textContent(), app.game.question.explanation);
    assert.equal(await host.locator('#host-reasoning').textContent(), app.game.question.explanation);
    await fits(alex);
    await fits(host);
    if (round === 1) await checkStoryControls();
    const originalText = app.game.question.text;
    for (const [page, selector, reasoning] of [
      [alex, '#equation', '#reasoning'], [host, '#host-equation', '#host-reasoning'],
    ]) {
      for (const fixture of storyFixtures) {
        await page.locator(selector).evaluate((element, text) => { element.textContent = text; }, fixture.text);
        await page.locator(reasoning).evaluate((element, text) => { element.textContent = text; }, fixture.explanation);
        await fits(page, fixture.text);
      }
      await page.locator(selector).evaluate((element, text) => { element.textContent = text; }, originalText);
      await page.locator(reasoning).evaluate((element, text) => { element.textContent = text; }, app.game.question.explanation);
    }
    if (round === 2) await screenshot(alex, 'player-story-reveal.png');
    await host.locator('#next').click();
  }
  assert.deepEqual(storyStepCounts, [1, 2]);
  await host.locator('#host-final').waitFor();
  await host.locator('#new-game').click();
  for (const op of ['+', '-', '/']) await host.locator(`input[name="op"][value="${op}"]`).check();
  await host.locator('#question-type').selectOption('mix');
  await host.locator('#question-count').fill('3');
  await host.locator('#pattern-seconds').fill('45');
  await host.locator('#start').click();
  const mixedTypes = [];
  for (let round = 1; round <= 3; round++) {
    await alex.locator('#round-label').filter({ hasText: `Question ${round}` }).waitFor();
    mixedTypes.push(app.game.question.type);
    assert.equal(app.game.durationMs, app.game.question.type === 'story' ? 75000 :
      app.game.question.type === 'pattern' ? 45000 : 5000);
    await tap(alex, String(app.game.question.answer));
    await alex.locator('[data-key="submit"]').click();
    await alex.locator('#feedback').filter({ hasText: '+1 point' }).waitFor();
    await host.locator('#next').click();
  }
  assert.deepEqual(mixedTypes.sort(), ['calculation', 'pattern', 'story']);
  await host.locator('#host-final').waitFor();
  await host.locator('#new-game').click();
  await host.locator('#question-type').selectOption('patterns');
  await host.locator('#question-count').fill('6');
  await alex.locator('#edit-profile').click();
  await screenshot(host, 'pattern-host-setup.png', true);
  await host.locator('#start').click();
  await alex.locator('#play-screen').waitFor();
  assert.equal(await alex.locator('#join-screen').isVisible(), false, 'Starting a game must close the profile editor');
  const patternKinds = [];
  const patternRules = [];
  const patternFixtures = [...new Map(patternPool(100).map(q =>
    [`${q.rule}-${q.kind}`, q])).values()];
  for (let round = 1; round <= 6; round++) {
    await alex.locator('#round-label').filter({ hasText: `Question ${round}` }).waitFor();
    patternKinds.push(app.game.question.kind);
    patternRules.push(app.game.question.rule);
    assert.equal(await alex.locator('#question-type').textContent(), '🧩 Number pattern');
    assert.equal(await alex.locator('#equation').textContent(), app.game.question.text);
    assert.equal(await host.locator('#host-equation').textContent(), app.game.question.text);
    assert.equal(app.game.question.text.split('\n')[1].split(', ').filter(n => n === '...').length, 1);
    assert.equal(await alex.locator('#timer').getAttribute('aria-valuemax'), '45');
    assert.equal(await alex.locator('#reasoning').isVisible(), false);
    await fits(alex);
    await fits(host);
    if (round === 1) {
      for (const [page, selector] of [[alex, '#equation'], [host, '#host-equation']]) {
        for (const fixture of patternFixtures) {
          await page.locator(selector).evaluate((element, text) => { element.textContent = text; }, fixture.text);
          await fits(page, fixture.text);
        }
        await page.locator(selector).evaluate((element, text) => { element.textContent = text; }, app.game.question.text);
      }
      await screenshot(alex, 'player-pattern-question.png');
      await alex.reload();
      await alex.locator('#question-type').filter({ hasText: 'Number pattern' }).waitFor();
    }
    await tap(alex, String(app.game.question.answer));
    await alex.locator('[data-key="submit"]').click();
    await alex.locator('#reasoning').waitFor();
    assert.equal(await alex.locator('#reasoning').textContent(), app.game.question.explanation);
    const revealed = app.game.question.text.replace('...', String(app.game.question.answer));
    assert.equal(await alex.locator('#equation').textContent(), revealed);
    assert.equal(await host.locator('#host-equation').textContent(), revealed);
    if (round === 1) {
      for (const [page, selector, reasoning] of [
        [alex, '#equation', '#reasoning'], [host, '#host-equation', '#host-reasoning'],
      ]) {
        for (const fixture of patternFixtures) {
          await page.locator(selector).evaluate((element, text) => { element.textContent = text; },
            fixture.text.replace('...', String(fixture.answer)));
          await page.locator(reasoning).evaluate((element, text) => { element.textContent = text; }, fixture.explanation);
          await fits(page, fixture.text);
        }
        await page.locator(selector).evaluate((element, text) => { element.textContent = text; }, revealed);
        await page.locator(reasoning).evaluate((element, text) => { element.textContent = text; }, app.game.question.explanation);
      }
    }
    await fits(alex);
    await fits(host);
    if (round === 6) await screenshot(alex, 'player-pattern-reveal.png');
    await host.locator('#next').click();
  }
  assert.deepEqual(patternKinds, ['next', 'previous', 'missing', 'next', 'previous', 'missing']);
  assert.equal(new Set(patternRules).size, 6);
  await host.locator('#host-final').waitFor();
  await host.locator('#new-game').click();
  await host.locator('#auto-continue').check();
  await host.locator('#question-count').fill('2');
  await host.locator('#start').click();
  await alex.locator('#play-screen').waitFor();
  await tap(alex, String(app.game.question.answer));
  await alex.locator('[data-key="submit"]').click();
  await alex.locator('#answer-hint').filter({ hasText: 'Next question in 5' }).waitFor();
  await host.locator('#host-status').filter({ hasText: 'Next question in 5' }).waitFor();
  await fits(alex);
  await fits(host);
  await screenshot(alex, 'auto-continue-countdown.png');
  const advanceAt = app.game.advanceAt;
  await alex.reload();
  await alex.locator('#reasoning').waitFor();
  assert.equal(app.game.advanceAt, advanceAt);
  await alex.locator('#answer-hint').filter({ hasText: /Next question in [1-4]/ }).waitFor();
  await alex.locator('#round-label').filter({ hasText: 'Question 2' }).waitFor();
  assert.ok(Date.now() >= advanceAt, 'Server must wait five seconds before advancing');
  await tap(alex, String(app.game.question.answer));
  await alex.locator('[data-key="submit"]').click();
  await host.locator('#host-status').filter({ hasText: 'Results in 5' }).waitFor();
  await host.locator('#next').filter({ hasText: 'See results now' }).click();
  await alex.locator('#final-screen').waitFor();
  await host.locator('#new-game').click();
  await host.locator('#question-type').selectOption('stories');
  await host.locator('#start').click();
  await alex.locator('#play-screen').waitFor();
  await tap(alex, String(app.game.question.answer));
  await alex.locator('[data-key="submit"]').click();
  await alex.locator('#answer-hint').filter({ hasText: 'Next question in 5' }).waitFor();
  await fits(alex);
  await fits(host);
  await host.locator('#next').filter({ hasText: 'Next now' }).click();
  await alex.locator('#round-label').filter({ hasText: 'Question 2' }).waitFor();
  await tap(alex, String(app.game.question.answer));
  await alex.locator('[data-key="submit"]').click();
  await host.locator('#host-status').filter({ hasText: 'Results in 5' }).waitFor();
  await alex.locator('#final-screen').waitFor();
  assert.equal(app.game.phase, 'finished');
  assert.deepEqual(errors, [], 'Browser JavaScript errors');
  assert.deepEqual(externalRequests, [], 'Game assets must be entirely local');
  console.log(`Browser checks passed: lobby profile editing, multiplayer, solo, stories, patterns, mixed timers, five-second auto-continue/reconnect/skip/results, keypad, scoring, tiebreakers, QR selection, tablet portrait/landscape, 1366x657 and narrow layouts.\nScreenshots: ${output}`);
} finally {
  await browser?.close();
  await app.close();
}

async function tap(page, digits) {
  for (const digit of digits) await page.locator(`[data-key="${digit}"]`).click();
}

async function fits(page, context = '') {
  const dimensions = await page.evaluate(() => ({
    width: innerWidth, height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
  }));
  assert.ok(dimensions.scrollWidth <= dimensions.width, JSON.stringify(dimensions));
  assert.ok(dimensions.scrollHeight <= dimensions.height, `Screen must fit laptop viewport (${page.url()}): ${JSON.stringify(dimensions)} ${context}`);
}

async function screenshot(page, filename, fullPage = false) {
  await page.screenshot({ path: path.join(output, filename), fullPage });
}
