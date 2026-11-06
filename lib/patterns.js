export function patternPool(maxNumber) {
  const pool = [];
  const prompts = new Set();
  function add(sequence, rule, hint, explanation, details = {}) {
    if (sequence.some(n => !Number.isInteger(n) || n < 0 || n > maxNumber)) return;
    for (let missingIndex = 0; missingIndex < sequence.length; missingIndex++) {
      const kind = missingIndex === 0 ? 'previous' : missingIndex === 4 ? 'next' : 'missing';
      const prompt = kind === 'next' ? 'What number comes next?' :
        kind === 'previous' ? 'What number comes before?' : 'What is the missing number?';
      const shown = sequence.map((number, i) => i === missingIndex ? '...' : number).join(', ');
      const text = `${prompt}${hint ? ` ${hint}` : ''}\n${shown}`;
      if (prompts.has(text)) continue;
      prompts.add(text);
      pool.push({
        type: 'pattern', rule, kind, sequence, missingIndex, ...details, text,
        answer: sequence[missingIndex],
        explanation: `${explanation}: ${sequence.join(', ')}.`,
      });
    }
  }
  for (let step = 1; step <= Math.floor(maxNumber / 4); step++) {
    for (let start = 0; start + step * 4 <= maxNumber; start++) {
      for (const direction of [1, -1]) {
        const sequence = Array.from({ length: 5 }, (_, i) =>
          start + step * (direction === 1 ? i : 4 - i));
        add(sequence, 'constant', '', `Count ${direction === 1 ? 'up' : 'down'} by ${step}`,
          { step: step * direction });
      }
    }
  }
  for (let start = 1; start * 16 <= maxNumber; start++) {
    const sequence = Array.from({ length: 5 }, (_, i) => start * 2 ** i);
    add(sequence, 'doubling', 'Double each time.', 'Multiply by 2 each time');
    add([...sequence].reverse(), 'halving', 'Halve each time.', 'Divide by 2 each time');
  }
  for (let step = 1; step * 6 <= maxNumber; step++) {
    for (let start = 0; start + step * 6 <= maxNumber; start++) {
      for (const direction of [1, -1]) {
        const jumps = [step, step * 2, step, step * 2].map(n => n * direction);
        const first = direction === 1 ? start : start + step * 6;
        const sequence = [first];
        for (const jump of jumps) sequence.push(sequence.at(-1) + jump);
        const action = direction === 1 ? 'Add' : 'Subtract';
        add(sequence, 'alternating', `${action} ${step}, then ${step * 2}; repeat.`,
          `${action} ${step}, then ${step * 2}, alternating`, { jumps });
      }
    }
  }
  for (let step = 1; step * 4 + 6 <= maxNumber; step++) {
    for (let start = 0; start + step * 4 + 6 <= maxNumber; start++) {
      for (const direction of [1, -1]) {
        const jumps = Array.from({ length: 4 }, (_, i) => (step + i) * direction);
        const sequence = [direction === 1 ? start : start + step * 4 + 6];
        for (const jump of jumps) sequence.push(sequence.at(-1) + jump);
        const action = direction === 1 ? 'Add' : 'Subtract';
        add(sequence, 'growing', `${action} ${jumps.map(Math.abs).join(', ')} in order.`,
          `${action} bigger jumps: ${jumps.map(Math.abs).join(', ')}`, { jumps });
      }
    }
  }
  for (let first = 0; first < maxNumber; first++) {
    for (let gap = 1; gap <= 5 && first + gap <= maxNumber; gap++) {
      const second = first + gap;
      add([first, second, first, second, first], 'repeating', 'Repeat the two numbers.',
        'Repeat the same pair of numbers');
      add([second, first, second, first, second], 'repeating', 'Repeat the two numbers.',
        'Repeat the same pair of numbers');
    }
  }
  return pool;
}
