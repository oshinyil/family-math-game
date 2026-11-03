import { $, avatars, renderQuestion, countdownText, showError, emit, connection, scoreboard, finalScreen, updateTimer } from './shared.js';

const socket = io({ autoConnect: false });
let state;
let offset = 0;
connection(socket, () => emit(socket, 'host'));
socket.on('state', next => {
  state = next;
  offset = state.serverNow - Date.now();
  render();
});
socket.connect();

async function loadJoinUrls() {
  try {
    const response = await fetch('/api/join');
    if (!response.ok) throw new Error('Unable to find the join address.');
    const { urls, codes } = await response.json();
    $('join-urls').replaceChildren();
    for (const url of urls) {
      const link = document.createElement('a');
      link.href = url;
      link.textContent = url;
      link.target = '_blank';
      link.rel = 'noopener';
      $('join-urls').append(link);
      const option = document.createElement('option');
      option.value = url;
      option.textContent = url;
      $('join-address').append(option);
    }
    if (!urls.length) $('join-urls').textContent = 'No home-network address found. Connect this PC to Wi-Fi or Ethernet and reload.';
    if (urls.length) {
      $('qr').src = codes[0];
      $('qr').hidden = false;
      $('address-label').hidden = urls.length < 2;
      $('join-address').onchange = () => { $('qr').src = codes[urls.indexOf($('join-address').value)]; };
    }
  } catch (error) { showError(error.message); }
}
loadJoinUrls();

function render() {
  const lobby = state.phase === 'lobby';
  $('host-lobby').hidden = !lobby;
  $('host-game').hidden = !['question', 'reveal'].includes(state.phase);
  $('host-final').hidden = state.phase !== 'finished';
  $('end-game').hidden = lobby || state.phase === 'finished';
  if (lobby) {
    const connected = state.players.filter(p => p.connected).length;
    $('player-count').textContent = `${connected} ready`;
    $('start').disabled = connected < 1;
    $('roster').replaceChildren();
    if (!state.players.length) $('roster').textContent = 'Waiting for explorers… One player is enough to practise!';
    for (const player of state.players) {
      const row = document.createElement('div');
      row.className = 'lobby-row';
      const label = document.createElement('span');
      label.textContent = `${avatars[player.avatar]} ${player.name}`;
      const status = document.createElement('small');
      status.textContent = player.connected ? '● Ready' : 'Offline';
      const remove = document.createElement('button');
      remove.className = 'text-button';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove ${player.name}`);
      remove.onclick = () => emit(socket, 'remove', { id: player.id });
      row.append(label, status, remove);
      $('roster').append(row);
    }
  } else if (state.phase === 'finished') {
    finalScreen(state);
    $('tiebreaker').hidden = state.winners.length < 2;
    $('tie-rules').hidden = state.winners.length < 2;
  } else {
    const reveal = state.phase === 'reveal';
    $('host-round').textContent = state.isTiebreaker ? '⚡ Tiebreaker' : `Question ${state.round} of ${state.settings.questionCount}`;
    $('host-status').textContent = countdownText(state, offset) ?? (reveal ? 'Answer time!' : `${state.players.filter(p => p.submitted).length} locked in`);
    renderQuestion(state, $('host-equation'), $('host-type'), $('host-reasoning'));
    $('host-prompt').textContent = reveal ? 'A little wiser, all together.' : 'Give everyone a little thinking space.';
    $('correct-answer').hidden = !reveal || state.question.type !== 'calculation';
    $('correct-answer').textContent = reveal ? `The answer is ${state.question.answer}` : '';
    $('next').hidden = !reveal;
    $('next').textContent = state.isTiebreaker || state.round >= state.settings.questionCount ?
      (state.participantCount === 1 ? 'See your results →' : 'See the winners →') : 'Next question →';
    if (state.advanceAt) $('next').textContent = state.round >= state.settings.questionCount ? 'See results now →' : 'Next now →';
    $('board-heading').textContent = reveal ? 'Look at that thinking!' : 'The thinking team';
    scoreboard($('game-roster'), state, reveal);
    updateTimer(state, offset);
  }
}

$('settings-form').addEventListener('submit', event => {
  event.preventDefault();
  showError('');
  emit(socket, 'start', {
    operations: [...document.querySelectorAll('input[name="op"]:checked')].map(input => input.value),
    maxNumber: Number($('max-number').value),
    questionCount: Number($('question-count').value),
    seconds: Number($('question-seconds').value),
    storySeconds: Number($('story-seconds').value),
    patternSeconds: Number($('pattern-seconds').value),
    questionType: $('question-type').value,
    storySteps: $('story-steps').value,
    autoContinue: $('auto-continue').checked,
  });
});
for (const [id, event] of [['next', 'next'], ['tiebreaker', 'tiebreaker'], ['new-game', 'lobby']]) {
  $(id).onclick = () => { showError(''); emit(socket, event); };
}
$('play-again').onclick = () => emit(socket, 'start', state.settings);
$('end-game').onclick = () => {
  if (confirm('End this game and reset all scores?')) emit(socket, 'lobby');
};
setInterval(() => {
  if (state && ['question', 'reveal'].includes(state.phase)) updateTimer(state, offset);
  if (state && countdownText(state, offset)) $('host-status').textContent = countdownText(state, offset);
  for (const button of document.querySelectorAll('button')) {
    if (!socket.connected) button.disabled = true;
    else if (button.id !== 'start') button.disabled = false;
  }
  for (const input of document.querySelectorAll('#settings-form input, #settings-form select')) input.disabled = !socket.connected;
  if (state?.phase === 'lobby' && socket.connected) $('start').disabled = state.players.filter(p => p.connected).length < 1;
}, 100);
