import { extractDate, parseMonthYear } from './dates';
import { findAmount, parseAmountPhrase } from './numbers';

export type Tab = 'dashboard' | 'transactions' | 'goals' | 'notes' | 'settings' | 'investments' | 'plan';
export type GoalWord = 'car' | 'house' | 'bike';
export type ProfileField = 'name' | 'age' | 'monthlyIncome' | 'monthlyExpenses' | 'annualGrossIncome';

export type Cmd =
  | { t: 'navigate'; tab: Tab }
  | { t: 'theme'; theme: 'auto' | 'light' | 'dark' }
  | { t: 'help' }
  | { t: 'undo' }
  | { t: 'saveDrafts' }
  | { t: 'discardDrafts' }
  | { t: 'summary'; what: 'spend' | 'income' | 'saved'; period: 'this' | 'last' }
  | { t: 'addTxn'; type: 'income' | 'expense'; amount: number | null; description: string; date: string | null }
  | { t: 'txnEdit'; target: string; field: 'amount' | 'category' | 'date' | 'description'; value: string; amount?: number | null; date?: string | null }
  | { t: 'txnDelete'; target: string }
  | { t: 'noteAddItems'; list: string; items: string[] }
  | { t: 'noteCreate'; title: string; kind: 'buy' | 'sell' | 'todo' | 'text' }
  | { t: 'noteQuick'; text: string; as: 'todo' | 'text' }
  | { t: 'noteTick'; text: string; done: boolean }
  | { t: 'noteRemoveItem'; text: string; list: string }
  | { t: 'noteOpen'; name: string }
  | { t: 'noteDelete'; name: string }
  | { t: 'setProfile'; field: ProfileField; value: string | number }
  | { t: 'setAssumption'; label: string; value: number }
  | { t: 'goalPrice'; goal: string; price: number }
  | { t: 'goalMonth'; goal: string; month: string }
  | { t: 'goalAdd'; kind: GoalWord }
  | { t: 'goalDelete'; goal: string }
  | { t: 'unknown'; heard: string };

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Lower-case, one space between words, punctuation gone, numbers kept intact (1,25,000 -> 125000, ₹ -> rs). */
export function clean(raw: string): string {
  let s = raw.toLowerCase().trim();
  s = s.replace(/(\d),(?=\d)/g, '$1').replace(/₹/g, ' rs ').replace(/[’']/g, '').replace(/-/g, ' ');
  s = s.replace(/[^a-z0-9.% ]/g, ' ').replace(/(?<!\d)\.|\.(?!\d)/g, ' ').replace(/\s+/g, ' ').trim();
  let prev = '';
  while (prev !== s) {
    prev = s;
    s = s.replace(/^(hey |hi |hello |ok |okay |so |please |kindly |can you |could you |would you |will you |i want to |i wanna |i would like to |id like to |i need to |lets |let us |go ahead and |just |now |mymoney |my money |assistant )/, '');
  }
  return s.replace(/ (please|thanks|thank you|for me|right now|now)$/, '').trim();
}

const TABS: Array<[RegExp, Tab]> = [
  [/^(dashboard|home|home page|home screen|overview|main screen)$/, 'dashboard'],
  [/^(transactions?|activity|expenses|statements?|spending)$/, 'transactions'],
  [/^(goals?|goal planner|my goals)$/, 'goals'],
  [/^(notes?|my notes|lists?|my lists?|todo|to do|to do list)$/, 'notes'],
  [/^(settings?|preferences|my profile|profile|account)$/, 'settings'],
  [/^(investments?|portfolio)$/, 'investments'],
  [/^(plan|my plan|monthly plan)$/, 'plan'],
];
const tabOf = (s: string): Tab | null => TABS.find(([re]) => re.test(s))?.[1] ?? null;

export const goalWord = (s: string): GoalWord | null =>
  /\b(car|cars|vehicle)\b/.test(s) ? 'car' : /\b(house|home|flat|apartment)\b/.test(s) ? 'house' : /\b(bike|bikes|motorcycle|motorbike|scooter)\b/.test(s) ? 'bike' : null;

/** Yes or no, for a pending confirmation. Null when it is neither. */
export function parseAnswer(raw: string): 'yes' | 'no' | null {
  const s = clean(raw);
  if (/^(yes|yeah|yep|yup|sure|ok|okay|confirm|confirmed|do it|go ahead|correct|right|thats right|proceed|please do|absolutely|affirmative|haan|ha)( .*)?$/.test(s)) return 'yes';
  if (/^(no|nope|nah|cancel|stop|dont|do not|never mind|nevermind|wrong|abort|incorrect|nahi)( .*)?$/.test(s)) return 'no';
  return null;
}

const splitItems = (s: string) => s.split(/,| and | then /).map((x) => x.trim()).filter(Boolean).map((x) => x.replace(/^(a|an|some|the) /, ''));

/** Turns one sentence into a command. `today` is YYYY-MM-DD, used to read dates like "yesterday". */
export function parseCommand(raw: string, today: string): Cmd {
  const s = clean(raw);
  const unknown: Cmd = { t: 'unknown', heard: raw.trim() };
  if (!s) return unknown;
  let m: RegExpMatchArray | null;

  if (/^(undo|undo that|take that back|revert|revert that|go back on that)$/.test(s)) return { t: 'undo' };
  if (/^(help|what can i say|what can you do|what can i do|commands|show commands|how do i use this|what do you do)$/.test(s)) return { t: 'help' };
  if (/^(save|save changes|save all|save everything|save it|keep them|keep changes|save my changes)$/.test(s)) return { t: 'saveDrafts' };
  if (/^(discard|discard changes|discard all|throw them away|throw away|discard unsaved( changes)?)$/.test(s)) return { t: 'discardDrafts' };

  // ----- navigation
  const bare = tabOf(s);
  if (bare) return { t: 'navigate', tab: bare };
  if ((m = s.match(/^(?:go to|take me to|switch to|navigate to|show me|bring up|open|show|view|visit|go)\s+(?:the |my )?(.+?)(?: page| screen| tab| section)?$/))) {
    const tab = tabOf(m[1]);
    if (tab) return { t: 'navigate', tab };
  }

  // ----- theme
  if ((m = s.match(/\b(dark|light)\b/)) && /\b(mode|theme)\b|^(go|switch to|turn on|use|enable) (dark|light)$/.test(s)) return { t: 'theme', theme: m[1] as 'dark' | 'light' };
  if (/\b(match|follow|use|auto|automatic)\b.*\b(device|system|phone|computer|automatic|auto)\b.*\b(theme|mode)?\b|^(auto|automatic) (theme|mode)$/.test(s) && /\b(theme|mode|device|system)\b/.test(s)) return { t: 'theme', theme: 'auto' };

  // ----- questions about the numbers
  if ((m = s.match(/^(?:how much|what)(?: is| was| are| did i| have i| do i| have we|s)?\b.*\b(spend|spent|spending|expenses?|earn|earned|income|salary|save|saved|savings|left|remaining)\b/))) {
    const k = m[1];
    const what = /spen|expens/.test(k) ? 'spend' : /earn|income|salary/.test(k) ? 'income' : 'saved';
    return { t: 'summary', what, period: /\b(last|previous) month\b/.test(s) ? 'last' : 'this' };
  }

  // ----- transactions: delete and edit
  if ((m = s.match(/^(?:delete|remove|erase|drop)\s+(?:the\s+|my\s+)?(last|latest|most recent|previous)\s+(?:transaction|expense|payment|entry|income)$/))) return { t: 'txnDelete', target: 'last' };
  if ((m = s.match(/^(?:delete|remove|erase)\s+(?:the\s+|my\s+)?(.+?)\s+(?:transaction|expense|payment|entry)$/))) return { t: 'txnDelete', target: m[1] };
  const fieldOf = (w: string): 'amount' | 'category' | 'date' | 'description' => (/amount|price|cost/.test(w) ? 'amount' : /categor/.test(w) ? 'category' : /date/.test(w) ? 'date' : 'description');
  const editValue = (field: 'amount' | 'category' | 'date' | 'description', value: string): Cmd | null => {
    if (field === 'amount') { const n = parseAmountPhrase(value); return n === null ? null : { t: 'txnEdit', target: '', field, value, amount: n }; }
    if (field === 'date') { const d = extractDate(value, today).date; return d ? { t: 'txnEdit', target: '', field, value, date: d } : null; }
    return { t: 'txnEdit', target: '', field, value: cap(value) };
  };
  if ((m = s.match(/^(?:change|set|update|edit|correct|fix)\s+(?:the\s+)?(amount|price|cost|category|date|description|name)\s+(?:of|for|on)\s+(?:the\s+)?(?:(last|latest|most recent|previous)\s+(?:transaction|expense|payment|entry)|(.+?)(?:\s+(?:transaction|expense|payment|entry))?)\s+(?:to|as|into)\s+(.+)$/))) {
    const cmd = editValue(fieldOf(m[1]), m[4]);
    if (cmd && cmd.t === 'txnEdit') return { ...cmd, target: m[2] ? 'last' : m[3] };
  }
  if ((m = s.match(/^(?:change|set|update|edit|make)\s+(?:the\s+)?(last|latest|most recent|previous)\s+(?:transaction|expense|payment|entry)\s+(?:amount\s+|category\s+|date\s+)?(?:to|as)\s+(.+)$/))) {
    const asAmount = parseAmountPhrase(m[2]);
    if (asAmount !== null) return { t: 'txnEdit', target: 'last', field: 'amount', value: m[2], amount: asAmount };
    const d = extractDate(m[2], today).date;
    if (d && /\bdate\b/.test(s)) return { t: 'txnEdit', target: 'last', field: 'date', value: m[2], date: d };
    return { t: 'txnEdit', target: 'last', field: 'category', value: cap(m[2]) };
  }
  if ((m = s.match(/^rename\s+(?:the\s+)?(.+?)(?:\s+(?:transaction|expense|payment|entry))?\s+to\s+(.+)$/)) && !/\b(note|list|goal)\b/.test(s)) return { t: 'txnEdit', target: m[1], field: 'description', value: cap(m[2]) };

  // ----- notes
  if ((m = s.match(/^(?:note down|note that|jot down|write down|take a note(?: that| saying)?|add a note(?: saying| that)|make a note(?: that| saying)?|note)\s+(.+)$/)) && !/^(down|that)$/.test(m[1])) return { t: 'noteQuick', text: m[1], as: 'text' };
  if ((m = s.match(/^(?:remember to|remember|remind me to|dont forget to|do not forget to)\s+(.+)$/))) return { t: 'noteQuick', text: m[1], as: 'todo' };
  if ((m = s.match(/^(?:remove|delete|take|strike)\s+(.+?)\s+(?:from|off)\s+(?:my\s+|the\s+)?(.+?)(?:\s+(?:list|note))?$/)) && !findAmount(m[1].split(' '))) return { t: 'noteRemoveItem', text: m[1], list: m[2] };
  if ((m = s.match(/^(?:open|show|go to|view)\s+(?:my\s+|the\s+)?(.+?)\s+(?:note|list)$/))) return { t: 'noteOpen', name: m[1] };
  if ((m = s.match(/^(?:delete|remove|erase)\s+(?:my\s+|the\s+)?(.+?)\s+(?:note|list)$/))) return { t: 'noteDelete', name: m[1] };
  if ((m = s.match(/^(?:create|make|start|add|new|set up)\s+(?:a\s+|an\s+)?(?:new\s+)?(note|list|to do list|todo list|shopping list|checklist|grocery list)(?:\s+(?:called|named|titled|for|about|on))?\s*(.*)$/))) {
    const noun = m[1];
    const rest = m[2].trim();
    const kind = /shopping|grocery/.test(noun) || /\b(buy|shopping|grocer)/.test(rest) ? 'buy' : /\bsell|selling/.test(rest) ? 'sell' : /list|todo|checklist/.test(noun) ? 'todo' : 'text';
    return { t: 'noteCreate', title: rest ? cap(rest) : kind === 'buy' ? (noun === 'shopping list' ? 'Shopping list' : 'Things to buy') : '', kind };
  }
  if ((m = s.match(/^(?:untick|uncheck|unmark)\s+(.+)$/)) || (m = s.match(/^mark\s+(.+?)\s+(?:as\s+)?(?:not done|incomplete|pending|undone|not finished)$/))) return { t: 'noteTick', text: m[1], done: false };
  if ((m = s.match(/^(?:tick|check|cross|strike)\s+(?:off\s+)?(.+?)(?:\s+off)?(?:\s+(?:from|on)\s+(?:my\s+|the\s+)?.+)?$/)) && !/^(down)\b/.test(m[1])) return { t: 'noteTick', text: m[1], done: true };
  if ((m = s.match(/^mark\s+(.+?)\s+(?:as\s+)?(?:done|complete|completed|finished|bought|purchased|sold)$/))) return { t: 'noteTick', text: m[1], done: true };

  // ----- goals
  if ((m = s.match(/^(?:delete|remove)\s+(?:my\s+|the\s+)?(.+?)\s+goal$/))) return { t: 'goalDelete', goal: m[1] };
  if ((m = s.match(/^(?:add|create|new|set up|start)\s+(?:a\s+|an\s+)?(?:new\s+)?(?:goal\s+(?:for|to buy)\s+(?:a\s+|an\s+)?)?(.+?)(?:\s+goal)?$/)) && goalWord(m[1]) && m[1].split(' ').length <= 3) return { t: 'goalAdd', kind: goalWord(m[1])! };
  if ((m = s.match(/^(?:change|set|update|move)\s+(?:my\s+|the\s+)?(.+?)\s+(?:goal\s+)?(?:target|date|deadline|month|target month)\s+(?:to|for)\s+(.+)$/)) && goalWord(m[1])) {
    const month = parseMonthYear(m[2]);
    if (month) return { t: 'goalMonth', goal: m[1], month };
  }
  if ((m = s.match(/^(?:change|set|update)\s+(?:my\s+|the\s+)?(car|house|home|flat|apartment|bike|motorcycle|motorbike|scooter)(?:\s+goal)?(?:\s+(?:price|cost|budget))?\s+(?:to|at|as)\s+(.+)$/))) {
    const price = parseAmountPhrase(m[2]);
    if (price !== null) return { t: 'goalPrice', goal: m[1], price };
  }
  if ((m = s.match(/^(?:change|set|update)\s+(?:the\s+)?(.+?)\s+goal\s+(?:price|cost|budget)\s+(?:to|at|as)\s+(.+)$/))) {
    const price = parseAmountPhrase(m[2]);
    if (price !== null) return { t: 'goalPrice', goal: m[1], price };
  }

  // ----- profile
  if ((m = s.match(/^(?:change|set|update)\s+(?:my\s+)?name\s+(?:to|as|is)\s+(.+)$/)) || (m = s.match(/^(?:call me|my name is)\s+(.+)$/))) return { t: 'setProfile', field: 'name', value: m[1].split(' ').map(cap).join(' ') };
  if ((m = s.match(/^(?:change|set|update|make)\s+(?:my\s+)?(age|monthly (?:take home|income|salary|spend|spending|expenses?)|take home(?: salary| pay)?|annual (?:gross )?(?:income|salary|ctc|package)|ctc|salary|income|expenses|spending)\s+(?:to|as|is|at)\s+(.+)$/))) {
    const n = parseAmountPhrase(m[2]);
    if (n !== null) {
      const k = m[1];
      const field: ProfileField = k === 'age' ? 'age' : /annual|ctc/.test(k) ? 'annualGrossIncome' : /spend|expens/.test(k) ? 'monthlyExpenses' : 'monthlyIncome';
      return { t: 'setProfile', field, value: n };
    }
  }

  // ----- adding items to a list
  if ((m = s.match(/^(?:add|put|include|append|write)\s+(.+?)\s+(?:to|in|into|on)\s+(?:my\s+|the\s+)?(.+?)$/))) {
    const tail = m[2];
    // Commas were dropped by clean(); a comma between items means "and".
    const itemText = clean(raw.replace(/(?<!\d),|,(?!\d)/g, ' and ')).match(/^(?:add|put|include|append|write)\s+(.+?)\s+(?:to|in|into|on)\s+/)?.[1] ?? m[1];
    const namesList = /\b(list|note|notes)$/.test(tail);
    const hasAmount = !!findAmount(m[1].split(' '));
    if ((namesList || !hasAmount) && !/^(expenses?|income|transactions?|spending)$/.test(tail)) {
      const list = tail.replace(/\s+(list|note|notes)$/, '');
      return { t: 'noteAddItems', list, items: splitItems(itemText) };
    }
  }

  // ----- adding a transaction
  const tokens = s.split(' ');
  const amount = findAmount(tokens);
  const EXP = /\b(spent|spend|paid|pay|bought|buy|purchased|purchase|ordered|booked|gave|expense|expenses|spending|debit|debited|payment)\b/;
  const INC = /\b(received|got|earned|earn|credited|credit|sold|income|salary|refund|bonus|deposit|deposited|interest|dividend|cashback|reimbursement)\b/;
  const ADD = /^(add|record|log|enter|create|new|make|insert)\b/;
  if ((EXP.test(s) || INC.test(s) || ADD.test(s)) && (amount || /\b(expense|income|transaction|payment)\b/.test(s))) {
    const { date, text } = extractDate(s, today);
    const toks = text.split(' ');
    const a = findAmount(toks);
    const type: 'income' | 'expense' = INC.test(s) && !/\b(expense|spent|paid|bought)\b/.test(s) ? 'income' : 'expense';
    const FILLER = new Set(['add', 'record', 'log', 'enter', 'create', 'new', 'make', 'insert', 'an', 'a', 'the', 'my', 'expense', 'expenses', 'income', 'transaction', 'payment', 'spent', 'spend', 'paid', 'pay', 'bought', 'purchased', 'purchase', 'received', 'got', 'earned', 'credited', 'debited', 'of', 'worth', 'amount', 'for', 'on', 'at', 'to', 'from', 'as', 'in', 'with', 'ordered', 'booked', 'gave', 'sold', 'total', 'rs', 'only', 'about', 'around']);
    const before = a ? toks.slice(0, a.start) : toks;
    const after = a ? toks.slice(a.end) : [];
    const strip = (xs: string[]) => { let i = 0; let j = xs.length; while (i < j && FILLER.has(xs[i])) i++; while (j > i && FILLER.has(xs[j - 1])) j--; return xs.slice(i, j); };
    let desc = strip(after).join(' ');
    if (!desc) desc = strip(before).join(' ');
    // "salary", "refund" and friends are descriptions worth keeping even though they also say which way the money went.
    if (!desc) { const kept = toks.find((x) => /^(salary|refund|bonus|interest|dividend|cashback|rent)$/.test(x)); if (kept) desc = kept; }
    return { t: 'addTxn', type, amount: a ? a.value : null, description: cap(desc), date };
  }

  // ----- an assumption by name: "set house price growth to 6 percent"
  if ((m = s.match(/^(?:change|set|update)\s+(?:the\s+)?(.+?)\s+(?:to|at|as)\s+(\d+(?:\.\d+)?)\s*(?:percent|per cent|%)?$/))) return { t: 'setAssumption', label: m[1], value: Number(m[2]) };

  return unknown;
}
