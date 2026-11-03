import { randomUUID } from 'node:crypto';
import { DEFAULT_SETTINGS, generateDeck, validateSettings } from './questions.js';

const AVATARS = ['fox', 'panda', 'cat', 'frog', 'owl', 'unicorn',
  'dog', 'lion', 'tiger', 'penguin', 'koala', 'octopus'];

export class Game {
  constructor({ onChange = () => {}, now = Date.now, schedule = setTimeout, cancel = clearTimeout } = {}) {
    this.onChange = onChange;
    this.now = now;
    this.schedule = schedule;
    this.cancel = cancel;
    this.players = new Map();
    this.settings = { ...DEFAULT_SETTINGS };
    this.phase = 'lobby';
    this.round = 0;
    this.winners = [];
    this.responses = new Map();
  }

  join({ token, name, avatar }) {
    if (typeof token === 'string' && this.players.has(token)) return this.players.get(token);
    if (this.phase !== 'lobby') throw new Error('A game is in progress. Ask the host to start a new game before joining.');
    name = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
    if (!name || name.length > 20 || /[\u0000-\u001f\u007f]/.test(name)) {
      throw new Error('Please use a name with 1 to 20 characters.');
    }
    if ([...this.players.values()].some(p => p.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      throw new Error('That name is already in the lobby. Try a different name.');
    }
    if (this.players.size >= 12) throw new Error('The game is full (12 players maximum).');
    const player = { token: randomUUID(), id: randomUUID(), name,
      avatar: AVATARS.includes(avatar) ? avatar : 'fox', score: 0, sockets: new Set() };
    this.players.set(player.token, player);
    return player;
  }

  connect(player, socketId) {
    player.sockets.add(socketId);
    this.onChange();
  }

  disconnect(player, socketId) {
    player.sockets.delete(socketId);
    this.maybeReveal();
    this.onChange();
  }

  start(input = this.settings) {
    if (!['lobby', 'finished'].includes(this.phase)) throw new Error('Finish this game before starting another.');
    const connected = [...this.players.values()].filter(p => p.sockets.size);
    if (connected.length < 1) throw new Error('At least one connected player is needed.');
    const settings = validateSettings(input);
    const deck = generateDeck(settings);
    this.settings = settings;
    this.deck = deck;
    this.participants = connected.map(p => p.id);
    this.round = 0;
    this.isTiebreaker = false;
    this.winners = [];
    for (const player of this.players.values()) player.score = 0;
    this.nextQuestion();
  }

  nextQuestion() {
    if (!this.deck.length) throw new Error('No unused questions remain. Start a new game with a larger range.');
    this.cancel(this.timer);
    this.question = { ...this.deck.pop(), id: randomUUID() };
    this.round++;
    this.responses = new Map();
    this.phase = 'question';
    this.startedAt = this.now();
    this.durationMs = (this.question.type === 'story' ? this.settings.storySeconds :
      this.question.type === 'pattern' ? this.settings.patternSeconds : this.settings.seconds) * 1000;
    this.deadline = this.startedAt + this.durationMs;
    this.timer = this.schedule(() => this.reveal(), this.durationMs);
    this.onChange();
  }

  answer(player, { questionId, value, submit }) {
    if (this.phase !== 'question' || questionId !== this.question.id) throw new Error('That question has ended.');
    if (this.now() >= this.deadline) {
      this.reveal();
      throw new Error('Time is up! Your last saved answer has been counted.');
    }
    if (!this.eligible().includes(player.id)) throw new Error('You are watching this round.');
    if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,3})?$/.test(value) || typeof submit !== 'boolean') {
      throw new Error('Use up to four digits for your answer.');
    }
    if (this.responses.get(player.id)?.submitted) throw new Error('Your answer is already locked.');
    if (submit && value === '') throw new Error('Enter an answer before submitting.');
    this.responses.set(player.id, { value, submitted: submit, at: this.now() });
    this.maybeReveal();
    this.onChange();
  }

  eligible() {
    return this.isTiebreaker ? this.contenders : this.participants ?? [];
  }

  maybeReveal() {
    if (this.phase !== 'question') return;
    const connected = [...this.players.values()].filter(p => this.eligible().includes(p.id) && p.sockets.size);
    if (connected.length && connected.every(p => this.responses.get(p.id)?.submitted)) this.reveal();
  }

  reveal() {
    if (this.phase !== 'question') return;
    this.cancel(this.timer);
    this.phase = 'reveal';
    this.correctPlayers = [];
    for (const player of this.players.values()) {
      if (!this.eligible().includes(player.id)) continue;
      const response = this.responses.get(player.id);
      if (response?.value !== '' && response?.value !== undefined &&
          Number(response.value) === this.question.answer) {
        player.score++;
        this.correctPlayers.push(player.id);
      }
    }
    if (this.isTiebreaker && this.correctPlayers.length) {
      const fastest = Math.min(...this.correctPlayers.map(id => this.responses.get(id).at));
      this.winners = this.correctPlayers.filter(id => this.responses.get(id).at === fastest);
    } else if (this.isTiebreaker) {
      this.winners = [...this.contenders];
    }
    this.onChange();
  }

  next() {
    if (this.phase !== 'reveal') throw new Error('Wait for the answer reveal first.');
    if (this.isTiebreaker || this.round >= this.settings.questionCount) {
      if (!this.isTiebreaker) {
        const participants = [...this.players.values()].filter(p => this.participants.includes(p.id));
        const high = Math.max(...participants.map(p => p.score));
        this.winners = participants.filter(p => p.score === high).map(p => p.id);
      }
      this.phase = 'finished';
      this.onChange();
    } else this.nextQuestion();
  }

  tiebreaker() {
    if (this.phase !== 'finished' || this.winners.length < 2) throw new Error('A tiebreaker needs tied winners.');
    if (!this.deck.length) throw new Error('No unused questions remain. Start a new game with a larger range.');
    const contenders = [...this.winners];
    if (contenders.some(id => ![...this.players.values()].find(p => p.id === id)?.sockets.size)) {
      throw new Error('Wait for all tied players to reconnect.');
    }
    this.contenders = contenders;
    this.isTiebreaker = true;
    this.winners = [];
    this.nextQuestion();
  }

  lobby() {
    this.cancel(this.timer);
    this.phase = 'lobby';
    this.question = null;
    this.round = 0;
    this.isTiebreaker = false;
    this.winners = [];
    this.responses = new Map();
    for (const p of this.players.values()) p.score = 0;
    this.onChange();
  }

  remove(id) {
    if (this.phase !== 'lobby') throw new Error('Players can only be removed in the lobby.');
    const player = [...this.players.values()].find(p => p.id === id);
    if (!player) throw new Error('Player not found.');
    this.players.delete(player.token);
    this.onChange();
    return player;
  }

  snapshot(player) {
    const showAnswer = ['reveal', 'finished'].includes(this.phase);
    const question = this.question ? {
      id: this.question.id, type: this.question.type,
      ...(this.question.type !== 'calculation' ? { text: this.question.text } :
        { a: this.question.a, b: this.question.b, op: this.question.op }),
      ...(showAnswer ? { answer: this.question.answer,
        ...(this.question.type !== 'calculation' ? { explanation: this.question.explanation } : {}) } : {}),
    } : null;
    return {
      phase: this.phase, settings: this.settings, round: this.round, question,
      deadline: this.deadline, durationMs: this.durationMs, serverNow: this.now(), isTiebreaker: Boolean(this.isTiebreaker),
      winners: this.winners, playerId: player?.id, participantCount: this.participants?.length ?? 0,
      eligible: this.phase === 'question' && player ? this.eligible().includes(player.id) : false,
      ownResponse: player ? this.responses.get(player.id) ?? null : null,
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, avatar: p.avatar, score: p.score, connected: p.sockets.size > 0,
        submitted: Boolean(this.responses.get(p.id)?.submitted),
        ...(showAnswer ? { answer: this.responses.get(p.id)?.value ?? '',
          correct: this.correctPlayers?.includes(p.id) ?? false,
          played: this.eligible().includes(p.id) } : {}),
      })),
    };
  }
}
