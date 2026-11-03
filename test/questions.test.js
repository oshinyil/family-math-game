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
    { operations: [] }, { operations: ['bad'] }, { questionCount: NaN }]) {
    assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, ...change }));
  }
  assert.deepEqual(validateSettings({ ...DEFAULT_SETTINGS, operations: ['+', '+'] }).operations, ['+']);
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
