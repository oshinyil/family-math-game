import { randomInt } from 'node:crypto';

const names = ['Mia', 'Leo', 'Ava', 'Noah', 'Zoe', 'Kai', 'Lily', 'Ben',
  'Ruby', 'Finn', 'Ivy', 'Arlo', 'Nora', 'Oscar', 'Amira', 'Charlie'];
const items = ['stickers', 'shells', 'marbles', 'beads', 'cards', 'buttons',
  'toy cars', 'puzzle pieces', 'building blocks', 'ribbons', 'crayons', 'paper stars',
  'toy dinosaurs', 'stamps', 'pine cones', 'painted stones'];
const places = ['at the park', 'at school', 'at the beach', 'at the club',
  'at the science fair', 'in the treehouse', 'at the campsite', 'in the garden',
  'at the craft fair', 'in the playroom', 'at the museum', 'at the playground'];
const symbols = { '+': '+', '-': '−', '*': '×', '/': '÷' };
const choose = values => values[randomInt(values.length)];
const calculate = (a, op, b) => op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : a / b;
const line = (a, op, b, answer) => `${a} ${symbols[op]} ${b} = ${answer}`;

const templates = {
  '+': [
    (n, i, p, a, b) => `${n} has ${a} ${i}. A friend gives ${n} ${b} more. How many ${i} does ${n} have now?`,
    (n, i, p, a, b) => `${n} finds ${a} ${i} in the morning and ${b} in the afternoon ${p}. How many ${i} does ${n} find altogether?`,
    (n, i, p, a, b) => `A treasure box holds ${a} ${i}. ${n} adds ${b} ${i} to the box. How many ${i} are in the box now?`,
    (n, i, p, a, b) => `${n} counts ${a} ${i} on one table and ${b} on another ${p}. How many ${i} are on both tables altogether?`,
    (n, i, p, a, b) => `${n} bakes ${a} muffins. A friend bakes ${b} more for a picnic. How many muffins can they bring altogether?`,
    (n, i, p, a, b) => `A bus has ${a} passengers. At the next stop, ${b} more get on and nobody gets off. How many passengers are on the bus now?`,
    (n, i, p, a, b) => `${n} spots ${a} red fish and ${b} blue fish in an aquarium. How many fish is that altogether?`,
    (n, i, p, a, b) => `${n} scores ${a} points in a game, then earns ${b} bonus points. What is the total score?`,
    (n, i, p, a, b) => `A library shelf holds ${a} books. ${n} returns ${b} more books to that shelf. How many books are on it now?`,
    (n, i, p, a, b) => `${n} plants ${a} sunflower seeds and ${b} pumpkin seeds. How many seeds does ${n} plant altogether?`,
    (n, i, p, a, b) => `${n} builds a robot using ${a} blocks for its body and ${b} for its arms. How many blocks does the robot use?`,
    (n, i, p, a, b) => `There are ${a} children on a playground. ${b} more arrive to play, and nobody leaves. How many children are there now?`,
  ],
  '-': [
    (n, i, p, a, b) => `${n} has ${a} ${i} and gives ${b} to a friend. How many ${i} does ${n} have left?`,
    (n, i, p, a, b) => `A box has ${a} ${i}. ${n} takes out ${b} to make a picture. How many ${i} stay in the box?`,
    (n, i, p, a, b) => `${n} wants to collect ${a} ${i} and already has ${b}. How many more ${i} does ${n} need?`,
    (n, i, p, a, b) => `${n} brings ${a} ${i} ${p}. After giving away ${b}, how many ${i} can ${n} take home?`,
    (n, i, p, a, b) => `${n} bakes ${a} cookies for a picnic. The family eats ${b}. How many cookies are left?`,
    (n, i, p, a, b) => `A bus has ${a} passengers. ${b} get off and nobody gets on. How many passengers stay on the bus?`,
    (n, i, p, a, b) => `${n} has ${a} game tokens and spends ${b} on a ride. How many tokens does ${n} have left?`,
    (n, i, p, a, b) => `A puzzle needs ${a} pieces. ${n} has fitted ${b} pieces. How many pieces still need to be fitted?`,
    (n, i, p, a, b) => `${n} reads ${b} pages of a book with ${a} pages. How many pages are still unread?`,
    (n, i, p, a, b) => `A pet shelter has ${a} cats. Families adopt ${b} of them. How many cats still need a home?`,
    (n, i, p, a, b) => `${n}'s team scores ${a} points and another team scores ${b}. How many more points does ${n}'s team score?`,
    (n, i, p, a, b) => `${n} picks ${a} apples and puts ${b} into a pie. How many apples are left for later?`,
  ],
  '*': [
    (n, i, p, a, b) => `${n} fills ${a} bags with ${b} ${i} in each bag. How many ${i} are in all the bags?`,
    (n, i, p, a, b) => `There are ${a} rows of ${i}, with ${b} in each row. How many ${i} does ${n} count altogether?`,
    (n, i, p, a, b) => `${n} collects ${b} ${i} each day for ${a} days. How many ${i} does ${n} collect in total?`,
    (n, i, p, a, b) => `${n} gives each of ${a} friends ${b} ${i}. How many ${i} does ${n} give away altogether?`,
    (n, i, p, a, b) => `${n} bakes ${a} trays of cookies with ${b} cookies on each tray. How many cookies are baked?`,
    (n, i, p, a, b) => `A garden has ${a} rows with ${b} carrots in each row. How many carrots can ${n} count?`,
    (n, i, p, a, b) => `${n} sees ${a} bicycles. Each has ${b} reflectors. How many reflectors are on all the bicycles?`,
    (n, i, p, a, b) => `${n} earns ${b} points for each target hit and hits ${a} targets. How many points does ${n} earn?`,
    (n, i, p, a, b) => `A toy rocket needs ${b} blocks. ${n} builds ${a} identical rockets. How many blocks are needed altogether?`,
    (n, i, p, a, b) => `A band plays ${a} songs. Each song has ${b} drum beats. How many drum beats are played altogether?`,
    (n, i, p, a, b) => `${n} packs ${a} lunchboxes with ${b} sandwiches in each. How many sandwiches are packed?`,
    (n, i, p, a, b) => `There are ${a} tanks at an aquarium, with ${b} fish in each. How many fish are in all the tanks?`,
  ],
  '/': [
    (n, i, p, a, b) => `${n} shares ${a} ${i} equally among ${b} friends. How many ${i} does each friend get?`,
    (n, i, p, a, b) => `${n} puts ${a} ${i} into bags of ${b}. How many full bags does ${n} fill?`,
    (n, i, p, a, b) => `${n} arranges ${a} ${i} in ${b} equal rows. How many ${i} go in each row?`,
    (n, i, p, a, b) => `A team finds ${a} ${i} ${p} and shares them into ${b} equal boxes. How many ${i} go in each box?`,
    (n, i, p, a, b) => `${n} shares ${a} cookies equally onto ${b} plates. How many cookies go on each plate?`,
    (n, i, p, a, b) => `${n} plants ${a} seeds in ${b} equal rows. How many seeds go in each row?`,
    (n, i, p, a, b) => `${n} has ${a} blocks. Each toy rocket needs ${b} blocks. How many complete rockets can ${n} build?`,
    (n, i, p, a, b) => `${n} reads ${a} pages over ${b} days, reading the same number each day. How many pages does ${n} read each day?`,
    (n, i, p, a, b) => `A band plays ${a} drum beats across ${b} songs, with the same number in each song. How many beats are in each song?`,
    (n, i, p, a, b) => `${n} packs ${a} sandwiches into lunchboxes with ${b} in each. How many lunchboxes can ${n} fill?`,
    (n, i, p, a, b) => `There are ${a} fish shared equally among ${b} aquarium tanks. How many fish are in each tank?`,
    (n, i, p, a, b) => `${n} earns ${a} points from ${b} targets. Each target gives the same score. How many points is each target worth?`,
  ],
};

const twoStepTemplates = {
  '+': [
    (n, i, p, a, b, c) => `${n} has ${a} ${i}, finds ${b} more, then gets ${c} from a friend. How many ${i} does ${n} have now?`,
    (n, i, p, a, b, c) => `A box holds ${a} ${i}. ${n} adds ${b} in the morning and ${c} after lunch. How many ${i} are in the box now?`,
    (n, i, p, a, b, c) => `${n} scores ${a} points, earns ${b} bonus points, then wins ${c} more. What is the final score?`,
    (n, i, p, a, b, c) => `A bus starts with ${a} passengers. ${b} get on, then ${c} more get on. Nobody gets off. How many passengers are on the bus now?`,
    (n, i, p, a, b, c) => `${n} plants ${a} seeds on Monday, ${b} on Tuesday and ${c} on Wednesday. How many seeds are planted in total?`,
    (n, i, p, a, b, c) => `${n} bakes ${a} muffins. A friend brings ${b} and a neighbour brings ${c}. How many muffins are ready for the picnic?`,
    (n, i, p, a, b, c) => `A library shelf has ${a} books. ${n} adds ${b} storybooks and ${c} science books. How many books are on the shelf now?`,
    (n, i, p, a, b, c) => `${n} finds ${a} ${i} near a tent, ${b} by a trail and ${c} beside a stream. How many ${i} are found altogether?`,
  ],
  '-': [
    (n, i, p, a, b, c) => `${n} has ${a} ${i}, gives away ${b}, then uses ${c} for a picture. How many ${i} are left?`,
    (n, i, p, a, b, c) => `A box has ${a} ${i}. ${n} takes out ${b}, then a friend takes out ${c}. How many ${i} stay in the box?`,
    (n, i, p, a, b, c) => `${n} has ${a} game tokens, spends ${b} on a ride and ${c} on a puzzle. How many tokens are left?`,
    (n, i, p, a, b, c) => `A bus has ${a} passengers. ${b} get off, then ${c} more get off. Nobody gets on. How many passengers remain?`,
    (n, i, p, a, b, c) => `${n} has a book with ${a} pages and reads ${b} in the morning and ${c} at night. How many pages are still unread?`,
    (n, i, p, a, b, c) => `${n} picks ${a} apples, uses ${b} for a pie and gives ${c} to a friend. How many apples are left?`,
    (n, i, p, a, b, c) => `A bakery has ${a} cookies. Customers buy ${b} in the morning and ${c} after lunch. How many cookies are still for sale?`,
    (n, i, p, a, b, c) => `A shelf holds ${a} toy cars. ${n} packs ${b} into a gift box and ${c} into another. How many toy cars stay on the shelf?`,
  ],
  '*': [
    (n, i, p, a, b, c) => `${n} has ${a} boxes. Each box holds ${b} bags, and each bag holds ${c} ${i}. How many ${i} are there altogether?`,
    (n, i, p, a, b, c) => `There are ${a} teams. Each team has ${b} children. ${n} gives each child ${c} ${i}. How many ${i} are needed altogether?`,
    (n, i, p, a, b, c) => `${n} visits ${a} greenhouses. Each has ${b} rows of plants, with ${c} plants per row. How many plants are there in total?`,
    (n, i, p, a, b, c) => `A bakery has ${a} ovens. Each holds ${b} trays with ${c} cookies per tray. How many cookies are baking altogether?`,
    (n, i, p, a, b, c) => `${n} builds ${a} space stations. Each has ${b} rooms, with ${c} windows per room. How many windows are there in total?`,
    (n, i, p, a, b, c) => `A band plays ${a} songs. Each has ${b} sections, with ${c} drum beats per section. How many drum beats are played?`,
    (n, i, p, a, b, c) => `An aquarium has ${a} halls. Each has ${b} tanks, with ${c} fish per tank. How many fish are in the aquarium?`,
    (n, i, p, a, b, c) => `${n} packs ${a} picnic baskets. Each holds ${b} lunchboxes with ${c} sandwiches per lunchbox. How many sandwiches are packed?`,
  ],
  '/': [
    (n, i, p, a, b, c) => `${n} shares ${a} ${i} equally among ${b} teams, then equally among ${c} children per team. How many does each child get?`,
    (n, i, p, a, b, c) => `${n} sorts ${a} ${i} into ${b} equal boxes, then into ${c} equal bags per box. How many go in each bag?`,
    (n, i, p, a, b, c) => `${n} shares ${a} cookies equally among ${b} tables, then equally among ${c} children per table. How many cookies does each child get?`,
    (n, i, p, a, b, c) => `${n} shares ${a} seeds equally among ${b} garden beds. Each bed's seeds are shared equally among ${c} rows. How many seeds go in each row?`,
    (n, i, p, a, b, c) => `An aquarium shares ${a} fish equally among ${b} halls, then among ${c} tanks in each hall. How many fish go in each tank?`,
    (n, i, p, a, b, c) => `${n} sorts ${a} blocks equally into ${b} boxes, then into ${c} equal bags per box. How many blocks are in each bag?`,
    (n, i, p, a, b, c) => `A band shares ${a} beats equally across ${b} songs, then equally across ${c} sections per song. How many beats are in each section?`,
    (n, i, p, a, b, c) => `${n} shares ${a} sandwiches equally among ${b} baskets, then among ${c} lunchboxes per basket equally. How many sandwiches go in each lunchbox?`,
  ],
};

export function storyQuestion(base, maxNumber, twoStep = false, pick = choose) {
  const { a, b, op } = base;
  if (op === '*' && base.answer > maxNumber) return null;
  const name = pick(names), item = pick(items);
  const place = pick(places);
  let text, steps = [{ a, b, op, answer: base.answer }];
  if (twoStep) {
    if (base.answer > maxNumber) return null;
    const candidates = [];
    for (let c = 2; c <= maxNumber; c++) {
      const answer = calculate(base.answer, op, c);
      if (Number.isInteger(answer) && answer >= 0 && answer <= 9999 &&
          (op !== '*' || answer <= maxNumber) &&
          (op !== '/' || answer >= 2)) candidates.push(c);
    }
    if (!candidates.length || (op === '*' && base.answer < 2)) return null;
    const c = pick(candidates);
    steps.push({ a: base.answer, b: c, op, answer: calculate(base.answer, op, c) });
    text = pick(twoStepTemplates[op])(name, item, place, a, b, c);
  } else text = pick(templates[op])(name, item, place, a, b);
  return {
    ...base, type: 'story', text, steps,
    answer: steps.at(-1).answer,
    explanation: steps.map(step => line(step.a, step.op, step.b, step.answer)).join('; '),
  };
}
