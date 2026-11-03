import { randomInt } from 'node:crypto';

const names = ['Mia', 'Leo', 'Ava', 'Noah', 'Zoe', 'Kai', 'Lily', 'Ben'];
const items = ['stickers', 'shells', 'marbles', 'beads', 'cards', 'buttons'];
const places = ['at the park', 'at school', 'at the beach', 'at the club'];
const symbols = { '+': '+', '-': '−', '*': '×', '/': '÷' };
const pick = values => values[randomInt(values.length)];
const calculate = (a, op, b) => op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : a / b;
const line = (a, op, b, answer) => `${a} ${symbols[op]} ${b} = ${answer}`;

const templates = {
  '+': [
    (n, i, p, a, b) => `${n} has ${a} ${i}. A friend gives ${n} ${b} more. How many ${i} does ${n} have now?`,
    (n, i, p, a, b) => `${n} finds ${a} ${i} in the morning and ${b} in the afternoon ${p}. How many ${i} does ${n} find altogether?`,
    (n, i, p, a, b) => `A treasure box holds ${a} ${i}. ${n} adds ${b} ${i} to the box. How many ${i} are in the box now?`,
    (n, i, p, a, b) => `${n} counts ${a} ${i} on one table and ${b} on another ${p}. How many ${i} are on both tables altogether?`,
  ],
  '-': [
    (n, i, p, a, b) => `${n} has ${a} ${i} and gives ${b} to a friend. How many ${i} does ${n} have left?`,
    (n, i, p, a, b) => `A box has ${a} ${i}. ${n} takes out ${b} to make a picture. How many ${i} stay in the box?`,
    (n, i, p, a, b) => `${n} wants to collect ${a} ${i} and already has ${b}. How many more ${i} does ${n} need?`,
    (n, i, p, a, b) => `${n} brings ${a} ${i} ${p}. After giving away ${b}, how many ${i} can ${n} take home?`,
  ],
  '*': [
    (n, i, p, a, b) => `${n} fills ${a} bags with ${b} ${i} in each bag. How many ${i} are in all the bags?`,
    (n, i, p, a, b) => `There are ${a} rows of ${i}, with ${b} in each row. How many ${i} does ${n} count altogether?`,
    (n, i, p, a, b) => `${n} collects ${b} ${i} each day for ${a} days. How many ${i} does ${n} collect in total?`,
    (n, i, p, a, b) => `${n} gives each of ${a} friends ${b} ${i}. How many ${i} does ${n} give away altogether?`,
  ],
  '/': [
    (n, i, p, a, b) => `${n} shares ${a} ${i} equally among ${b} friends. How many ${i} does each friend get?`,
    (n, i, p, a, b) => `${n} puts ${a} ${i} into bags of ${b}. How many full bags does ${n} fill?`,
    (n, i, p, a, b) => `${n} arranges ${a} ${i} in ${b} equal rows. How many ${i} go in each row?`,
    (n, i, p, a, b) => `A team finds ${a} ${i} ${p} and shares them into ${b} equal boxes. How many ${i} go in each box?`,
  ],
};

const twoStepTemplates = {
  '+': [
    (n, i, a, b, c) => `${n} has ${a} ${i}, finds ${b} more, then gets ${c} from a friend. How many ${i} does ${n} have now?`,
    (n, i, a, b, c) => `A box holds ${a} ${i}. ${n} adds ${b} in the morning and ${c} after lunch. How many ${i} are in the box now?`,
  ],
  '-': [
    (n, i, a, b, c) => `${n} has ${a} ${i}, gives away ${b}, then uses ${c} for a picture. How many ${i} are left?`,
    (n, i, a, b, c) => `A box has ${a} ${i}. ${n} takes out ${b}, then a friend takes out ${c}. How many ${i} stay in the box?`,
  ],
  '*': [
    (n, i, a, b, c) => `${n} has ${a} boxes. Each box holds ${b} bags, and each bag holds ${c} ${i}. How many ${i} are there altogether?`,
    (n, i, a, b, c) => `There are ${a} teams. Each team has ${b} children. ${n} gives each child ${c} ${i}. How many ${i} are needed altogether?`,
  ],
  '/': [
    (n, i, a, b, c) => `${n} shares ${a} ${i} equally among ${b} teams. Each team shares its ${i} equally among ${c} children. How many ${i} does each child get?`,
    (n, i, a, b, c) => `${n} sorts ${a} ${i} equally into ${b} boxes, then splits each box equally into ${c} bags. How many ${i} go in each bag?`,
  ],
};

export function storyQuestion(base, maxNumber, twoStep = false) {
  const { a, b, op } = base;
  const name = pick(names), item = pick(items);
  let text, steps = [{ a, b, op, answer: base.answer }];
  if (twoStep) {
    if (base.answer > maxNumber) return null;
    const candidates = [];
    for (let c = 2; c <= maxNumber; c++) {
      const answer = calculate(base.answer, op, c);
      if (Number.isInteger(answer) && answer >= 0 && answer <= 9999 &&
          (op !== '/' || answer >= 2)) candidates.push(c);
    }
    if (!candidates.length || (op === '*' && base.answer < 2)) return null;
    const c = pick(candidates);
    steps.push({ a: base.answer, b: c, op, answer: calculate(base.answer, op, c) });
    text = pick(twoStepTemplates[op])(name, item, a, b, c);
  } else text = pick(templates[op])(name, item, pick(places), a, b);
  return {
    ...base, type: 'story', text, steps,
    answer: steps.at(-1).answer,
    explanation: steps.map(step => line(step.a, step.op, step.b, step.answer)).join('; '),
  };
}
