import { randomInt } from 'node:crypto';
import { storyQuestion } from './stories.js';
import { patternPool } from './patterns.js';

export const DEFAULT_SETTINGS = {
  operations: ['+', '-', '*', '/'],
  maxNumber: 12,
  questionCount: 10,
  seconds: 30,
  storySeconds: 60,
  patternSeconds: 30,
  questionType: 'calculations',
  storySteps: 'one',
  autoContinue: false,
};

export function validateSettings(input) {
  input = { questionType: 'calculations', storySteps: 'one', storySeconds: 60, patternSeconds: 30, autoContinue: false, ...input };
  if (!input || !Array.isArray(input.operations) || (!input.operations.length && input.questionType !== 'patterns') ||
      input.operations.some(op => !['+', '-', '*', '/'].includes(op))) {
    throw new Error('Choose at least one valid operation.');
  }
  for (const [key, min, max] of [
    ['maxNumber', 5, 100], ['questionCount', 1, 50], ['seconds', 5, 120],
    ['storySeconds', 15, 180], ['patternSeconds', 5, 180],
  ]) {
    if (!Number.isInteger(input[key]) || input[key] < min || input[key] > max) {
      throw new Error(`${key} must be a whole number from ${min} to ${max}.`);
    }
  }
  if (!['calculations', 'stories', 'patterns', 'mix'].includes(input.questionType)) throw new Error('Choose Calculations, Stories, Patterns, or Mix.');
  if (!['one', 'mixed'].includes(input.storySteps)) throw new Error('Choose one-step stories or one- and two-step stories.');
  if (typeof input.autoContinue !== 'boolean') throw new Error('Auto-continue must be on or off.');
  return {
    operations: [...new Set(input.operations)],
    maxNumber: input.maxNumber, questionCount: input.questionCount, seconds: input.seconds,
    storySeconds: input.storySeconds, patternSeconds: input.patternSeconds,
    questionType: input.questionType, storySteps: input.storySteps,
    autoContinue: input.autoContinue,
  };
}

export function questionPool(input) {
  const { operations, maxNumber } = validateSettings(input);
  const pool = [];
  for (const op of operations) {
    for (let a = 1; a <= maxNumber; a++) {
      for (let b = 1; b <= maxNumber; b++) {
        if ((op === '+' && a < b) ||
            (op === '*' && (a < b || a < 2 || b < 2 || a * b > maxNumber)) ||
            (op === '-' && a < b) ||
            (op === '/' && (b < 2 || a < b * 2 || a % b !== 0))) continue;
        const answer = op === '+' ? a + b : op === '-' ? a - b :
          op === '*' ? a * b : a / b;
        if (answer <= 9999) pool.push({ a, b, op, answer });
      }
    }
  }
  return pool;
}

function shuffle(pool) {
  for (let i = pool.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

function alternate(first, second) {
  return interleave([first, second]);
}

function interleave(pools) {
  const result = [];
  while (pools.some(pool => pool.length)) {
    for (const pool of pools) if (pool.length) result.push(pool.pop());
  }
  return result;
}

function patternDeck(maxNumber) {
  const patterns = patternPool(maxNumber);
  const rules = [...new Set(patterns.map(q => q.rule))];
  const kinds = ['next', 'previous', 'missing'];
  const groups = kinds.map(kind => rules.map(rule =>
    shuffle(patterns.filter(q => q.kind === kind && q.rule === rule))));
  const deck = [];
  let cursor = 0;
  while (deck.length < patterns.length) {
    for (const group of groups) {
      for (let attempt = 0; attempt < rules.length; attempt++) {
        const bucket = group[cursor++ % rules.length];
        if (bucket.length) {
          deck.push(bucket.pop());
          break;
        }
      }
    }
  }
  return deck.reverse();
}

export function generateDeck(input) {
  const settings = validateSettings(input);
  const bases = settings.questionType === 'patterns' ? [] : shuffle(questionPool(settings));
  const calculations = bases.map(q => ({ ...q, type: 'calculation' }));
  let pool = calculations;
  if (settings.questionType === 'patterns') pool = patternDeck(settings.maxNumber);
  if (['stories', 'mix'].includes(settings.questionType)) {
    const oneStep = [], twoStep = [];
    for (const q of bases) {
      oneStep.push(storyQuestion(q, settings.maxNumber));
      if (settings.storySteps === 'mixed') {
        const story = storyQuestion(q, settings.maxNumber, true);
        if (story) twoStep.push(story);
      }
    }
    // Alternate shuffled pools so a mixed game actually includes both kinds.
    const stories = settings.storySteps === 'mixed' ? alternate(shuffle(oneStep), shuffle(twoStep)) : shuffle(oneStep);
    const unique = [...new Map(stories.map(q => [q.text, q])).values()];
    const mixedStories = [...unique].reverse();
    pool = settings.questionType === 'stories' ? unique :
      interleave(shuffle([calculations, mixedStories, patternDeck(settings.maxNumber)]));
    pool.reverse();
  }
  if (pool.length < settings.questionCount) {
    throw new Error(`Only ${pool.length} different questions fit these settings. Choose fewer questions, more operations, or a larger range.`);
  }
  return pool;
}
