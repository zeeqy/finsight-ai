/**
 * FinSight AI - Debt payoff planner. Simulates month by month:
 *   avalanche - extra money goes to the highest interest rate first (least interest; Amar et al., 2011)
 *   snowball  - extra money goes to the smallest balance first (quick wins that help people keep
 *               going; Gal & McShane, 2012; Kettle et al., 2016)
 * In both, a cleared debt's payment rolls over to the next one. Interest is charged monthly on
 * the balance (reducing balance). Car hire purchase signed before 1 Jun 2026 uses a flat rate,
 * where settling early earns a rebate rather than saving interest month by month, so savings on
 * those older car loans are an approximation. Agreements from 1 Jun 2026 use a reducing balance.
 */

const MAX_MONTHS = 600;
const round2 = (x) => Math.round(x * 100) / 100;

const ORDER = {
  avalanche: (a, b) => b.rate - a.rate || a.balance - b.balance,
  snowball: (a, b) => a.balance - b.balance || b.rate - a.rate,
};

/**
 * debts: [{ id, label, balance, annual_rate (%), monthly_amount }]
 * strategy: 'avalanche' | 'snowball' | 'minimum' (minimum payments only, nothing rolls over)
 */
function simulatePayoff(debts, { strategy = 'avalanche', extraMonthly = 0 } = {}) {
  const list = debts.map((d) => ({
    id: d.id,
    label: d.label,
    balance: d.balance,
    rate: d.annual_rate || 0,
    minimum: d.monthly_amount,
    paidOffMonth: null,
    interest: 0,
  }));
  const budget = list.reduce((s, d) => s + d.minimum, 0) + (strategy === 'minimum' ? 0 : extraMonthly);
  let month = 0;
  let totalInterest = 0;

  while (list.some((d) => d.balance > 0.005) && month < MAX_MONTHS) {
    month += 1;
    for (const d of list) {
      if (d.balance <= 0.005) continue;
      const interest = (d.balance * d.rate) / 100 / 12;
      d.balance += interest;
      d.interest += interest;
      totalInterest += interest;
    }
    // Minimum payments first
    let left = budget;
    for (const d of list) {
      if (d.balance <= 0.005) continue;
      const pay = Math.min(d.minimum, d.balance);
      d.balance -= pay;
      left -= pay;
    }
    if (strategy !== 'minimum') {
      // Then everything left, including cleared debts' payments, in the strategy's order
      for (const d of [...list].filter((x) => x.balance > 0.005).sort(ORDER[strategy])) {
        if (left <= 0) break;
        const pay = Math.min(left, d.balance);
        d.balance -= pay;
        left -= pay;
      }
    }
    for (const d of list) if (d.balance <= 0.005 && d.paidOffMonth === null) d.paidOffMonth = month;
  }

  const finished = list.every((d) => d.balance <= 0.005);
  return {
    strategy,
    months: finished ? month : null,
    total_interest: round2(totalInterest),
    debts: list
      .map((d) => ({ id: d.id, label: d.label, paid_off_month: d.paidOffMonth, interest: round2(d.interest) }))
      .sort((a, b) => (a.paid_off_month ?? Infinity) - (b.paid_off_month ?? Infinity)),
  };
}

/** Both strategies and the minimum-payment baseline, with a plain comparison. */
function planPayoff(commitments, extraMonthly = 0) {
  const usable = [];
  const excluded = [];
  for (const c of commitments) {
    const balance = parseFloat(c.balance);
    const rate = c.annual_rate === null || c.annual_rate === undefined ? null : parseFloat(c.annual_rate);
    if (!(balance > 0)) excluded.push({ label: c.label, reason: 'no balance left entered' });
    else if (rate === null) excluded.push({ label: c.label, reason: 'no interest rate entered' });
    else usable.push({ id: c.id, label: c.label, balance, annual_rate: rate, monthly_amount: parseFloat(c.monthly_amount), kind: c.kind });
  }
  if (!usable.length) return { debts: [], excluded, strategies: null };

  // A payment that never covers the interest cannot clear the debt
  const stuck = usable.filter((d) => d.monthly_amount <= (d.balance * d.annual_rate) / 100 / 12);
  const extra = Math.max(0, extraMonthly);
  const avalanche = simulatePayoff(usable, { strategy: 'avalanche', extraMonthly: extra });
  const snowball = simulatePayoff(usable, { strategy: 'snowball', extraMonthly: extra });
  const minimum = simulatePayoff(usable, { strategy: 'minimum' });

  return {
    debts: usable.map(({ id, label, balance, annual_rate, monthly_amount, kind }) => ({ id, label, balance, annual_rate, monthly_amount, kind })),
    excluded,
    stuck: stuck.map((d) => d.label),
    extra_monthly: extra,
    has_flat_rate_loan: usable.some((d) => d.kind === 'car_loan'),
    strategies: { avalanche, snowball, minimum },
    comparison: {
      interest_saved_by_avalanche: round2(snowball.total_interest - avalanche.total_interest),
      first_win_snowball_month: snowball.debts[0]?.paid_off_month ?? null,
      first_win_avalanche_month: avalanche.debts[0]?.paid_off_month ?? null,
      interest_saved_vs_minimum: round2(minimum.total_interest - avalanche.total_interest),
      months_saved_vs_minimum: minimum.months && avalanche.months ? minimum.months - avalanche.months : null,
    },
  };
}

module.exports = { simulatePayoff, planPayoff };
