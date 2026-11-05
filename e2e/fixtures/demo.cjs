// Made-up data for the browser tests. The app no longer has sample data of its own; tests that need a filled-in account load this into
// the browser's storage (seed) or import it as a statement (demoCsv). Plain JavaScript so the .cjs test scripts can use it.
const { randomUUID } = require('node:crypto');

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function demoData() {
  const today = todayISO();
  const thisMonth = today.slice(0, 7);
  const rand = rng(42);
  const around = (base, spread) => Math.round((base * (1 + (rand() - 0.5) * 2 * spread)) / 10) * 10;
  const txns = [];
  let n = 0;
  const add = (date, desc, amount, type, category) => {
    if (date > today) return;
    txns.push({ id: `demo-${n++}`, date, description: desc, amount, type, category, source: 'demo' });
  };

  for (let back = 6; back >= 0; back--) {
    const m = addMonths(thisMonth, -back);
    const d = (day) => `${m}-${String(day).padStart(2, '0')}`;
    add(d(1), 'NEFT-ACME TECHNOLOGIES-SALARY', 125_000, 'income', 'Salary');
    add(d(12), 'Interest credit savings a/c', around(450, 0.2), 'income', 'Interest & Dividends');
    add(d(5), 'UPI-Rent to landlord', 28_000, 'expense', 'Rent');
    add(d(6), 'ACH D- BAJAJ FIN-PERSONAL LOAN EMI', 7_000, 'expense', 'EMI');
    add(d(7), 'ACH D- ZERODHA COIN-SIP', 20_000, 'expense', 'Investments');
    add(d(7), 'RD instalment HDFC', 5_000, 'expense', 'Investments');
    add(d(8), 'BESCOM electricity', around(1_900, 0.25), 'expense', 'Utilities');
    add(d(9), 'Airtel broadband + mobile', 1_798, 'expense', 'Utilities');
    add(d(10), 'Netflix + Spotify', 1_150, 'expense', 'Subscriptions');
    add(d(11), 'Star Health premium', 2_100, 'expense', 'Insurance');
    for (let w = 0; w < 4; w++) add(d(3 + w * 7), 'UPI-BigBasket / Blinkit', around(2_400, 0.3), 'expense', 'Groceries');
    const foodSpike = back === 0 ? 2.2 : 1;
    for (let w = 0; w < 6; w++) add(d(2 + w * 5), w % 2 ? 'UPI-SWIGGY' : 'UPI-ZOMATO', around(650 * foodSpike, 0.4), 'expense', 'Food & Dining');
    for (let w = 0; w < 5; w++) add(d(4 + w * 6), w % 2 ? 'UBER TRIP' : 'HPCL FUEL', around(550, 0.4), 'expense', 'Transport');
    add(d(15), 'AMAZON PAY', around(3_200, 0.6), 'expense', 'Shopping');
    add(d(22), 'MYNTRA', around(2_400, 0.7), 'expense', 'Shopping');
    if (back % 2 === 0) add(d(18), 'BOOKMYSHOW', around(1_300, 0.3), 'expense', 'Entertainment');
    if (back % 3 === 0) add(d(20), 'APOLLO PHARMACY', around(1_400, 0.4), 'expense', 'Health');
    if (back === 2) add(d(24), 'MAKEMYTRIP GOA', 18_500, 'expense', 'Travel');
  }

  const profile = {
    name: 'Demo',
    age: 31,
    monthlyIncome: 125_000,
    monthlyExpenses: 75_000,
    annualGrossIncome: 1_500_000,
    salaried: true,
    risk: 'moderate',
    emergencyMonths: 6,
    hasTermInsurance: false,
    hasHealthInsurance: true,
  };

  const y = (delta) => addMonths(thisMonth, delta * 12).slice(0, 7);
  const goals = [
    { id: 'goal-bike', kind: 'bike', name: 'Bike', price: 220_000, targetMonth: addMonths(thisMonth, 12), downPaymentPct: 30, loanRate: 11, loanYears: 2, extraCostPct: 10, saved: 15_000 },
    { id: 'goal-car', kind: 'car', name: 'Car', price: 1_200_000, targetMonth: addMonths(thisMonth, 36), downPaymentPct: 20, loanRate: 9.25, loanYears: 4, extraCostPct: 12, saved: 0 },
    { id: 'goal-house', kind: 'house', name: 'House', price: 8_000_000, targetMonth: y(8), downPaymentPct: 20, loanRate: 8.75, loanYears: 20, extraCostPct: 7, saved: 0 },
  ];

  const investments = [
    { id: 'inv-sav', kind: 'savings', name: 'Salary account', institution: 'HDFC Bank', startDate: '2020-01-01', amount: 180_000, currentValue: 180_000, rate: 3, tenureMonths: 0, emergency: true },
    { id: 'inv-fd', kind: 'fd', name: 'FD 1 year', institution: 'SBI', startDate: addMonths(thisMonth, -5) + '-15', amount: 200_000, rate: 6.8, tenureMonths: 12, emergency: true },
    { id: 'inv-rd', kind: 'rd', name: 'RD 2 years', institution: 'HDFC Bank', startDate: addMonths(thisMonth, -6) + '-07', amount: 5_000, rate: 6.5, tenureMonths: 24 },
    { id: 'inv-ppf', kind: 'ppf', name: 'PPF', institution: 'SBI', startDate: '2022-04-01', amount: 270_000, currentValue: 318_000, rate: 7.1, tenureMonths: 180 },
    { id: 'inv-mf', kind: 'mutual_fund', name: 'Nifty 50 index fund (SIP)', institution: 'Zerodha Coin', startDate: '2024-04-01', amount: 540_000, currentValue: 655_000, rate: 12.4, tenureMonths: 0, equityPct: 100 },
    { id: 'inv-gold', kind: 'gold', name: 'Gold ETF', institution: 'Zerodha', startDate: '2023-06-01', amount: 50_000, currentValue: 61_000, rate: 0, tenureMonths: 0 },
  ];

  const liabilities = [{ id: 'loan-pl', name: 'Personal loan', outstanding: 120_000, rate: 13, emi: 7_000 }];

  return { txns, profile, goals, investments, liabilities };
}

/** Two example notes, like the old sample account had. */
function demoNotes(now = new Date().toISOString()) {
  const id = () => randomUUID();
  return [
    { id: id(), title: 'Things to buy', updatedAt: now, blocks: [
      { id: id(), type: 'todo', title: 'This month', items: [
        { id: id(), text: 'Laptop bag', done: true }, { id: id(), text: 'Water purifier filter', done: false },
        { id: id(), text: 'Running shoes', done: false }, { id: id(), text: 'Gift for Mom', done: false },
      ] },
      { id: id(), type: 'text', text: 'Wait for the festival sale on bigger items. Check price history first.' },
    ] },
    { id: id(), title: 'Things to sell', updatedAt: new Date(Date.parse(now) - 3600_000).toISOString(), blocks: [
      { id: id(), type: 'table', title: '', columns: ['Item', 'Asking price (₹)', 'Status'], rows: [['Old phone', '8,000', 'Listed'], ['Study table', '3,500', 'Buyer coming Sunday'], ['Bicycle', '6,000', 'Not listed']] },
    ] },
  ];
}

/** A whole saved state, as the app keeps it in the browser (onboarded, with a few notes). */
function demoState(name = 'Asha') {
  const d = demoData();
  return { version: 1, ...d, profile: { ...d.profile, name }, overrides: {}, onboarded: true, notes: demoNotes() };
}

/** The same transactions as a bank-statement CSV, for tests that must go through the importer (signed-in accounts). */
function demoCsv() {
  const rows = demoData().txns.map((t) => `${t.date},"${t.description}",${t.type === 'expense' ? t.amount : ''},${t.type === 'income' ? t.amount : ''}`);
  return ['Date,Description,Debit,Credit', ...rows].join('\n') + '\n';
}

/** Puts a filled-in account into this page's browser storage and reloads, so the app opens past the welcome popup. */
async function seed(page, name = 'Asha') {
  await page.evaluate((s) => localStorage.setItem('mymoney:v1', s), JSON.stringify(demoState(name)));
  await page.reload();
}

module.exports = { demoData, demoState, demoNotes, demoCsv, seed };
