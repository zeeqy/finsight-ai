/**
 * FinSight AI - Grounding for the AI advisor (Module 2). Published studies found LLMs make
 * arithmetic mistakes in personal-finance answers (Schlosky et al., 2024) and invent figures
 * (Kang & Liu, 2023). So:
 *   1. computedFacts   - every figure the advisor may use is worked out in code first
 *   2. precomputeCheck - "can I afford RM X?" is answered by the decision simulator, not the LLM
 *   3. validateReply   - every RM amount and percentage in the reply is checked against those
 *                        figures; unsupported ones trigger one regeneration, then a visible note
 */

const { currentHealth, simulateDecision } = require('./decisionSimulator');
const { getSpendingInsights } = require('./spendingInsights');

const rm = (x) => `RM ${Number(x).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Rules of thumb the advisor may quote without them being in the user's data
const GENERAL_PERCENTAGES = [50, 30, 20, 2.5, 40, 60, 70, 10, 15, 3, 6, 100];

/** Lines of figures from the shared profile, health index, recurring payments and forecast. */
async function computedFacts(userId) {
  const lines = [];
  let health = null;
  let insights = null;
  try {
    health = await currentHealth(userId);
  } catch (err) {
    console.warn('Advisor: health check unavailable:', err.message);
  }
  try {
    insights = await getSpendingInsights(userId);
  } catch (err) {
    console.warn('Advisor: insights unavailable:', err.message);
  }
  if (health) {
    lines.push(`- Monthly income used for planning: ${rm(health.income)}`);
    if (health.outgoings !== null) lines.push(`- Average monthly spending plus commitments not in statements: ${rm(health.outgoings)}`);
    lines.push(`- Average monthly surplus (money left each month; use THIS for affordability): ${rm(health.surplus)}`);
    lines.push(`- Debt service ratio (DSR) from saved commitments: ${health.dsr ?? 0}% (${health.dsr_band || 'no debts saved'})`);
    lines.push(
      health.emergency_savings === null
        ? '- Emergency savings: not entered (suggest adding them in the Health Check)'
        : `- Emergency savings: ${rm(health.emergency_savings)}, covering ${health.emergency_months} months of spending`
    );
    if (health.health.score !== null) {
      lines.push(
        `- Financial health index: ${health.health.score}/100 (${health.health.band}). Parts: ${health.health.pillars
          .map((p) => `${p.label} ${p.score}/25 (${p.reason})`)
          .join('; ')}`
      );
    }
  }
  if (insights) {
    const active = insights.recurring.filter((r) => r.active && !r.is_saving);
    if (active.length) {
      lines.push(
        `- Recurring payments found in statements, about ${rm(insights.recurring_monthly_total)} a month: ${active
          .slice(0, 6)
          .map((r) => `${r.merchant} ${rm(r.typical_amount)} ${r.cadence}`)
          .join(', ')}`
      );
    }
    if (insights.forecast) {
      const f = insights.forecast;
      lines.push(`- Next month (${f.month}) spending estimate: about ${rm(f.point)}, likely ${rm(f.low)} to ${rm(f.high)}, of which ${rm(f.recurring_part)} is recurring`);
    }
  }
  return { text: lines.join('\n'), health, insights };
}

const AFFORD = /\b(afford|mampu|boleh beli|can i buy|should i buy)\b/i;
const MONTHLY = /\b(a month|per month|monthly|\/\s?month|sebulan|bulanan)\b/i;
const AMOUNT = /RM\s?([\d,]+(?:\.\d+)?)\s?(k|ribu)?/i;

/**
 * For "Can I afford RM X?" questions, runs the decision simulator and returns lines the LLM
 * must quote instead of computing, or null when the message is not such a question.
 */
async function precomputeCheck(userId, message) {
  if (!AFFORD.test(message)) return null;
  const m = message.match(AMOUNT);
  if (!m) return null;
  const amount = parseFloat(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1);
  if (!(amount > 0)) return null;
  const monthly = MONTHLY.test(message);
  const result = await simulateDecision(userId, monthly ? { type: 'commitment', monthly_amount: amount } : { type: 'purchase', amount });
  const { before, after } = result;
  const lines = [
    `PRE-COMPUTED CHECK for ${monthly ? `a new cost of ${rm(amount)} a month` : `a one-off purchase of ${rm(amount)}`} (quote these figures; do not recalculate):`,
    `- Verdict: ${result.verdict}`,
    monthly
      ? `- Money left each month: ${rm(before.surplus)} now, ${rm(after.surplus)} after`
      : before.emergency_savings === null
        ? `- Emergency savings are not entered, so the effect on savings is unknown. It equals ${(amount / Math.max(1, before.surplus)).toFixed(1)} months of the current surplus (${rm(before.surplus)} a month).`
        : `- Emergency savings: ${rm(before.emergency_savings)} now, ${rm(after.emergency_savings)} after (${after.emergency_months} months of spending)`,
    ...result.reasons.map((r) => `- ${r.text}`),
  ];
  return { text: lines.join('\n'), result };
}

/** Every RM amount and percentage written in a piece of text, as numbers. */
function extractFigures(text) {
  const out = [];
  const money = /RM\s?(-?[\d,]+(?:\.\d+)?)\s?(k|mil|million|juta|ribu)?\b/gi;
  let m;
  while ((m = money.exec(text))) {
    const scale = { k: 1e3, ribu: 1e3, mil: 1e6, million: 1e6, juta: 1e6 }[String(m[2] || '').toLowerCase()] || 1;
    const value = parseFloat(m[1].replace(/,/g, '')) * scale;
    if (Number.isFinite(value)) out.push({ kind: 'money', text: m[0].trim(), value, rounded: scale > 1 });
  }
  const pct = /(-?\d+(?:\.\d+)?)\s?%/g;
  while ((m = pct.exec(text))) out.push({ kind: 'percent', text: m[0], value: parseFloat(m[1]), rounded: false });
  return out;
}

/** All plain numbers in a text (used to collect what the advisor was given). */
function numbersIn(text) {
  return (String(text).match(/-?\d[\d,]*(?:\.\d+)?/g) || []).map((s) => parseFloat(s.replace(/,/g, ''))).filter(Number.isFinite);
}

const near = (a, b, rounded) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * (rounded ? 0.05 : 0.005));

/**
 * Checks each figure in the reply against the known figures (context + the user's message):
 *   grounded    - equal to a known figure (allowing rounding), or a known monthly figure x12 / /12
 *   derived     - the sum or difference of two known figures (one step of arithmetic)
 *   unsupported - neither; the advisor may have invented or mis-calculated it
 */
function validateReply(reply, knownText) {
  const known = [...new Set(numbersIn(knownText).map((n) => Math.abs(n)))];
  const base = [...known, ...known.map((n) => n * 12), ...known.map((n) => n / 12)];
  const figures = extractFigures(reply).map((f) => {
    const v = Math.abs(f.value);
    if (f.kind === 'percent' && GENERAL_PERCENTAGES.some((g) => near(v, g, false))) return { ...f, status: 'grounded' };
    if (base.some((k) => near(v, k, f.rounded))) return { ...f, status: 'grounded' };
    for (let i = 0; i < known.length; i += 1) {
      for (let j = i + 1; j < known.length; j += 1) {
        if (near(v, known[i] + known[j], f.rounded) || near(v, Math.abs(known[i] - known[j]), f.rounded)) return { ...f, status: 'derived' };
      }
    }
    return { ...f, status: 'unsupported' };
  });
  return {
    figures,
    total: figures.length,
    grounded: figures.filter((f) => f.status === 'grounded').length,
    derived: figures.filter((f) => f.status === 'derived').length,
    unsupported: figures.filter((f) => f.status === 'unsupported'),
  };
}

/** The instruction added for the one regeneration after a failed check. */
function correctionPrompt(unsupported) {
  return `Your previous answer used figures that are not in the user's data: ${unsupported
    .map((f) => f.text)
    .join(', ')}. Answer again using ONLY figures that appear in the context or the pre-computed check above. If a figure is not there, describe it in words or point the user to the module that works it out. Do not do your own arithmetic.`;
}

module.exports = { computedFacts, precomputeCheck, extractFigures, validateReply, correctionPrompt, GENERAL_PERCENTAGES };
