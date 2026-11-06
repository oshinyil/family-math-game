import test from 'node:test';
import assert from 'node:assert/strict';
import { calculationQuestion, DEFAULT_SETTINGS, generateDeck, questionPool, validateSettings } from '../lib/questions.js';
import { storyQuestion } from '../lib/stories.js';
import { patternPool } from '../lib/patterns.js';
import { allowedRequest, isLoopback, isPrivate } from '../lib/network.js';

test('generator obeys arithmetic, range, uniqueness, and non-trivial operand rules', () => {
  for (const maxNumber of [5, 12, 100]) {
    const settings = { ...DEFAULT_SETTINGS, maxNumber, questionCount: 1 };
    const deck = questionPool(settings);
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
        assert.ok(q.answer <= maxNumber);
      } else {
        assert.equal(q.answer, q.a / q.b);
        assert.ok(q.b >= 2 && q.answer >= 2);
      }
    }
    assert.deepEqual([...operations].sort(), ['*', '+', '-', '/']);
  }
});

test('all operations support uniquely solvable left, right and result equation blanks', () => {
  const bases = [
    { a: 14, b: 10, op: '+', answer: 24 },
    { a: 14, b: 10, op: '-', answer: 4 },
    { a: 6, b: 4, op: '*', answer: 24 },
    { a: 24, b: 4, op: '/', answer: 6 },
  ];
  for (const base of bases) {
    for (const blank of ['a', 'b', 'result']) {
      const q = calculationQuestion(base, blank);
      assert.equal(q.answer, blank === 'result' ? base.answer : base[blank]);
      assert.equal(q.text.split('...').length, 2);
      const filled = q.text.replace('...', String(q.answer));
      assert.equal(filled, q.explanation);
      const solved = blank === 'result' ? base.answer : blank === 'a' ?
        (base.op === '+' ? base.answer - base.b : base.op === '-' ? base.answer + base.b :
          base.op === '*' ? base.answer / base.b : base.answer * base.b) :
        (base.op === '+' ? base.answer - base.a : base.op === '-' ? base.a - base.answer :
          base.op === '*' ? base.answer / base.a : base.a / base.answer);
      assert.equal(solved, q.answer);
    }
  }
  assert.equal(calculationQuestion({ a: 4, b: 10, op: '+', answer: 14 }, 'a').text, '... + 10 = 14');
  assert.equal(calculationQuestion({ a: 5, b: 7, op: '+', answer: 12 }, 'b').text, '5 + ... = 12');
  for (const maxNumber of [5, 12, 50, 100]) {
    const deck = generateDeck({ ...DEFAULT_SETTINGS, maxNumber, questionCount: 1 });
    assert.equal(deck.length, questionPool({ ...DEFAULT_SETTINGS, maxNumber }).length);
    assert.equal(new Set(deck.map(q => q.text)).size, deck.length);
    assert.deepEqual(deck.slice(-3).map(q => q.blank).sort(), ['a', 'b', 'result']);
    for (const q of deck) {
      assert.equal(q.answer, q.blank === 'result' ?
        (q.op === '+' ? q.a + q.b : q.op === '-' ? q.a - q.b :
          q.op === '*' ? q.a * q.b : q.a / q.b) : q[q.blank]);
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0);
      if (q.blank !== 'result') assert.ok(q.answer <= maxNumber);
    }
  }
  assert.throws(() => calculationQuestion(bases[0], 'unknown'), /valid equation blank/);
});

test('multiplication pools contain exactly the nontrivial products within Max number', () => {
  for (const maxNumber of [5, 8, 12, 50, 100]) {
    const pool = questionPool({ ...DEFAULT_SETTINGS, maxNumber, operations: ['*'], questionCount: 1 });
    const expected = [];
    for (let a = 2; a <= maxNumber; a++) {
      for (let b = 2; b <= a; b++) {
        if (a * b <= maxNumber) expected.push({ a, b, op: '*', answer: a * b });
      }
    }
    assert.deepEqual(pool, expected);
    assert.ok(pool.some(q => q.a === 2 && q.b === 2));
    if (maxNumber === 50) {
      assert.ok(pool.some(q => q.a === 8 && q.b === 6 && q.answer === 48));
      assert.ok(!pool.some(q => q.a === 49 && q.b === 48));
      assert.ok(pool.some(q => q.answer === 50));
    }
    for (const questionType of ['calculations', 'stories', 'mix']) {
      const deck = generateDeck({ ...DEFAULT_SETTINGS, maxNumber, operations: ['*'],
        questionCount: 1, questionType, storySteps: 'mixed' });
      for (const q of deck.filter(q => q.op === '*')) {
        assert.ok(q.answer <= maxNumber);
        for (const step of q.steps ?? [q]) assert.ok(step.answer <= maxNumber);
      }
    }
  }
  assert.throws(() => generateDeck({ ...DEFAULT_SETTINGS, operations: ['*'],
    maxNumber: 5, questionCount: 2 }), /Only 1 different questions/);
});

test('multiplication stories cap both steps and gracefully omit impossible two-step stories', () => {
  const base = { a: 2, b: 2, op: '*', answer: 4 };
  assert.equal(storyQuestion(base, 7, true), null);
  assert.deepEqual(storyQuestion(base, 8, true).steps, [
    base, { a: 4, b: 2, op: '*', answer: 8 },
  ]);
  assert.equal(storyQuestion({ a: 8, b: 6, op: '*', answer: 48 }, 50, true), null);
  for (const twoStep of [false, true]) {
    assert.equal(storyQuestion({ a: 49, b: 48, op: '*', answer: 2352 }, 50, twoStep), null);
  }
});

test('addition, subtraction and division retain their complete operand-bounded pools', () => {
  for (const maxNumber of [5, 12, 50, 100]) {
    for (const op of ['+', '-', '/']) {
      const expected = [];
      for (let a = 1; a <= maxNumber; a++) {
        for (let b = 1; b <= maxNumber; b++) {
          if (op === '+' && a >= b) expected.push({ a, b, op, answer: a + b });
          if (op === '-' && a >= b) expected.push({ a, b, op, answer: a - b });
          if (op === '/' && b >= 2 && a / b >= 2 && Number.isInteger(a / b)) {
            expected.push({ a, b, op, answer: a / b });
          }
        }
      }
      assert.deepEqual(questionPool({ ...DEFAULT_SETTINGS, maxNumber, operations: [op],
        questionCount: 1 }), expected);
    }
    const base = { a: maxNumber - 2, b: 2, op: '+', answer: maxNumber };
    assert.equal(storyQuestion(base, maxNumber).answer, maxNumber);
    assert.ok(storyQuestion(base, maxNumber, true).answer > maxNumber);
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
    { patternSeconds: 4 }, { patternSeconds: 181 }, { patternSeconds: '30' }, { autoContinue: 'true' }]) {
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
            if (op === '*') {
              assert.ok(step.a >= 2 && step.b >= 2);
              assert.ok(step.answer <= maxNumber);
            }
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

test('all 80 story scenarios bind the right numbers to safe steps and fit the text budget', () => {
  const bases = {
    '+': [{ a: 100, b: 100, op: '+', answer: 200 }, { a: 49, b: 50, op: '+', answer: 99 }],
    '-': [{ a: 100, b: 99, op: '-', answer: 1 }, { a: 100, b: 2, op: '-', answer: 98 }],
    '*': [{ a: 10, b: 10, op: '*', answer: 100 }, { a: 2, b: 2, op: '*', answer: 4 }],
    '/': [{ a: 100, b: 2, op: '/', answer: 50 }, { a: 100, b: 2, op: '/', answer: 50 }],
  };
  const symbols = { '+': '+', '-': '−', '*': '×', '/': '÷' };
  for (const op of ['+', '-', '*', '/']) {
    for (const twoStep of [false, true]) {
      const count = twoStep ? 8 : 12;
      const texts = new Set();
      for (let index = 0; index < count; index++) {
        const q = storyQuestion(bases[op][Number(twoStep)], 100, twoStep, values => {
          if (typeof values[0] === 'function') {
            assert.equal(values.length, count);
            return values[index];
          }
          if (typeof values[0] === 'number') return values.at(-1);
          return values.reduce((a, b) => a.length >= b.length ? a : b);
        });
        assert.ok(q);
        assert.ok(q.text.endsWith('?'));
        assert.ok(q.text.length <= 240, q.text);
        assert.ok(!texts.has(q.text));
        texts.add(q.text);
        const inputs = [q.a, q.b, ...q.steps.slice(1).map(step => step.b)];
        assert.deepEqual(q.text.match(/\d+/g).map(Number).sort((a, b) => a - b),
          inputs.sort((a, b) => a - b), q.text);
        assert.equal(q.steps.length, twoStep ? 2 : 1);
        for (const step of q.steps) {
          const expected = op === '+' ? step.a + step.b : op === '-' ? step.a - step.b :
            op === '*' ? step.a * step.b : step.a / step.b;
          assert.equal(step.answer, expected);
          assert.ok(Number.isInteger(expected) && expected >= 0);
          assert.ok(step.a <= 100 && step.b <= 100);
          if (op === '*') assert.ok(expected <= 100);
        }
        assert.equal(q.answer, q.steps.at(-1).answer);
        assert.equal(q.explanation, q.steps.map(step =>
          `${step.a} ${symbols[op]} ${step.b} = ${step.answer}`).join('; '));
      }
      assert.equal(texts.size, count);
    }
  }
});

test('story names, objects and places give 3072 distinct combinations for one scenario', () => {
  const texts = new Set();
  const base = { a: 6, b: 4, op: '+', answer: 10 };
  for (let name = 0; name < 16; name++) {
    for (let item = 0; item < 16; item++) {
      for (let place = 0; place < 12; place++) {
        const indices = [name, item, place, 1];
        let call = 0;
        const q = storyQuestion(base, 12, false, values => values[indices[call++]]);
        assert.ok(!texts.has(q.text), q.text);
        texts.add(q.text);
        assert.equal(q.answer, 10);
        assert.equal(q.explanation, '6 + 4 = 10');
      }
    }
  }
  assert.equal(texts.size, 3072);
});

test('patterns cover next, previous and missing numbers with bounded consistent steps and no repeats', () => {
  for (const maxNumber of [5, 12, 100]) {
    const deck = generateDeck({ ...DEFAULT_SETTINGS, questionType: 'patterns', maxNumber, questionCount: 1 });
    const prompts = new Set();
    assert.deepEqual(deck.slice(-3).map(q => q.kind).sort(), ['missing', 'next', 'previous']);
    assert.deepEqual([...new Set(deck.filter(q => q.rule === 'constant').map(q => Math.sign(q.step)))].sort(), [-1, 1]);
    if (maxNumber >= 16) {
      assert.equal(new Set(deck.slice(-6).map(q => q.rule)).size, 6);
    }
    for (const q of deck) {
      assert.equal(q.type, 'pattern');
      assert.ok(!prompts.has(q.text));
      prompts.add(q.text);
      assert.equal(q.sequence.length, 5);
      assert.ok(q.sequence.every(n => Number.isInteger(n) && n >= 0 && n <= maxNumber));
      if (q.rule === 'constant') {
        assert.ok(q.sequence.slice(1).every((n, i) => n - q.sequence[i] === q.step));
        assert.ok(q.explanation.includes(`by ${Math.abs(q.step)}`));
      } else if (q.rule === 'doubling') {
        assert.ok(q.sequence.slice(1).every((n, i) => n === q.sequence[i] * 2));
      } else if (q.rule === 'halving') {
        assert.ok(q.sequence.slice(1).every((n, i) => n === q.sequence[i] / 2));
      } else if (q.rule === 'repeating') {
        assert.notEqual(q.sequence[0], q.sequence[1]);
        assert.ok(q.sequence.every((n, i) => n === q.sequence[i % 2]));
      } else {
        assert.ok(q.sequence.slice(1).every((n, i) => n - q.sequence[i] === q.jumps[i]));
        if (q.rule === 'alternating') {
          assert.equal(q.jumps[0], q.jumps[2]);
          assert.equal(q.jumps[1], q.jumps[3]);
          assert.equal(q.jumps[1], q.jumps[0] * 2);
        } else {
          assert.equal(q.rule, 'growing');
          assert.ok(q.jumps.slice(1).every((n, i) => Math.abs(n) === Math.abs(q.jumps[i]) + 1));
        }
      }
      assert.equal(q.answer, q.sequence[q.missingIndex]);
      assert.equal(q.kind, q.missingIndex === 0 ? 'previous' : q.missingIndex === 4 ? 'next' : 'missing');
      const displayed = q.text.split('\n')[1].split(', ');
      assert.equal(displayed[q.missingIndex], '...');
      assert.equal(displayed.filter(n => n === '...').length, 1);
      assert.equal(q.text.includes('?'), true, 'The question sentence is still a question');
      assert.ok(displayed.every((n, i) => i === q.missingIndex || Number(n) === q.sequence[i]));
      assert.ok(q.explanation.includes(q.sequence.join(', ')));
      assert.ok(!q.explanation.includes('...'));
    }
  }
  assert.ok(generateDeck({ ...DEFAULT_SETTINGS, questionType: 'patterns', maxNumber: 5, questionCount: 50 }).length >= 50);
  assert.ok(generateDeck({ ...DEFAULT_SETTINGS, questionType: 'patterns', operations: [] }).every(q => q.type === 'pattern'));
});

test('each pattern rule has next, previous and every interior blank with a clear rule hint', () => {
  const fixtures = [
    ['constant', [0, 2, 4, 6, 8], '', 'Count up by 2'],
    ['doubling', [1, 2, 4, 8, 16], 'Double each time.', 'Multiply by 2 each time'],
    ['halving', [16, 8, 4, 2, 1], 'Halve each time.', 'Divide by 2 each time'],
    ['alternating', [0, 1, 3, 4, 6], 'Add 1, then 2; repeat.', 'Add 1, then 2, alternating'],
    ['alternating', [6, 5, 3, 2, 0], 'Subtract 1, then 2; repeat.', 'Subtract 1, then 2, alternating'],
    ['growing', [0, 1, 3, 6, 10], 'Add 1, 2, 3, 4 in order.', 'Add bigger jumps: 1, 2, 3, 4'],
    ['growing', [10, 9, 7, 4, 0], 'Subtract 1, 2, 3, 4 in order.', 'Subtract bigger jumps: 1, 2, 3, 4'],
    ['repeating', [1, 3, 1, 3, 1], 'Repeat the two numbers.', 'Repeat the same pair of numbers'],
  ];
  const pool = patternPool(16);
  for (const [rule, sequence, hint, explanation] of fixtures) {
    const questions = pool.filter(q => q.rule === rule &&
      q.sequence.every((number, i) => number === sequence[i]));
    assert.equal(questions.length, 5);
    assert.deepEqual(questions.map(q => q.kind), ['previous', 'missing', 'missing', 'missing', 'next']);
    for (const q of questions) {
      assert.equal(q.answer, sequence[q.missingIndex]);
      assert.equal(q.text.split('\n')[1], sequence.map((n, i) => i === q.missingIndex ? '...' : n).join(', '));
      assert.ok(q.text.split('\n')[0].endsWith(hint));
      assert.equal(q.explanation, `${explanation}: ${sequence.join(', ')}.`);
    }
  }
  assert.ok(!patternPool(15).some(q => ['doubling', 'halving'].includes(q.rule)));
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
