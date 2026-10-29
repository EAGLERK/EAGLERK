const monthlyRate = (annualPct: number) => annualPct / 12 / 100;

export function futureValueLump(amount: number, annualPct: number, years: number): number {
  return amount * Math.pow(1 + annualPct / 100, years);
}

/** SIP at the end of each month, monthly compounding. */
export function futureValueSip(monthly: number, annualPct: number, months: number): number {
  const i = monthlyRate(annualPct);
  if (months <= 0) return 0;
  if (i === 0) return monthly * months;
  return (monthly * (Math.pow(1 + i, months) - 1)) / i;
}

/** Monthly amount needed to reach `target` given money already set aside. 0 if already covered. */
export function requiredMonthly(target: number, existing: number, annualPct: number, months: number): number {
  if (months <= 0) return Math.max(0, target - existing);
  const i = monthlyRate(annualPct);
  const need = target - existing * Math.pow(1 + i, months);
  if (need <= 0) return 0;
  if (i === 0) return need / months;
  return (need * i) / (Math.pow(1 + i, months) - 1);
}

/** Months until `target` is reached saving `monthly` per month. Infinity if it never happens within `cap`. */
export function monthsToReach(target: number, existing: number, monthly: number, annualPct: number, cap = 600): number {
  const i = monthlyRate(annualPct);
  let bal = existing;
  if (bal >= target) return 0;
  for (let m = 1; m <= cap; m++) {
    bal = bal * (1 + i) + monthly;
    if (bal >= target) return m;
  }
  return Infinity;
}

export function inflate(amount: number, annualPct: number, years: number): number {
  return amount * Math.pow(1 + annualPct / 100, years);
}

export function realReturn(nominalPct: number, inflationPct: number): number {
  return ((1 + nominalPct / 100) / (1 + inflationPct / 100) - 1) * 100;
}
