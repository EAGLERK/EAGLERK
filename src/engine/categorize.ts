/** Keyword rules for Indian bank narrations (UPI/NEFT/IMPS/ATM). First match wins. */
const RULES: Array<{ category: string; type?: 'income' | 'expense'; words: RegExp }> = [
  { category: 'Salary', type: 'income', words: /salary|payroll|\bsal\b|wages/i },
  { category: 'Interest & Dividends', type: 'income', words: /interest|int\.? ?pd|dividend|\bint cr/i },
  { category: 'Investments', type: 'expense', words: /\bsip\b|mutual fund|\bmf\b|zerodha|groww|kuvera|coin\b|nps|ppf|ach.*(amc|mf)|bse star|\bfd\b|\brd\b|recurring dep|smallcase|indmoney/i },
  { category: 'EMI', type: 'expense', words: /\bemi\b|loan|nach|ecs.*(hdfc|icici|bajaj|tata cap)|bajaj fin/i },
  { category: 'Rent', type: 'expense', words: /\brent\b|landlord|nobroker|nestaway/i },
  { category: 'Insurance', type: 'expense', words: /insurance|\blic\b|premium|star health|max life|hdfc life|icici pru|policybazaar|acko/i },
  { category: 'Groceries', type: 'expense', words: /bigbasket|blinkit|zepto|dmart|d-mart|instamart|grofers|reliance fresh|more retail|jiomart|grocer|kirana|vegetable|milk/i },
  { category: 'Food & Dining', type: 'expense', words: /swiggy|zomato|restaurant|cafe|starbucks|dominos|domino|mcdonald|kfc|pizza|biryani|dineout|eatsure|bakery/i },
  { category: 'Transport', type: 'expense', words: /uber|\bola\b|rapido|irctc|redbus|metro|fastag|petrol|diesel|\bfuel\b|hpcl|bpcl|iocl|indian oil|shell|parking|cab\b/i },
  { category: 'Utilities', type: 'expense', words: /electric|bescom|tneb|tangedco|msedcl|bses|water bill|gas|broadband|airtel|jio|\bvi\b|vodafone|bsnl|act fibernet|recharge|dth|tata ?play|mobile bill/i },
  { category: 'Health', type: 'expense', words: /hospital|clinic|pharmacy|apollo|medplus|1mg|pharmeasy|netmeds|diagnostic|lab\b|doctor|dental/i },
  { category: 'Education', type: 'expense', words: /school|college|tuition|udemy|coursera|byju|unacademy|fees\b/i },
  { category: 'Subscriptions', type: 'expense', words: /netflix|spotify|hotstar|prime video|youtube|apple\.com|google play|icloud|openai|chatgpt|zee5|sonyliv|jiocinema|subscription/i },
  { category: 'Entertainment', type: 'expense', words: /bookmyshow|pvr|inox|steam|playstation|game/i },
  { category: 'Travel', type: 'expense', words: /makemytrip|goibibo|cleartrip|airlines|indigo|air india|vistara|oyo|airbnb|booking\.com|hotel|resort|yatra/i },
  { category: 'Shopping', type: 'expense', words: /amazon|flipkart|myntra|ajio|nykaa|meesho|tata cliq|decathlon|ikea|croma|reliance digital|lifestyle|zudio|westside/i },
  { category: 'Cash Withdrawal', type: 'expense', words: /\batm\b|cash wdl|cash withdrawal|nwd/i },
];

export function categorize(description: string, type: 'income' | 'expense'): string {
  for (const r of RULES) {
    if (r.type && r.type !== type) continue;
    if (r.words.test(description)) return r.category;
  }
  return type === 'income' ? 'Other Income' : 'Other';
}
