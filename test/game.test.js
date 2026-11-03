import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { io as client } from 'socket.io-client';
import { createApp } from '../server.js';
import { Game } from '../lib/game.js';
import { DEFAULT_SETTINGS } from '../lib/questions.js';
import { joinUrls } from '../lib/network.js';
import { avatars } from '../public/shared.js';

async function fixture(t, { solo = false } = {}) {
  const app = createApp();
  await new Promise(resolve => app.server.listen(0, '0.0.0.0', resolve));
  const url = `http://127.0.0.1:${app.server.address().port}`;
  const sockets = [];
  t.after(async () => {
    for (const socket of sockets) socket.disconnect();
    await app.close();
  });
  async function connect(address = url, options = {}) {
    const socket = client(address, { autoConnect: false, reconnection: false, transports: ['websocket'], ...options });
    sockets.push(socket);
    socket.states = [];
    socket.on('state', state => { socket.state = state; socket.states.push(state); });
    const connected = new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    socket.connect();
    await connected;
    return socket;
  }
  const host = await connect();
  await send(host, 'host');
  const a = await connect();
  const b = await connect();
  const first = await send(a, 'join', { name: 'Alex', avatar: 'fox' });
  const second = solo ? {} : await send(b, 'join', { name: 'Sam', avatar: 'panda' });
  return { ...app, url, host, a, b, connect, tokens: [first.token, second.token] };
}

function send(socket, event, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.timeout(2000).emit(event, payload, (error, result) => {
      if (error) reject(error); else resolve(result);
    });
  });
}

function waitState(socket, predicate, timeout = 2500) {
  if (predicate(socket.state)) return Promise.resolve(socket.state);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('state', listener);
      reject(new Error('Timed out waiting for game state.'));
    }, timeout);
    function listener(state) {
      if (!predicate(state)) return;
      clearTimeout(timer);
      socket.off('state', listener);
      resolve(state);
    }
    socket.on('state', listener);
  });
}

const settings = { ...DEFAULT_SETTINGS, operations: ['+'], questionCount: 1, seconds: 5 };
function answer(socket, value, submit = true, questionId = socket.state.question.id) {
  return send(socket, 'answer', { questionId, value: String(value), submit });
}

async function ready(f) {
  await Promise.all([f.a, f.b].map(socket => waitState(socket,
    s => s?.phase === 'question' && s.question.id === f.game.question.id)));
}

test('two players join, share a question, lock secretly, reveal early, score and finish', async t => {
  const f = await fixture(t);
  assert.equal(f.host.state.players.length, 2);
  assert.ok((await send(f.b, 'start', settings)).error);
  assert.equal((await send(f.host, 'start', settings)).ok, true);
  await ready(f);
  assert.deepEqual(f.a.state.question, f.b.state.question);
  assert.equal('answer' in f.a.state.question, false);
  assert.equal('answer' in f.host.state.question, false);
  const correct = f.game.question.answer;
  assert.ok((await answer(f.a, '')).error);
  assert.ok((await answer(f.a, '12345')).error);
  assert.ok((await answer(f.a, '01')).error);
  assert.ok((await answer(f.a, '1', true, 'stale-question')).error);
  assert.equal((await answer(f.a, correct)).ok, true);
  await waitState(f.host, s => s.players.some(p => p.submitted));
  assert.equal(f.host.state.phase, 'question');
  assert.ok(f.host.state.players.every(p => !('answer' in p)));
  assert.ok(f.b.state.players.every(p => !('answer' in p)));
  assert.ok((await answer(f.a, correct + 1)).error);
  const reveal = waitState(f.b, s => s?.phase === 'reveal');
  await answer(f.b, correct + 1);
  await reveal;
  assert.equal(f.b.state.question.answer, correct);
  assert.deepEqual(f.b.state.players.map(p => p.score), [1, 0]);
  assert.deepEqual(f.b.state.players.map(p => p.correct), [true, false]);
  assert.ok(f.b.state.serverNow < f.b.state.deadline);
  await send(f.host, 'next');
  await waitState(f.b, s => s?.phase === 'finished');
  assert.deepEqual(f.b.state.winners, [f.a.state.playerId]);
  assert.ok((await answer(f.a, correct)).error);
  await send(f.host, 'start', settings);
  await ready(f);
  assert.deepEqual(f.host.state.players.map(p => p.score), [0, 0]);
  await send(f.host, 'lobby');
  assert.equal(f.host.state.phase, 'lobby');
});

test('one player starts solo practice, reveals early, scores, finishes and replays', async t => {
  const f = await fixture(t, { solo: true });
  assert.equal((await send(f.host, 'start', settings)).ok, true);
  await waitState(f.a, s => s?.phase === 'question');
  assert.equal(f.a.state.participantCount, 1);
  assert.equal((await answer(f.a, f.game.question.answer)).ok, true);
  await waitState(f.a, s => s?.phase === 'reveal');
  assert.equal(f.a.state.players[0].score, 1);
  assert.ok(f.a.state.serverNow < f.a.state.deadline);
  await send(f.host, 'next');
  await waitState(f.a, s => s?.phase === 'finished');
  assert.deepEqual(f.a.state.winners, [f.a.state.playerId]);
  assert.match((await send(f.host, 'tiebreaker')).error, /tied winners/);
  assert.equal((await send(f.host, 'start', settings)).ok, true);
  await waitState(f.a, s => s?.phase === 'question');
  assert.equal(f.a.state.players[0].score, 0);
  await answer(f.a, f.game.question.answer + 1);
  await send(f.host, 'next');
  await waitState(f.a, s => s?.phase === 'finished');
  assert.equal(f.a.state.players[0].score, 0);
});

test('story players share text and duration, with reasoning withheld until reveal', async t => {
  const f = await fixture(t);
  assert.equal((await send(f.host, 'start', { ...settings, questionType: 'stories', storySteps: 'mixed', storySeconds: 75 })).ok, true);
  await ready(f);
  assert.equal(f.a.state.question.type, 'story');
  assert.deepEqual(f.a.state.question, f.b.state.question);
  assert.equal(f.a.state.durationMs, 75000);
  assert.equal(f.a.state.deadline - f.game.startedAt, 75000);
  assert.equal('answer' in f.a.state.question, false);
  assert.equal('explanation' in f.a.state.question, false);
  assert.equal('steps' in f.a.state.question, false);
  await answer(f.a, f.game.question.answer);
  await answer(f.b, f.game.question.answer);
  await waitState(f.b, s => s?.phase === 'reveal');
  assert.equal(f.b.state.question.explanation, f.game.question.explanation);
  assert.deepEqual(f.b.state.players.map(p => p.score), [1, 1]);
});

test('pattern players share the question, preserve their timer on reconnect and reveal the rule only afterwards', async t => {
  const f = await fixture(t);
  assert.equal((await send(f.host, 'start', { ...settings, questionType: 'patterns', patternSeconds: 45 })).ok, true);
  await ready(f);
  assert.equal(f.a.state.question.type, 'pattern');
  assert.deepEqual(f.a.state.question, f.b.state.question);
  assert.equal(f.a.state.durationMs, 45000);
  assert.equal(f.a.state.deadline - f.game.startedAt, 45000);
  for (const socket of [f.a, f.b, f.host]) {
    for (const privateKey of ['answer', 'sequence', 'missingIndex', 'explanation']) {
      assert.equal(privateKey in socket.state.question, false);
    }
  }
  const deadline = f.a.state.deadline;
  f.a.disconnect();
  const reconnected = await f.connect();
  await send(reconnected, 'join', { token: f.tokens[0] });
  assert.equal(reconnected.state.deadline, deadline);
  await answer(reconnected, f.game.question.answer);
  await answer(f.b, f.game.question.answer + 1);
  await waitState(f.b, s => s?.phase === 'reveal');
  assert.equal(f.b.state.question.explanation, f.game.question.explanation);
  assert.deepEqual(f.b.state.players.map(p => p.score), [1, 0]);
});

test('mixed rounds schedule each type timer, timeout saved answers and retain deadlines on reconnect', () => {
  let now = 100;
  const scheduled = [];
  const game = new Game({ now: () => now, schedule: (callback, ms) => { scheduled.push({ callback, ms }); return 1; }, cancel: () => {} });
  const player = game.join({ name: 'Explorer' });
  game.connect(player, 'socket');
  game.start({ ...settings, questionCount: 6, questionType: 'mix', storySeconds: 90, patternSeconds: 45, storySteps: 'mixed' });
  const types = [];
  for (let round = 0; round < 6; round++) {
    const story = game.question.type === 'story';
    const duration = story ? 90000 : game.question.type === 'pattern' ? 45000 : 5000;
    types.push(game.question.type);
    assert.equal(game.deadline - now, duration);
    assert.equal(game.snapshot(player).durationMs, duration);
    assert.equal(scheduled.at(-1).ms, duration);
    const deadline = game.deadline;
    game.disconnect(player, 'socket');
    game.connect(player, 'socket');
    assert.equal(game.snapshot(player).deadline, deadline);
    game.answer(player, { questionId: game.question.id, value: String(game.question.answer), submit: false });
    now = deadline;
    scheduled.at(-1).callback();
    assert.equal(game.phase, 'reveal');
    assert.equal(player.score, round + 1);
    game.next();
  }
  assert.equal(game.phase, 'finished');
  assert.deepEqual(types.slice(0, 3).sort(), ['calculation', 'pattern', 'story']);
});

test('all twelve avatar choices are accepted by the server; unknown avatars use the default', () => {
  const game = new Game();
  assert.equal(Object.keys(avatars).length, 12);
  for (const avatar of Object.keys(avatars)) {
    assert.equal(game.join({ name: avatar, avatar }).avatar, avatar);
  }
  const other = new Game();
  assert.equal(other.join({ name: 'Explorer', avatar: 'unknown' }).avatar, 'fox');
});

test('deadline counts saved drafts without submission and never awards twice', async t => {
  const f = await fixture(t);
  await send(f.host, 'start', settings);
  await ready(f);
  const correct = f.game.question.answer;
  await answer(f.a, correct, false);
  await answer(f.b, '', false);
  assert.equal(f.game.phase, 'question');
  await waitState(f.a, s => s?.phase === 'reveal', 6500);
  assert.deepEqual(f.a.state.players.map(p => p.score), [1, 0]);
  f.game.reveal();
  assert.deepEqual(f.game.snapshot().players.map(p => p.score), [1, 0]);
});

test('ties, unsuccessful tiebreaker, and fastest correct winner', async t => {
  const f = await fixture(t);
  await send(f.host, 'start', settings);
  await ready(f);
  await answer(f.a, f.game.question.answer);
  await answer(f.b, f.game.question.answer);
  await send(f.host, 'next');
  await waitState(f.b, s => s?.phase === 'finished');
  assert.equal(f.b.state.winners.length, 2);
  await send(f.host, 'tiebreaker');
  await ready(f);
  assert.ok(f.a.state.isTiebreaker);
  const firstId = f.a.state.question.id;
  await answer(f.a, 9999);
  await answer(f.b, 9999);
  await send(f.host, 'next');
  assert.equal(f.game.winners.length, 2);
  await send(f.host, 'tiebreaker');
  await ready(f);
  assert.notEqual(f.a.state.question.id, firstId);
  await answer(f.b, f.game.question.answer);
  await delay(25);
  await answer(f.a, f.game.question.answer);
  await send(f.host, 'next');
  await waitState(f.b, s => s?.phase === 'finished');
  assert.deepEqual(f.b.state.winners, [f.b.state.playerId]);
});

test('reconnect restores identity, saved draft, lock, and score; duplicate names rejected', async t => {
  const f = await fixture(t);
  const duplicate = await f.connect();
  assert.match((await send(duplicate, 'join', { name: ' alex ' })).error, /already/);
  await send(f.host, 'start', settings);
  await ready(f);
  const id = f.a.state.playerId;
  await answer(f.a, f.game.question.answer, false);
  f.a.disconnect();
  const replacement = await f.connect();
  await send(replacement, 'join', { token: f.tokens[0] });
  assert.equal(replacement.state.playerId, id);
  assert.equal(replacement.state.ownResponse.value, String(f.game.question.answer));
  await answer(replacement, f.game.question.answer);
  replacement.disconnect();
  const locked = await f.connect();
  await send(locked, 'join', { token: f.tokens[0] });
  assert.equal(locked.state.ownResponse.submitted, true);
  assert.ok((await send(duplicate, 'join', { name: 'Late player' })).error);
  await answer(f.b, f.game.question.answer + 1);
  await waitState(locked, s => s?.phase === 'reveal');
  assert.equal(locked.state.players.find(p => p.id === id).score, 1);
  locked.disconnect();
  const final = await f.connect();
  await send(final, 'join', { token: f.tokens[0] });
  assert.equal(final.state.players.find(p => p.id === id).score, 1);
  const newHost = await f.connect();
  await send(newHost, 'host');
  assert.equal(newHost.state.phase, 'reveal');
  await send(newHost, 'next');
  assert.equal(f.game.phase, 'finished');
});

test('disconnecting the last unsubmitted player permits early reveal', async t => {
  const f = await fixture(t);
  await send(f.host, 'start', settings);
  await ready(f);
  await answer(f.b, f.game.question.answer, false);
  await answer(f.a, f.game.question.answer);
  f.b.disconnect();
  await waitState(f.a, s => s?.phase === 'reveal');
  assert.deepEqual(f.a.state.players.map(p => p.score), [1, 1]);
});

test('HTTP and socket host controls refuse LAN clients and foreign origins', async t => {
  const f = await fixture(t);
  const homeUrl = joinUrls(f.server.address().port)[0];
  if (homeUrl) {
    assert.equal((await fetch(`${homeUrl}/`)).status, 200);
    assert.equal((await fetch(`${homeUrl}/host`)).status, 403);
    assert.equal((await fetch(`${homeUrl}/api/join`)).status, 403);
    assert.equal((await fetch(`${homeUrl}/host.html`)).status, 404);
    const remote = await f.connect(homeUrl);
    assert.match((await send(remote, 'host')).error, /host PC/);
    assert.match((await send(remote, 'start', settings)).error, /Only the host/);
  }
  assert.equal((await fetch(`${f.url}/`, { headers: { Origin: 'https://evil.example' } })).status, 403);
  const badHostStatus = await new Promise((resolve, reject) => {
    request(f.url, { headers: { Host: 'evil.example' } }, response => {
      response.resume();
      resolve(response.statusCode);
    }).on('error', reject).end();
  });
  assert.equal(badHostStatus, 403);
  const bad = client(f.url, { autoConnect: false, reconnection: false, transports: ['websocket'], extraHeaders: { Origin: 'https://evil.example' } });
  t.after(() => bad.disconnect());
  const refused = once(bad, 'connect_error');
  bad.connect();
  await refused;
  assert.equal(bad.connected, false);
});

test('boundary deadline rejects late edits, exact speed ties stay tied, absent players cannot start', () => {
  let now = 0;
  const game = new Game({ now: () => now, schedule: () => 1, cancel: () => {} });
  const a = game.join({ name: 'A' });
  const b = game.join({ name: 'B' });
  assert.throws(() => game.start(settings), /one connected/);
  game.connect(a, 'a');
  game.connect(b, 'b');
  game.start(settings);
  const correct = String(game.question.answer);
  game.answer(a, { questionId: game.question.id, value: correct, submit: false });
  now = game.deadline;
  assert.throws(() => game.answer(a, { questionId: game.question.id, value: '9999', submit: true }), /Time is up/);
  assert.equal(a.score, 1);
  game.next();
  game.start(settings);
  for (const p of [a, b]) game.answer(p, { questionId: game.question.id, value: String(game.question.answer), submit: true });
  game.next();
  game.tiebreaker();
  for (const p of [a, b]) game.answer(p, { questionId: game.question.id, value: String(game.question.answer), submit: true });
  game.next();
  assert.equal(game.winners.length, 2);
  game.deck = [];
  assert.throws(() => game.tiebreaker(), /No unused questions/);
  game.lobby();
  game.remove(a.id);
  assert.equal(game.players.has(a.token), false);
});
