import { $, avatars, equation, showError, emit, connection, playerChip, finalScreen, updateTimer } from './shared.js';

const socket = io({ autoConnect: false });
let state;
let offset = 0;
let value = '';
let locked = false;
let pending = false;
let restoring = true;
let avatar = 'fox';
let token;
let storageAvailable = true;
try {
  token = localStorage.getItem('math-token');
  $('name').value = localStorage.getItem('math-name') ?? '';
  avatar = localStorage.getItem('math-avatar') ?? 'fox';
} catch {
  storageAvailable = false;
}
if (!avatars[avatar]) avatar = 'fox';
for (const [key, emoji] of Object.entries(avatars)) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = emoji;
  button.setAttribute('aria-label', key);
  button.setAttribute('aria-pressed', String(key === avatar));
  button.addEventListener('click', () => {
    avatar = key;
    for (const other of $('avatars').children) other.setAttribute('aria-pressed', String(other === button));
  });
  $('avatars').append(button);
}
function remember() {
  try {
    localStorage.setItem('math-token', token);
    localStorage.setItem('math-name', $('name').value.trim());
    localStorage.setItem('math-avatar', avatar);
  } catch {
    storageAvailable = false;
  }
  if (!storageAvailable) showError('Browser storage is disabled. Stay on this page so your player identity is not lost.');
}
connection(socket, async () => {
  restoring = true;
  pending = false;
  if (token) {
    const result = await emit(socket, 'join', { token, name: $('name').value, avatar });
    if (result.token) {
      token = result.token;
      remember();
    } else {
      token = null;
      state = null;
      $('join-screen').hidden = false;
      for (const id of ['waiting-screen', 'play-screen', 'final-screen']) $(id).hidden = true;
    }
  } else $('join-screen').hidden = false;
});
socket.on('state', next => {
  const changedQuestion = next.question?.id !== state?.question?.id;
  if (changedQuestion || restoring || next.ownResponse?.submitted) value = next.ownResponse?.value ?? '';
  restoring = false;
  state = next;
  offset = state.serverNow - Date.now();
  locked = Boolean(state.ownResponse?.submitted);
  if (changedQuestion) {
    pending = false;
    showError('');
  }
  render();
});
socket.on('disconnect', () => renderAnswer());
socket.connect();

$('join-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  showError('');
  const result = await emit(socket, 'join', { name: $('name').value, avatar });
  button.disabled = false;
  if (!result.token) return;
  token = result.token;
  remember();
});

function render() {
  if (!state) return;
  $('join-screen').hidden = true;
  $('waiting-screen').hidden = state.phase !== 'lobby';
  $('play-screen').hidden = !['question', 'reveal'].includes(state.phase);
  $('final-screen').hidden = state.phase !== 'finished';
  const me = state.players.find(p => p.id === state.playerId);
  $('identity').textContent = `${avatars[me.avatar]} ${me.name} · ⭐ ${me.score}`;
  if (state.phase === 'lobby') {
    $('welcome').textContent = `Ready when you are, ${me.name}!`;
    $('lobby-players').replaceChildren(...state.players.map(p => playerChip(p)));
  } else if (state.phase === 'finished') {
    finalScreen(state);
  } else {
    $('round-label').textContent = state.isTiebreaker ? '⚡ Tiebreaker · fastest correct answer wins' : `Question ${state.round} of ${state.settings.questionCount}`;
    $('equation').textContent = `${equation(state.question)} = ${state.phase === 'reveal' ? state.question.answer : '?'}`;
    $('equation').classList.toggle('long', $('equation').textContent.length > 11);
    $('mini-scores').replaceChildren(...state.players.map(p => playerChip(p, true)));
    if (state.phase === 'reveal') {
      $('feedback').textContent = !me.played ? 'Thanks for cheering!' : me.correct ? '✓ Brilliant! +1 point' : '✗ Good try! Keep going.';
      $('feedback').className = `feedback ${me.correct ? 'correct' : 'incorrect'}`;
      $('answer-hint').textContent = me.played ? 'Waiting for the host to continue…' : 'You’re watching this round.';
    } else $('feedback').textContent = '';
    renderAnswer();
    updateTimer(state, offset);
  }
}

function renderAnswer() {
  if (!state || !['question', 'reveal'].includes(state.phase)) return;
  const reveal = state.phase === 'reveal';
  const me = state.players.find(p => p.id === state.playerId);
  $('answer-display').textContent = reveal ? (me.played ? me.answer || 'No answer' : 'Watching') : locked ? '🔒 Locked in!' : !state.eligible ? 'Watching' : value || '?';
  $('answer-box').className = `answer-box${reveal ? (me.correct ? ' right' : ' wrong') : locked ? ' locked' : ''}`;
  for (const button of $('keypad').querySelectorAll('button')) {
    button.disabled = reveal || locked || pending || !state.eligible || !socket.connected || Date.now() + offset >= state.deadline;
  }
  if (!reveal) $('answer-hint').textContent = locked ? 'Your answer stays secret until the reveal.' : !state.eligible ? 'Cheer on the tiebreakers!' : 'Tap the numbers, then lock it in.';
}

async function key(key) {
  if (!state || state.phase !== 'question' || locked || pending || !state.eligible || !socket.connected || Date.now() + offset >= state.deadline) return;
  if (key === 'submit' && !value) {
    $('answer-box').classList.remove('shake');
    void $('answer-box').offsetWidth;
    $('answer-box').classList.add('shake');
    return;
  }
  if (/^\d$/.test(key)) {
    if (value === '0') value = key;
    else if (value.length < 4) value += key;
    else return;
  } else if (key === 'clear') value = '';
  else if (key === 'back') value = value.slice(0, -1);
  else if (key !== 'submit') return;
  const submit = key === 'submit';
  const questionId = state.question.id;
  if (submit) pending = true;
  renderAnswer();
  // Every edit is saved in socket order so an unsubmitted draft counts at timeout.
  const result = await emit(socket, 'answer', { questionId, value, submit });
  if (submit && questionId === state.question?.id) {
    pending = false;
    if (result.ok) locked = true;
    renderAnswer();
  }
}
$('keypad').addEventListener('click', event => {
  const button = event.target.closest('button[data-key]');
  if (button) key(button.dataset.key);
});
document.addEventListener('keydown', event => {
  if (!state || state.phase !== 'question' || event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA/.test(event.target.tagName)) return;
  const mapped = /^\d$/.test(event.key) ? event.key : { Backspace: 'back', Delete: 'clear', Enter: 'submit' }[event.key];
  if (mapped) { event.preventDefault(); key(mapped); }
});
setInterval(() => {
  if (state && ['question', 'reveal'].includes(state.phase)) {
    updateTimer(state, offset);
    if (Date.now() + offset >= state.deadline) {
      for (const button of $('keypad').querySelectorAll('button')) button.disabled = true;
    }
  }
}, 100);
