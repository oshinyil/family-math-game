import { randomInt } from 'node:crypto';

export const DEFAULT_SETTINGS = {
  operations: ['+', '-', '*', '/'],
  maxNumber: 12,
  questionCount: 10,
  seconds: 30,
};

export function validateSettings(input) {
  if (!input || !Array.isArray(input.operations) || !input.operations.length ||
      input.operations.some(op => !['+', '-', '*', '/'].includes(op))) {
    throw new Error('Choose at least one valid operation.');
  }
  for (const [key, min, max] of [
    ['maxNumber', 5, 100], ['questionCount', 1, 50], ['seconds', 5, 120],
  ]) {
    if (!Number.isInteger(input[key]) || input[key] < min || input[key] > max) {
      throw new Error(`${key} must be a whole number from ${min} to ${max}.`);
    }
  }
  return {
    operations: [...new Set(input.operations)],
    maxNumber: input.maxNumber, questionCount: input.questionCount, seconds: input.seconds,
  };
}

export function questionPool(input) {
  const { operations, maxNumber } = validateSettings(input);
  const pool = [];
  for (const op of operations) {
    for (let a = 1; a <= maxNumber; a++) {
      for (let b = 1; b <= maxNumber; b++) {
        if ((op === '+' && a < b) ||
            (op === '*' && (a < b || a < 2 || b < 2)) ||
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

export function generateDeck(settings) {
  const pool = questionPool(settings);
  if (pool.length < settings.questionCount) {
    throw new Error(`Only ${pool.length} different questions fit these settings. Choose fewer questions, more operations, or a larger range.`);
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}
