const symbols = { '+': '+', '-': '−', '*': '×', '/': '÷' };
const expression = q => `${q.a} ${symbols[q.op]} ${q.b}`;

export function comparePool(bases) {
  const comparisons = [], balances = [];
  const matches = new Map();
  for (const q of bases) {
    const key = `${q.op}:${q.answer}`;
    if (!matches.has(key)) matches.set(key, []);
    matches.get(key).push(q);
  }
  for (const q of bases) {
    for (const difference of [-1, 0, 1]) {
      const right = q.answer + difference;
      if (right < 0) continue;
      const answer = difference < 0 ? 1 : difference > 0 ? 2 : 0;
      comparisons.push({
        type: 'compare', kind: 'compare', answer, steps: [q],
        text: `Which side is larger?\nLeft: ${expression(q)}\nRight: ${right}\nEnter 1 = left, 2 = right, 0 = equal.`,
        explanation: `${expression(q)} = ${q.answer}. ${q.answer} ${difference < 0 ? '>' : difference > 0 ? '<' : '='} ${right}. Enter ${answer}: ${answer === 0 ? 'both sides are equal' : answer === 1 ? 'left is larger' : 'right is larger'}.`,
      });
    }
    const group = matches.get(`${q.op}:${q.answer}`);
    const partner = group[(group.indexOf(q) + 1) % group.length];
    if (partner === q) continue;
    balances.push({
      type: 'compare', kind: 'balance', answer: partner.b, steps: [q, partner],
      text: `Find the missing number to balance both sides:\n${expression(q)} = ${partner.a} ${symbols[q.op]} ...`,
      explanation: `${expression(q)} = ${q.answer}; ${expression(partner)} = ${partner.answer}. The missing number is ${partner.b}.`,
    });
  }
  return { comparisons, balances };
}

const everydayTemplates = {
  '+': [
    (a, b) => `You save ${a} cents on Monday and ${b} cents on Tuesday. How many cents have you saved in total?`,
    (a, b) => `A walk takes ${a} minutes and a bus ride takes ${b} minutes. How many minutes does the whole journey take?`,
    (a, b) => `You pack ${a} sandwiches and ${b} apples for a picnic. How many food items do you pack altogether?`,
  ],
  '-': [
    (a, b) => `You have ${a} cents and spend ${b} cents on a pencil. How many cents are left?`,
    (a, b) => `You have ${a} minutes before leaving. Packing takes ${b} minutes. How many minutes remain after packing?`,
    (a, b) => `There are ${a} seats on a bus and ${b} people sit down. How many seats are empty?`,
  ],
  '*': [
    (a, b) => `You buy ${a} pencils. Each costs ${b} cents. How many cents do you pay altogether?`,
    (a, b) => `You practise music for ${b} minutes each day for ${a} days. How many minutes of practice is that?`,
    (a, b) => `You pack ${a} lunch boxes with ${b} grapes in each box. How many grapes do you need?`,
  ],
  '/': [
    (a, b) => `You have ${a} cents. Each sticker costs ${b} cents. How many stickers can you buy using all your money?`,
    (a, b) => `You split ${a} minutes of practice equally over ${b} days. How many minutes do you practise each day?`,
    (a, b) => `You share ${a} crackers equally among ${b} lunch boxes. How many crackers go in each box?`,
  ],
};

export function everydayQuestion(base, variant = 0) {
  const template = everydayTemplates[base.op]?.[variant];
  if (!template) throw new Error('Choose a valid everyday scenario.');
  const unit = variant === 0 ? (base.op === '/' ? 'stickers' : 'cents') :
    variant === 1 ? 'minutes' : base.op === '-' ? 'empty seats' :
      base.op === '*' ? 'grapes' : base.op === '/' ? 'crackers per box' : 'food items';
  return {
    type: 'everyday', kind: ['money', 'time', 'packing'][variant],
    text: template(base.a, base.b), answer: base.answer, steps: [base],
    explanation: `${expression(base)} = ${base.answer} ${unit}.`,
  };
}

export const SHAPES = { circle: '●', square: '■', triangle: '▲' };

export function visualPool(maxNumber) {
  const pool = [];
  const unique = new Set();
  const add = (rows, target) => {
    const text = target ? `How many ${target}s can you see? Count only the ${target}s.` :
      'How many shapes can you see altogether?';
    const key = JSON.stringify([rows, target]);
    if (unique.has(key)) return;
    unique.add(key);
    const flat = rows.flat();
    const answer = target ? flat.filter(shape => shape === target).length : flat.length;
    const counts = rows.map(row => target ? row.filter(shape => shape === target).length : row.length);
    pool.push({
      type: 'visual', kind: target ? 'selected' : 'total', text, answer,
      visual: { rows, description: rows.map((row, i) => `Row ${i + 1}: ${row.join(', ')}.`).join(' ') },
      explanation: `Count ${target ? `the ${target}s` : 'all shapes'} in each row: ${counts.join(' + ')} = ${answer}.`,
    });
  };
  for (let total = 2; total <= Math.min(maxNumber, 24); total++) {
    for (let width = 2; width <= 6; width++) {
      if (Math.ceil(total / width) > 4) continue;
      for (const target of Object.keys(SHAPES)) {
        const other = Object.keys(SHAPES).find(shape => shape !== target);
        for (const period of [2, 3, 4]) {
          const shapes = Array.from({ length: total }, (_, i) => i % period === 0 ? other : target);
          const rows = [];
          for (let i = 0; i < shapes.length; i += width) rows.push(shapes.slice(i, i + width));
          add(rows, target);
          add(rows, null);
        }
      }
    }
  }
  return pool;
}
