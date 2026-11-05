/**
 * FinSight AI - Compare insurance quotes (Module 5). The user enters quotes they received from
 * insurers or takaful operators; FinSight checks each one against their own figures:
 *   - affordability: the premium as a new monthly commitment through the decision simulator
 *     (surplus, emergency cover, goals, health index);
 *   - medical plans: what the user would pay themselves on an example hospital bill
 *     (deductible first, then co-payment up to its cap, then anything above the annual limit);
 *   - life and critical-illness plans: how much of the needs-based protection gap the cover closes.
 * FinSight never prices a policy or ranks insurers: every figure comes from the user's quote.
 */

const db = require('../db');
const { applyDecision, explain, snapshotFor, loadSituationState } = require('./decisionSimulator');
const { DEFAULT_SUPPORT_YEARS, protectionCheck } = require('./protection');

const QUOTE_CONFIG = {
  maxQuotes: 6,
  planTypes: {
    medical: 'Medical card',
    life: 'Life cover / family takaful',
    critical_illness: 'Critical illness',
  },
  frequencies: ['monthly', 'yearly'],
  // Each company's own Malaysian site (checked 5 Nov 2026), alphabetical. No ranking or arrangement.
  links: [
    { name: 'AIA', url: 'https://www.aia.com.my' },
    { name: 'Allianz', url: 'https://www.allianz.com.my' },
    { name: 'Etiqa', url: 'https://www.etiqa.com.my' },
    { name: 'FWD Takaful', url: 'https://www.fwd.com.my' },
    { name: 'Great Eastern', url: 'https://www.greateasternlife.com/my/en/' },
    { name: 'Hong Leong Assurance', url: 'https://www.hla.com.my' },
    { name: 'Manulife', url: 'https://www.manulife.com.my' },
    { name: 'Prudential', url: 'https://www.prudential.com.my' },
    { name: 'Prudential BSN Takaful', url: 'https://www.prubsn.com.my' },
    { name: 'Sun Life Malaysia', url: 'https://www.sunlifemalaysia.com' },
    { name: 'Takaful Malaysia', url: 'https://www.takaful-malaysia.com.my' },
    { name: 'Tokio Marine Life', url: 'https://www.tokiomarinelife.com.my' },
    { name: 'Zurich', url: 'https://www.zurich.com.my' },
  ],
  // Neutral guidance from the Financial Education Network (BNM and Securities Commission)
  guide: { name: 'Medical and health insurance/takaful made simple (FEN)', url: 'https://www.fenetwork.my/medical-and-health-insurance-takaful/' },
  licensedList: { name: 'BNM list of licensed insurers and takaful operators', url: 'https://www.bnm.gov.my/list-of-licensed-financial-institutions' },
};

const round2 = (x) => Math.round(x * 100) / 100;

/** Validates one quote from the form. Throws RangeError with a message the user can act on. */
function parseQuote(body) {
  const provider = String(body.provider || '').trim();
  if (!provider) throw new RangeError('Enter the insurer or takaful operator that gave you this quote.');
  if (provider.length > 100) throw new RangeError('Keep the insurer name under 100 characters.');
  const planType = body.plan_type;
  if (!QUOTE_CONFIG.planTypes[planType]) throw new RangeError('Choose medical card, life cover or critical illness.');
  const frequency = body.premium_frequency || 'monthly';
  if (!QUOTE_CONFIG.frequencies.includes(frequency)) throw new RangeError('The premium is paid monthly or yearly.');

  const money = (v, label, { required = false, positive = false } = {}) => {
    if (v === undefined || v === null || v === '') {
      if (required) throw new RangeError(`Enter the ${label}.`);
      return null;
    }
    const n = parseFloat(v);
    if (!Number.isFinite(n) || n < 0 || (positive && n === 0)) throw new RangeError(`The ${label} must be ${positive ? 'more than RM 0' : 'RM 0 or more'}.`);
    return round2(n);
  };

  const premium = money(body.premium, 'premium', { required: true, positive: true });
  const quote = {
    provider,
    plan_name: String(body.plan_name || '').trim().slice(0, 150) || null,
    plan_type: planType,
    takaful: body.takaful === true || body.takaful === 'true',
    premium,
    premium_frequency: frequency,
    coverage: null,
    annual_limit: null,
    deductible: 0,
    co_pay_pct: 0,
    co_pay_cap: null,
    room_board: null,
  };
  if (planType === 'medical') {
    quote.annual_limit = money(body.annual_limit, 'annual limit', { required: true, positive: true });
    quote.deductible = money(body.deductible, 'deductible') || 0;
    const coPay = body.co_pay_pct === undefined || body.co_pay_pct === '' ? 0 : parseFloat(body.co_pay_pct);
    if (!(coPay >= 0 && coPay <= 100)) throw new RangeError('Co-payment is a percentage from 0 to 100.');
    quote.co_pay_pct = coPay;
    quote.co_pay_cap = money(body.co_pay_cap, 'co-payment cap');
    quote.room_board = money(body.room_board, 'room and board limit');
  } else {
    quote.coverage = money(body.coverage, 'amount of cover', { required: true, positive: true });
  }
  return quote;
}

const monthlyPremium = (q) => round2(q.premium_frequency === 'yearly' ? q.premium / 12 : Number(q.premium));

/**
 * What the user pays on a hospital bill under a medical plan. The deductible is paid first; the
 * co-payment is a share of the rest, up to its cap; the insurer pays the remainder up to the
 * annual limit, and anything above the limit is the user's too.
 */
function outOfPocket(q, bill) {
  const deductible = Math.min(bill, Number(q.deductible) || 0);
  const rest = bill - deductible;
  let coPay = rest * ((Number(q.co_pay_pct) || 0) / 100);
  if (q.co_pay_cap !== null && q.co_pay_cap !== undefined) coPay = Math.min(coPay, Number(q.co_pay_cap));
  const insurerPays = Math.min(rest - coPay, Number(q.annual_limit) || 0);
  const youPay = bill - insurerPays;
  return {
    bill: round2(bill),
    deductible: round2(deductible),
    co_pay: round2(coPay),
    above_limit: round2(Math.max(0, rest - coPay - insurerPays)),
    you_pay: round2(youPay),
    insurer_pays: round2(insurerPays),
  };
}

/** Plain facts that tell the quotes apart. Never an overall "best": that is the user's call. */
function highlights(rows) {
  const facts = [];
  const name = (r) => (r.plan_name ? `${r.provider} (${r.plan_name})` : r.provider);
  // Premiums are only compared between quotes for the same kind of plan
  for (const [type, label] of Object.entries(QUOTE_CONFIG.planTypes)) {
    const same = rows.filter((r) => r.plan_type === type);
    if (same.length < 2) continue;
    const cheapest = [...same].sort((a, b) => a.monthly_premium - b.monthly_premium)[0];
    facts.push({ key: 'premium', plan_type: type, text: `Lowest premium for ${label.toLowerCase()}: ${name(cheapest)}, RM ${cheapest.monthly_premium.toFixed(2)} a month.`, quote_id: cheapest.id });
  }
  const medical = rows.filter((r) => r.medical?.you_pay !== undefined);
  if (medical.length > 1) {
    const least = [...medical].sort((a, b) => a.medical.you_pay - b.medical.you_pay)[0];
    facts.push({ key: 'out_of_pocket', text: `Least to pay yourself on the example bill: ${name(least)}, RM ${least.medical.you_pay.toFixed(2)}.`, quote_id: least.id });
  }
  const cover = rows.filter((r) => r.plan_type !== 'medical' && r.cover?.per_rm_premium);
  if (cover.length > 1) {
    const most = [...cover].sort((a, b) => b.cover.per_rm_premium - a.cover.per_rm_premium)[0];
    facts.push({ key: 'cover_per_rm', text: `Most cover for each ringgit of premium: ${name(most)}.`, quote_id: most.id });
  }
  return facts;
}

/**
 * Compares the user's saved quotes. Options: example_bill (medical), dependants, support_years
 * and existing_cover (life and critical illness gap).
 */
async function compareQuotes(userId, quotes, options = {}) {
  const exampleBill = options.example_bill === undefined || options.example_bill === '' ? null : parseFloat(options.example_bill);
  if (exampleBill !== null && !(exampleBill > 0)) throw new RangeError('The example hospital bill must be more than RM 0.');
  const dependants = Math.max(0, Math.round(parseFloat(options.dependants) || 0));
  const existingCover = Math.max(0, parseFloat(options.existing_cover) || 0);
  const supportYears = options.support_years === undefined || options.support_years === '' ? DEFAULT_SUPPORT_YEARS : parseFloat(options.support_years);
  if (!(supportYears >= 1 && supportYears <= 40)) throw new RangeError('Years of support must be between 1 and 40.');

  const [{ state }, [debtRows]] = await Promise.all([
    loadSituationState(userId),
    db.query(
      "SELECT COALESCE(SUM(balance), 0) AS owed FROM commitments WHERE user_id = ? AND kind IN ('car_loan','house_loan','personal_loan','ptptn','credit_card')",
      [userId]
    ),
  ]);
  const before = await snapshotFor(state);
  const protection = protectionCheck({
    monthlyIncome: state.income,
    monthlyOutgoings: state.outgoings,
    emergencySavings: state.savings,
    debtsOutstanding: parseFloat(debtRows[0].owed) || 0,
    dependants,
    existingCover,
    supportYears,
  });
  const gap = protection.gap?.gap ?? null;

  const rows = [];
  for (const q of quotes) {
    const monthly = monthlyPremium(q);
    const { after: afterState, summary } = applyDecision({ type: 'commitment', monthly_amount: monthly }, state);
    const after = await snapshotFor(afterState);
    const { verdict, reasons } = explain(before, after, state, summary);
    const row = {
      id: q.id,
      provider: q.provider,
      plan_name: q.plan_name,
      plan_type: q.plan_type,
      plan_label: QUOTE_CONFIG.planTypes[q.plan_type],
      takaful: Boolean(q.takaful),
      premium: Number(q.premium),
      premium_frequency: q.premium_frequency,
      monthly_premium: monthly,
      yearly_premium: round2(monthly * 12),
      share_of_income_pct: state.income > 0 ? round2((monthly / state.income) * 100) : null,
      share_of_surplus_pct: before.surplus > 0 ? round2((monthly / before.surplus) * 100) : null,
      affordability: {
        verdict,
        surplus_after: after.surplus,
        health_before: before.health.score,
        health_after: after.health.score,
        reasons: reasons.slice(0, 3),
      },
    };
    if (q.plan_type === 'medical') {
      row.medical = {
        annual_limit: Number(q.annual_limit),
        deductible: Number(q.deductible),
        co_pay_pct: Number(q.co_pay_pct),
        co_pay_cap: q.co_pay_cap === null ? null : Number(q.co_pay_cap),
        room_board: q.room_board === null ? null : Number(q.room_board),
        ...(exampleBill ? outOfPocket(q, exampleBill) : {}),
      };
    } else {
      const coverage = Number(q.coverage);
      row.cover = {
        coverage,
        per_rm_premium: round2(coverage / (monthly * 12)),
        gap_closed_pct: gap > 0 ? round2(Math.min(100, (coverage / gap) * 100)) : null,
        gap_left: gap > 0 ? round2(Math.max(0, gap - coverage)) : null,
      };
    }
    rows.push(row);
  }

  return {
    quotes: rows,
    highlights: highlights(rows),
    surplus: before.surplus,
    income: state.income,
    health: { score: before.health.score, band: before.health.band },
    example_bill: exampleBill,
    protection_gap: protection.gap,
    notes: [
      'Every premium and benefit comes from the quotes you entered. FinSight does not price policies or recommend an insurer.',
      'A quote depends on your health declaration and the insurer\'s underwriting, so the final premium can differ.',
    ],
  };
}

module.exports = { QUOTE_CONFIG, parseQuote, monthlyPremium, outOfPocket, highlights, compareQuotes };
