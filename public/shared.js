export const avatars = {
  fox: '🦊', panda: '🐼', cat: '🐱', frog: '🐸', owl: '🦉', unicorn: '🦄',
  dog: '🐶', lion: '🦁', tiger: '🐯', penguin: '🐧', koala: '🐨', octopus: '🐙',
};
export const symbols = { '+': '+', '-': '−', '*': '×', '/': '÷' };
export const $ = id => document.getElementById(id);
export const equation = q => `${q.a} ${symbols[q.op]} ${q.b}`;

export function renderQuestion(state, questionElement, labelElement, reasoningElement) {
  const story = state.question.type === 'story';
  const reveal = state.phase === 'reveal';
  questionElement.textContent = story ? state.question.text :
    `${equation(state.question)} = ${reveal ? state.question.answer : '?'}`;
  questionElement.classList.toggle('story', story);
  questionElement.classList.toggle('long', !story && questionElement.textContent.length > 11);
  questionElement.closest('.card').classList.toggle('story-card', story);
  labelElement.textContent = story ? '📖 Story' : '🔢 Calculation';
  reasoningElement.hidden = !story || !reveal;
  reasoningElement.textContent = story && reveal ? state.question.explanation : '';
}

export function showError(message) {
  $('error').textContent = message;
  $('error').hidden = !message;
}

export function emit(socket, event, payload = {}) {
  return new Promise(resolve => {
    socket.timeout(5000).emit(event, payload, (error, result) => {
      if (error) {
        showError('Connection interrupted. Please wait for reconnection before trying again.');
        resolve({ error: 'Connection interrupted.' });
      } else {
        if (result?.error) showError(result.error);
        resolve(result ?? { error: 'No server response.' });
      }
    });
  });
}

export function connection(socket, connected) {
  socket.on('connect', () => {
    $('connection').textContent = '● Connected';
    $('connection').classList.remove('offline');
    showError('');
    connected();
  });
  socket.on('disconnect', reason => {
    $('connection').textContent = 'Reconnecting…';
    $('connection').classList.add('offline');
    showError(reason === 'io server disconnect' ?
      'The host removed this player. Reload to join again with a new name.' :
      'Connection lost. Answers cannot be saved until you reconnect. Keep this page open.');
  });
  socket.on('connect_error', () => {
    showError('Cannot reach the game. Check your Wi-Fi and that the host’s server window is open.');
  });
}

export function playerChip(player, withScore = false) {
  const chip = document.createElement('span');
  chip.className = 'player-chip';
  chip.textContent = `${avatars[player.avatar]} ${player.name}${withScore ? ` · ${player.score} pts` : ''}${!player.connected ? ' (offline)' : ''}`;
  return chip;
}

export function scoreboard(element, state, reveal = false) {
  element.replaceChildren();
  for (const player of [...state.players].sort((a, b) => b.score - a.score)) {
    const row = document.createElement('div');
    row.className = 'score-row';
    const name = document.createElement('strong');
    name.textContent = `${avatars[player.avatar]} ${player.name}${state.participantCount > 1 && state.winners.includes(player.id) ? ' 👑' : ''}`;
    const status = document.createElement('span');
    status.className = 'row-status';
    status.textContent = reveal ? (!player.played ? 'Watching' : `${player.correct ? '✓' : '✗'} ${player.answer === '' ? 'No answer' : player.answer}${player.correct ? ' · +1 point' : ''}`) :
      (!player.connected ? 'Reconnecting…' : state.phase === 'question' ? (player.submitted ? '🔒 Locked in' : 'Thinking…') : '');
    const score = document.createElement('b');
    score.className = 'points';
    score.textContent = `${player.score} pts`;
    row.append(name, status, score);
    element.append(row);
  }
}

export function finalScreen(state) {
  const solo = state.participantCount === 1;
  $('winner-title').closest('section').querySelector('.eyebrow').textContent = solo ? 'Practice complete' : 'Family math champions';
  const names = state.players.filter(p => state.winners.includes(p.id)).map(p => p.name);
  const player = state.players.find(p => state.winners.includes(p.id));
  $('winner-title').textContent = solo ? `Great practice, ${player.name}!` :
    names.length > 1 ? `${names.join(' & ')} win together!` : `${names[0]} wins!`;
  $('winner-message').textContent = solo ? `You answered ${player.score} of ${state.settings.questionCount} questions correctly. Every question makes your brain stronger!` :
    names.length > 1 ? 'A brilliant team of co-champions. Well played, everyone!' :
    state.isTiebreaker ? 'Tiebreaker winner — correct answers first, then speed. Well played, everyone!' :
      'Great thinking, everyone. Every question makes your brain stronger!';
  scoreboard($('final-scores'), state);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches && !document.querySelector('.confetti')) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    confetti.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 36; i++) {
      const piece = document.createElement('i');
      piece.style.setProperty('--x', `${Math.random() * 100}%`);
      piece.style.setProperty('--delay', `${Math.random() * 1.5}s`);
      piece.style.setProperty('--color', ['#7c5ce7', '#ffbc57', '#54bfa1', '#ff8b96'][i % 4]);
      confetti.append(piece);
    }
    document.body.append(confetti);
    setTimeout(() => confetti.remove(), 5000);
  }
}

export function updateTimer(state, offset) {
  const active = state.phase === 'question';
  const remaining = active ? Math.max(0, state.deadline - (Date.now() + offset)) : 0;
  const fraction = remaining / state.durationMs;
  $('seconds').textContent = active ? `${Math.ceil(remaining / 1000)}s` : '';
  $('timer-caption').textContent = active ? (state.isTiebreaker ? 'Speed counts!' : 'Time remaining') : 'Answer revealed';
  $('timer-fill').style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
  $('timer-fill').style.background = fraction > 0.5 ? '#22c55e' : fraction > 0.2 ? '#f59e0b' : '#ef4444';
  $('timer').setAttribute('aria-valuemax', String(state.durationMs / 1000));
  $('timer').setAttribute('aria-valuenow', String(Math.ceil(remaining / 1000)));
  return remaining;
}
