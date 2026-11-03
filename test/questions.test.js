import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, generateDeck, questionPool, validateSettings } from '../lib/questions.js';
import { allowedRequest, isLoopback, isPrivate } from '../lib/network.js';

test('generator obeys arithmetic, range, uniqueness, and non-trivial operand rules', () => {
  for (const maxNumber of [5, 12, 100]) {
    const settings = { ...DEFAULT_SETTINGS, maxNumber, questionCount: 1 };
    const deck = generateDeck(settings);
    const keys = new Set();
    const operations = new Set();
    for (const q of deck) {
      assert.ok(q.a >= 1 && q.a <= maxNumber);
      assert.ok(q.b >= 1 && q.b <= maxNumber);
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 9999);
      const key = `${q.a}${q.op}${q.b}`;
      assert.ok(!keys.has(key));
      keys.add(key);
      operations.add(q.op);
      if (q.op === '+') {
        assert.equal(q.answer, q.a + q.b);
        assert.ok(q.a >= q.b);
      } else if (q.op === '-') assert.equal(q.answer, q.a - q.b);
      else if (q.op === '*') {
        assert.equal(q.answer, q.a * q.b);
        assert.ok(q.a >= q.b && q.b >= 2);
      } else {
        assert.equal(q.answer, q.a / q.b);
        assert.ok(q.b >= 2 && q.answer >= 2);
      }
    }
    assert.deepEqual([...operations].sort(), ['*', '+', '-', '/']);
  }
});

test('generator respects operation selection and refuses impossible settings', () => {
  const settings = { ...DEFAULT_SETTINGS, operations: ['/'], maxNumber: 5, questionCount: 1 };
  assert.ok(questionPool(settings).every(q => q.op === '/'));
  assert.throws(() => generateDeck({ ...settings, questionCount: 50 }), /Only .* different questions/);
  for (const change of [{ seconds: 0 }, { seconds: '30' }, { maxNumber: 101 }, { questionCount: 51 },
    { operations: [] }, { operations: ['bad'] }, { questionCount: NaN },
    { storySeconds: 14 }, { storySeconds: 181 }, { storySeconds: '60' },
    { questionType: 'unknown' }, { storySteps: 'unknown' },
    { patternSeconds: 4 }, { patternSeconds: 181 }, { patternSeconds: '30' }]) {
    assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, ...change }));
  }
  assert.deepEqual(validateSettings({ ...DEFAULT_SETTINGS, operations: ['+', '+'] }).operations, ['+']);
});

test('story questions obey each operation and chain safe whole-number steps without repeats', () => {
  for (const maxNumber of [5, 12, 100]) {
    for (const op of ['+', '-', '*', '/']) {
      for (const storySteps of ['one', 'mixed']) {
        const deck = generateDeck({ ...DEFAULT_SETTINGS, maxNumber, questionCount: 1,
          operations: [op], questionType: 'stories', storySteps });
        const text = new Set();
        for (const q of deck) {
          assert.equal(q.type, 'story');
          assert.ok(!text.has(q.text));
          text.add(q.text);
          assert.ok(q.text.endsWith('?'));
          assert.ok(q.text.length <= 240, q.text);
          assert.ok(q.steps.length === 1 || (storySteps === 'mixed' && q.steps.length === 2));
          let previous;
          for (const step of q.steps) {
            assert.equal(step.op, op);
            assert.ok(step.a >= 0 && step.a <= maxNumber);
            assert.ok(step.b >= 1 && step.b <= maxNumber);
            const expected = op === '+' ? step.a + step.b : op === '-' ? step.a - step.b :
              op === '*' ? step.a * step.b : step.a / step.b;
            assert.equal(step.answer, expected);
            assert.ok(Number.isInteger(expected) && expected >= 0 && expected <= 9999);
            if (op === '*') assert.ok(step.a >= 2 && step.b >= 2);
            if (op === '/') assert.ok(step.b >= 2 && expected >= 2);
            if (previous !== undefined) assert.equal(step.a, previous);
            previous = step.answer;
          }
          assert.equal(q.answer, previous);
          assert.ok(q.explanation.endsWith(`= ${q.answer}`));
        }
        if (maxNumber >= 12 && storySteps === 'mixed') {
          assert.deepEqual(deck.slice(-2).map(q => q.steps.length).sort(), [1, 2]);
        }
      }
    }
  }
});

test('patterns cover next, previous and missing numbers with bounded consistent steps and no repeats', () => {
  for (const maxNumber of [5, 12, 100]) {
    const deck = generateDeck({ ...DEFAULT_SETTINGS, questionType: 'patterns', maxNumber, questionCount: 1 });
    const prompts = new Set();
    assert.deepEqual(deck.slice(-3).map(q => q.kind).sort(), ['missing', 'next', 'previous']);
    assert.deepEqual([...new Set(deck.map(q => Math.sign(q.step)))].sort(), [-1, 1]);
    for (const q of deck) {
      assert.equal(q.type, 'pattern');
      assert.ok(!prompts.has(q.text));
      prompts.add(q.text);
      assert.equal(q.sequence.length, 5);
      assert.ok(q.sequence.every(n => Number.isInteger(n) && n >= 0 && n <= maxNumber));
      assert.ok(q.sequence.slice(1).every((n, i) => n - q.sequence[i] === q.step));
      assert.equal(q.answer, q.sequence[q.missingIndex]);
      assert.equal(q.kind, q.missingIndex === 0 ? 'previous' : q.missingIndex === 4 ? 'next' : 'missing');
      const displayed = q.text.split('\n')[1].split(', ');
      assert.equal(displayed[q.missingIndex], '?');
      assert.equal(displayed.filter(n => n === '?').length, 1);
      assert.ok(displayed.every((n, i) => i === q.missingIndex || Number(n) === q.sequence[i]));
      assert.ok(q.explanation.includes(q.sequence.join(', ')));
      assert.ok(q.explanation.includes(`by ${Math.abs(q.step)}`));
    }
  }
  assert.throws(() => generateDeck({ ...DEFAULT_SETTINGS, questionType: 'patterns', maxNumber: 5, questionCount: 50 }), /Only .* different questions/);
  assert.ok(generateDeck({ ...DEFAULT_SETTINGS, questionType: 'patterns', operations: [] }).every(q => q.type === 'pattern'));
});

test('mix includes all three types and mixed-story challenges include both step counts', () => {
  for (let i = 0; i < 10; i++) {
    const deck = generateDeck({ ...DEFAULT_SETTINGS, questionType: 'mix', storySteps: 'mixed' });
    const firstSix = deck.slice(-6);
    assert.deepEqual([...new Set(firstSix.map(q => q.type))].sort(), ['calculation', 'pattern', 'story']);
    assert.deepEqual(firstSix.filter(q => q.type === 'story').map(q => q.steps.length).sort(), [1, 2]);
  }
});

test('network policy permits only loopback/private IPv4 and same-origin browser requests', () => {
  for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) assert.ok(isLoopback(address));
  for (const address of ['10.0.1.2', '172.16.0.1', '172.31.255.1', '192.168.1.20']) assert.ok(isPrivate(address));
  for (const address of ['8.8.8.8', '172.32.0.1', '169.254.1.1', 'fe80::1', '127.evil.test']) assert.equal(isPrivate(address), false);
  const request = { socket: { remoteAddress: '192.168.1.5' }, headers: { host: '192.168.1.2:3000', origin: 'http://192.168.1.2:3000' } };
  assert.ok(allowedRequest(request));
  assert.equal(allowedRequest({ ...request, headers: { ...request.headers, origin: 'http://evil.example' } }), false);
  assert.equal(allowedRequest({ ...request, headers: { host: 'evil.example' } }), false);
  assert.equal(allowedRequest({ ...request, socket: { remoteAddress: '8.8.8.8' } }), false);
});
