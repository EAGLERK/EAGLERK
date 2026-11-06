/** Keyword rules for bank narrations: Indian (UPI, NEFT, IMPS) and common English-language names from other countries. First match wins. Anything else is "Other" and can be recategorised by hand. */
const RULES: Array<{ category: string; type?: 'income' | 'expense'; words: RegExp }> = [
  { category: 'Salary', type: 'income', words: /salary|payroll|\bsal\b|wages|paycheck|paycheque|direct dep(osit)?|payslip/i },
  { category: 'Interest & Dividends', type: 'income', words: /interest|int\.? ?pd|dividend|\bint cr/i },
  { category: 'Investments', type: 'expense', words: /\bsip\b|mutual fund|\bmf\b|zerodha|groww|kuvera|coin\b|nps|ppf|ach.*(amc|mf)|bse star|\bfd\b|\brd\b|recurring dep|smallcase|indmoney|\betf\b|brokerage|vanguard|fidelity|schwab|robinhood|\b401k\b|pension contrib/i },
  { category: 'EMI', type: 'expense', words: /\bemi\b|loan|nach|ecs.*(hdfc|icici|bajaj|tata cap)|bajaj fin|mortgage|instal+ment|car payment|student loan/i },
  { category: 'Rent', type: 'expense', words: /\brent\b|landlord|nobroker|nestaway|\blease\b|letting agent|property manage/i },
  { category: 'Insurance', type: 'expense', words: /insurance|\blic\b|premium|star health|max life|hdfc life|icici pru|policybazaar|acko|geico|allstate|state farm|aviva|\baxa\b|allianz|prudential|bupa/i },
  { category: 'Groceries', type: 'expense', words: /bigbasket|blinkit|zepto|dmart|d-mart|instamart|grofers|reliance fresh|more retail|jiomart|grocer|kirana|vegetable|milk|walmart|costco|tesco|\baldi\b|lidl|kroger|safeway|trader joe|whole foods|carrefour|sainsbury|waitrose|coles|woolworths|supermarket|grocery|groceries|\brewe\b|edeka|kaufland|albert heijn|mercadona|auchan|migros|\bspar\b|esselunga/i },
  { category: 'Food & Dining', type: 'expense', words: /swiggy|zomato|restaurant|cafe|starbucks|dominos|domino|mcdonald|kfc|pizza|biryani|dineout|eatsure|bakery|doordash|uber ?eats|deliveroo|grubhub|just ?eat|takeaway|takeout|chipotle|subway|burger|pizza hut|coffee|diner|bistro|\bpub\b/i },
  { category: 'Transport', type: 'expense', words: /uber|\bola\b|rapido|irctc|redbus|metro|fastag|petrol|diesel|\bfuel\b|hpcl|bpcl|iocl|indian oil|shell|parking|cab\b|\blyft\b|\bgrab\b|\bbolt\b|taxi|\btoll\b|gas station|chevron|exxon|petrol|\btfl\b|transit|\bbus pass/i },
  { category: 'Utilities', type: 'expense', words: /electric|bescom|tneb|tangedco|msedcl|bses|water bill|gas|broadband|airtel|jio|\bvi\b|vodafone|bsnl|act fibernet|recharge|dth|tata ?play|mobile bill|verizon|at&t|comcast|xfinity|t-mobile|telstra|council tax|utilities|internet bill|electricity|gas bill/i },
  { category: 'Health', type: 'expense', words: /hospital|clinic|pharmacy|apollo|medplus|1mg|pharmeasy|netmeds|diagnostic|lab\b|doctor|dental|\bcvs\b|walgreens|boots|dentist|medical|optician|physio/i },
  { category: 'Education', type: 'expense', words: /school|college|tuition|udemy|coursera|byju|unacademy|fees\b|university|coursework|textbook/i },
  { category: 'Subscriptions', type: 'expense', words: /netflix|spotify|hotstar|prime video|youtube|apple\.com|google play|icloud|openai|chatgpt|zee5|sonyliv|jiocinema|subscription|disney\+|\bhulu\b|adobe|dropbox|microsoft 365|amazon prime|apple music/i },
  { category: 'Entertainment', type: 'expense', words: /bookmyshow|pvr|inox|steam|playstation|game|cinema|movie|odeon|cineworld|ticketmaster/i },
  { category: 'Travel', type: 'expense', words: /makemytrip|goibibo|cleartrip|airlines|indigo|air india|vistara|oyo|airbnb|booking\.com|hotel|resort|yatra|airline|airbnb|expedia|ryanair|easyjet|delta air|united air|lufthansa|booking\.com|hostel/i },
  { category: 'Shopping', type: 'expense', words: /amazon|flipkart|myntra|ajio|nykaa|meesho|tata cliq|decathlon|ikea|croma|reliance digital|lifestyle|zudio|westside|ebay|\btarget\b|etsy|\bzara\b|h&m|best buy|argos|john lewis|shein|uniqlo/i },
  { category: 'Cash Withdrawal', type: 'expense', words: /\batm\b|cash wdl|cash withdrawal|nwd/i },
];

export function categorize(description: string, type: 'income' | 'expense'): string {
  for (const r of RULES) {
    if (r.type && r.type !== type) continue;
    if (r.words.test(description)) return r.category;
  }
  return type === 'income' ? 'Other Income' : 'Other';
}
