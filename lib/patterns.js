export function patternPool(maxNumber) {
  const pool = [];
  for (let step = 1; step <= Math.floor(maxNumber / 4); step++) {
    for (let start = 0; start + step * 4 <= maxNumber; start++) {
      for (const direction of [1, -1]) {
        const sequence = Array.from({ length: 5 }, (_, i) =>
          start + step * (direction === 1 ? i : 4 - i));
        for (let missingIndex = 0; missingIndex < sequence.length; missingIndex++) {
          const kind = missingIndex === 0 ? 'previous' : missingIndex === 4 ? 'next' : 'missing';
          const prompt = kind === 'next' ? 'What number comes next?' :
            kind === 'previous' ? 'What number comes before the first number?' : 'What is the missing number?';
          const shown = sequence.map((number, i) => i === missingIndex ? '?' : number).join(', ');
          pool.push({
            type: 'pattern', kind, sequence, missingIndex, step: step * direction,
            text: `${prompt}\n${shown}`,
            answer: sequence[missingIndex],
            explanation: `Count ${direction === 1 ? 'up' : 'down'} by ${step}: ${sequence.join(', ')}.`,
          });
        }
      }
    }
  }
  return pool;
}
