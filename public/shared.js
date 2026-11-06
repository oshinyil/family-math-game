export const avatars = {
  fox: '🦊', panda: '🐼', cat: '🐱', frog: '🐸', owl: '🦉', unicorn: '🦄',
  dog: '🐶', lion: '🦁', tiger: '🐯', penguin: '🐧', koala: '🐨', octopus: '🐙',
};
export const $ = id => document.getElementById(id);

export function countdownText(state, offset) {
  if (state.phase !== 'reveal' || !state.advanceAt) return null;
  const seconds = Math.max(0, Math.ceil((state.advanceAt - Date.now() - offset) / 1000));
  const destination = state.round >= state.settings.questionCount ? 'Results' : 'Next question';
  return `${destination} in ${seconds}…`;
}

export function renderQuestion(state, questionElement, labelElement, reasoningElement) {
  const written = state.question.type !== 'calculation';
  const pattern = state.question.type === 'pattern';
  const reveal = state.phase === 'reveal';
  questionElement.textContent = state.question.text;
  if (!written && reveal) {
    questionElement.textContent = state.question.explanation;
  } else if (pattern && reveal) {
    questionElement.textContent = state.question.text.replace('...', String(state.question.answer));
  }
  questionElement.classList.toggle('story', written);
  questionElement.classList.toggle('pattern', pattern);
  questionElement.classList.toggle('compare', state.question.type === 'compare');
  questionElement.classList.toggle('long', !written && questionElement.textContent.length > 11);
  questionElement.closest('.card').classList.toggle('story-card', written);
  questionElement.closest('.card').classList.toggle('visual-card', state.question.type === 'visual');
  labelElement.textContent = {
    calculation: '🔢 Find the missing number', story: '📖 Story', pattern: '🧩 Number pattern',
    compare: 'Compare and balance', everyday: 'Everyday math', visual: 'Visual puzzle',
  }[state.question.type];
  let visualElement = questionElement.nextElementSibling;
  if (!visualElement?.classList.contains('visual-puzzle')) {
    visualElement = document.createElement('div');
    visualElement.className = 'visual-puzzle';
    questionElement.after(visualElement);
  }
  visualElement.hidden = state.question.type !== 'visual';
  visualElement.replaceChildren();
  if (!visualElement.hidden) {
    visualElement.setAttribute('role', 'img');
    visualElement.setAttribute('aria-label', state.question.visual.description);
    const shapes = { circle: '●', square: '■', triangle: '▲' };
    for (const row of state.question.visual.rows) {
      const rowElement = document.createElement('div');
      rowElement.className = 'shape-row';
      rowElement.setAttribute('aria-hidden', 'true');
      for (const shape of row) {
        const item = document.createElement('span');
        item.dataset.shape = shape;
        item.textContent = shapes[shape];
        rowElement.append(item);
      }
      visualElement.append(rowElement);
    }
  }
  reasoningElement.hidden = !written || !reveal;
  reasoningElement.textContent = written && reveal ? state.question.explanation : '';
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
