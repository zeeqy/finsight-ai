/**
 * FinSight AI - Real AI Financial Advisor Route (Module 2)
 * Supports Google Gemini API, OpenAI API, and FinSight Pro Local Fintech Intelligence
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const authenticateToken = require('../middleware/auth');
const { getMonthlySurplus } = require('../services/userFinance');
const { getActiveGoalPlans } = require('../services/goalPlanner');
const { computedFacts, precomputeCheck, validateReply, correctionPrompt } = require('../services/advisorGrounding');

const router = express.Router();
router.use(authenticateToken);

const ENV_PATH = path.join(__dirname, '..', '..', '.env');

const rmFmt = (n) => `RM ${Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const GOAL_WORDS = ['goal', 'haji', 'kahwin', 'wedding', 'nikah', 'hantaran', 'rumah', 'house', 'kereta', 'anak', 'children', 'plan'];

/** Active life goals (Module 4) as prompt lines; empty string when there are none. */
function formatGoalsForPrompt(goals) {
  if (!goals || !goals.goals.length) return '';
  const lines = goals.goals.map(
    (g) =>
      `  - ${g.title} (${g.goal_type}): ${rmFmt(g.current_saved)} of ${rmFmt(g.target_amount)} saved (${g.progress_pct}%), target ${g.target_date} (${g.months_left} months left), needs ${rmFmt(g.required_monthly)}/month in ${g.vehicle} at ${g.rate_pct}% p.a.${g.rate_note ? ' (cautious gold forecast)' : ''}, surplus left for it after earlier goals ${rmFmt(g.available_monthly ?? 0)}/month, status: ${g.feasibility}${g.catches_up ? ' (short today, catches up once earlier goals finish)' : ''}${g.suggested_date ? `, realistic date sharing the surplus with earlier goals: ${g.suggested_date}` : ''}`
  );
  return `
Life Goals (Module 4, active):
${lines.join('\n')}
- Total committed to goals: ${rmFmt(goals.total_required_monthly)}/month against an average monthly surplus of ${rmFmt(goals.monthly_surplus)} (overall: ${goals.overall_feasibility}). The surplus is shared: goals due first take their share first.`;
}

/**
 * Call Google Gemini REST API
 * Supports both AIza... (query param) and AQ.... (x-goog-api-key header) key formats.
 * Google retires model names regularly, so the list is configurable via GEMINI_MODELS
 * (comma-separated). As of Oct 2026, 2.0/1.5/2.5-flash return 404; 3.5-flash answers in ~2s,
 * while 3.8-flash was timing out under load, so it is the last resort.
 */
const GEMINI_MODELS = (process.env.GEMINI_MODELS || 'gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.8-flash')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
const GEMINI_TIMEOUT_MS = 25000;

async function callGeminiAPI(systemPrompt, userMessage, apiKey, history = []) {
  const models = GEMINI_MODELS;
  let lastError = null;

  // Detect key format: AQ. prefix = newer Google AI Studio key (Bearer auth)
  const isAQKey = apiKey.startsWith('AQ.');

  for (const model of models) {
    try {
      // Build URL: AQ keys go in the x-goog-api-key header, AIza keys in the query param.
      // Do NOT also send them as "Authorization: Bearer": Google then treats the key as an
      // OAuth token and rejects it with 401 UNAUTHENTICATED.
      const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const url = isAQKey ? baseUrl : `${baseUrl}?key=${apiKey}`;

      const headers = { 'Content-Type': 'application/json' };
      if (isAQKey) headers['x-goog-api-key'] = apiKey;

      const response = await fetch(url, {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          // Earlier turns first, so follow-up questions ("and the car?") make sense
          contents: [
            ...history.map((h) => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] })),
            { role: 'user', parts: [{ text: userMessage }] },
          ],
          generationConfig: {
            temperature: 0.7,
            // Newer Gemini models spend part of this budget on internal reasoning
            maxOutputTokens: 2048,
          },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Gemini (${model}) error ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      // Join text parts (newer models can return several, plus non-text "thought" parts)
      const reply = (data?.candidates?.[0]?.content?.parts || [])
        .filter((part) => part.text && !part.thought)
        .map((part) => part.text)
        .join('');
      if (reply) return reply;
      lastError = new Error(`Gemini (${model}) returned no text (finishReason: ${data?.candidates?.[0]?.finishReason || 'none'}).`);
    } catch (err) {
      lastError = err;
      console.warn(`Attempt with ${model} failed, trying next model:`, err.message);
    }
  }

  throw lastError || new Error('Failed to generate response from Gemini API.');
}

/**
 * Call OpenAI API (Supports GPT-4o-mini and GPT-3.5-turbo)
 */
async function callOpenAIAPI(systemPrompt, userMessage, apiKey, history = []) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...history.map((h) => ({ role: h.role, content: h.content })),
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 600,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * FinSight Pro Intelligent Malaysian Fintech Advisor Engine
 * Comprehensive conversational financial analysis with zero external API dependencies
 */
function generateContextualAdvice(userMessage, financialContext) {
  const msg = (userMessage || '').toLowerCase().trim();
  const { userName, income, totalSpend, netSavings, topCategory, breakdown, anomalyCount, goals } = financialContext;
  const goalsMonthly = goals?.total_required_monthly || 0;

  const formattedIncome = `RM ${income.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`;
  const formattedSpend = `RM ${totalSpend.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`;
  const formattedSavings = `RM ${netSavings.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`;

  // 1. Greetings & Pleasantries
  if (
    msg === 'hi' ||
    msg === 'hello' ||
    msg === 'helo' ||
    msg === 'hey' ||
    msg === 'yo' ||
    msg.includes('salam') ||
    msg.includes('selamat') ||
    msg.includes('good morning') ||
    msg.includes('good afternoon')
  ) {
    return `Hello **${userName}**! 👋 Welcome to **FinSight AI**.

I am your personalized Malaysian Financial Advisor copilot. Here is your current financial pulse for this month:
• **Monthly Income:** ${formattedIncome}
• **Total Expenses:** ${formattedSpend}
• **Available Surplus:** ${formattedSavings}
${topCategory && topCategory !== 'None' ? `• **Highest Outflow:** **${topCategory}**\n` : ''}
How can I assist you today? You can ask:
1. *"How is my spending pacing this month?"*
2. *"Can I afford a RM 350 purchase right now?"*
3. *"Where can I cut expenses to save 20%?"*
4. *"What should my monthly budget for Food & Dining be?"*`;
  }

  // 2. Connectivity & Test Queries
  if (msg === 'test' || msg === 'testing' || msg === 'check' || msg === 'ping') {
    return `✅ **FinSight AI Advisor Engine is fully operational!**

I am actively connected to your database records. I can analyze your statement transactions, detect anomalies, evaluate budget limits, and guide your savings habits in real-time.`;
  }

  // 2b. Life goals (Module 4) progress
  if (!msg.includes('afford') && GOAL_WORDS.some((w) => msg.includes(w))) {
    if (!goals || !goals.goals.length) {
      return `You don't have any active life goals yet. Open the **Life Goals Planner** to plan for Kahwin, children, Haji, a house or a car. I'll then track them with you here.`;
    }
    let reply = `### 🎯 Your Life Goals\n\n`;
    goals.goals.forEach((g) => {
      reply += `- **${g.title}:** ${rmFmt(g.current_saved)} of ${rmFmt(g.target_amount)} (${g.progress_pct}%). Save **${rmFmt(g.required_monthly)}/month** in ${g.vehicle} until ${g.target_date}. Status: **${g.feasibility}**${g.suggested_date ? ` (realistic by ${g.suggested_date})` : ''}\n`;
    });
    reply += `\n**Total:** ${rmFmt(goalsMonthly)}/month against your average surplus of ${rmFmt(goals.monthly_surplus)}. Overall: **${goals.overall_feasibility}**.`;
    const behind = goals.goals.filter((g) => g.feasibility !== 'On Track');
    if (behind.length) {
      reply += `\n\n💡 ${behind.map((g) => `**${g.title}**`).join(', ')} ${behind.length === 1 ? 'needs' : 'need'} attention. Consider a later target date, a higher-growth savings option, or trimming ${topCategory !== 'None' ? `**${topCategory}**` : 'discretionary'} spending.`;
    }
    return reply;
  }

  // 3. Spending summary & pacing inquiry
  if (
    msg.includes('spend') ||
    msg.includes('pacing') ||
    msg.includes('summary') ||
    msg.includes('how am i doing') ||
    msg.includes('status')
  ) {
    let response = `### 📊 Monthly Spending Breakdown for ${userName}\n\n`;
    response += `• **Income:** ${formattedIncome}\n`;
    response += `• **Total Spending:** ${formattedSpend}\n`;
    response += `• **Net Savings:** ${formattedSavings}\n\n`;

    if (totalSpend === 0) {
      response += `💡 *You have not recorded any expenses for this month yet. Upload a bank statement or add transactions to see detailed insights!*`;
    } else {
      response += `Your largest expense category is **${topCategory}**.\n\n`;
      if (breakdown && breakdown.length > 0) {
        response += `**Category Distribution:**\n`;
        breakdown.slice(0, 4).forEach((item) => {
          const pct = totalSpend > 0 ? ((item.total_amount / totalSpend) * 100).toFixed(1) : 0;
          response += `- **${item.category}:** RM ${item.total_amount.toFixed(2)} (${pct}% of spend, ${item.transaction_count} txns)\n`;
        });
      }

      if (income > 0) {
        const spendRatio = (totalSpend / income) * 100;
        response += `\n**Pacing Assessment:**\n`;
        if (spendRatio > 80) {
          response += `⚠️ **High Outflow Alert:** You have already spent **${spendRatio.toFixed(1)}%** of your monthly income. I strongly advise capping discretionary spending in ${topCategory} for the rest of the month.`;
        } else if (spendRatio > 50) {
          response += `⚖️ **Moderate Pacing:** You have utilized **${spendRatio.toFixed(1)}%** of your monthly income. You are on track, but ensure upcoming bills (utilities, rent) are accounted for.`;
        } else {
          response += `🌟 **Excellent Financial Discipline:** You have only spent **${spendRatio.toFixed(1)}%** of your monthly income. You are retaining a solid surplus!`;
        }
      }
    }
    return response;
  }

  // 4. Affordability evaluation ("Can I afford RM X / laptop / holiday?")
  if (msg.includes('afford') || msg.includes('buy') || msg.includes('purchase') || msg.includes('cost')) {
    const numberMatch = msg.match(/(?:rm\s*|rm)?(\d+(?:,\d{3})*(?:\.\d+)?)/);
    const targetCost = numberMatch ? parseFloat(numberMatch[1].replace(/,/g, '')) : null;

    if (targetCost) {
      // Money already promised to life goals each month is not free to spend
      const free = Math.max(0, netSavings - goalsMonthly);
      let advice = `### 🏷️ Affordability Analysis: RM ${targetCost.toFixed(2)}\n\n`;
      advice += `• Current Monthly Surplus: **${formattedSavings}**\n`;
      if (goalsMonthly > 0) {
        advice += `• Committed to your life goals: **${rmFmt(goalsMonthly)}/month**\n• Free to spend after goals: **${rmFmt(free)}**\n`;
      }
      advice += '\n';

      if (free >= targetCost * 2) {
        advice += `✅ **Comfortably Affordable:** This purchase represents only ${Math.round((targetCost / (free || 1)) * 100)}% of your free surplus. You can comfortably proceed without risking your cash flow${goalsMonthly > 0 ? ' or your goals' : ''}.`;
      } else if (free >= targetCost) {
        advice += `⚠️ **Tight Margin:** You have enough funds to cover this purchase, but it will consume **${Math.round((targetCost / free) * 100)}%** of your remaining monthly buffer. If any unexpected bill arrives, you might face a deficit. Consider delaying until your next salary credit.`;
      } else if (netSavings >= targetCost && goalsMonthly > 0) {
        advice += `⚠️ **Only by pausing your goals:** Your surplus covers it, but you would have to skip **${rmFmt(targetCost - free)}** of this month's goal savings (${goals.goals.map((g) => g.title).join(', ')}). Spreading it over a few months keeps your goals on track.`;
      } else {
        const shortfall = targetCost - free;
        advice += `❌ **Not Recommended Right Now:** This purchase exceeds your ${goalsMonthly > 0 ? 'free surplus after goal savings' : 'current available surplus'} by **RM ${shortfall.toFixed(2)}**. Proceeding now would require dipping into emergency savings or credit. I recommend setting aside **RM ${(targetCost / 3).toFixed(2)}/month** over 3 months instead.`;
      }
      return advice;
    }

    return `To check whether you can afford an item, mention the estimated price (for example: *"Can I afford a RM 450 smartphone repair?"*). Your current available monthly surplus is **${formattedSavings}**.`;
  }

  // 5. Cost-cutting & Budgeting Advice
  if (
    msg.includes('cut') ||
    msg.includes('save') ||
    msg.includes('reduce') ||
    msg.includes('budget') ||
    msg.includes('rule')
  ) {
    let advice = `### 💡 Tailored Savings Strategy for ${userName}\n\n`;
    if (topCategory && topCategory !== 'None') {
      advice += `1. **Optimize ${topCategory}:** This is currently your highest outflow. Analyze your transaction ledger for non-essential impulse purchases.\n`;
    }
    advice += `2. **Apply the 50/30/20 Rule:**\n`;
    advice += `   - **Needs (50%):** RM ${(income * 0.5).toFixed(2)} (Rent, Utilities, Groceries)\n`;
    advice += `   - **Wants (30%):** RM ${(income * 0.3).toFixed(2)} (Dining out, Entertainment, Shopping)\n`;
    advice += `   - **Savings/Debt (20%):** RM ${(income * 0.2).toFixed(2)} (Emergency Fund, ASB, EPF top-up)\n`;
    advice += `3. **Set Category Budgets:** Head over to the **Budget Targets** card on your dashboard and assign strict monthly limits.\n`;

    if (anomalyCount > 0) {
      advice += `\n⚠️ **Notice:** You have **${anomalyCount} unusually large transaction(s)** detected this month. Double check that these were deliberate and planned.`;
    }
    return advice;
  }

  // 6. Anomalies check
  if (msg.includes('anomaly') || msg.includes('unusual') || msg.includes('alert')) {
    if (anomalyCount > 0) {
      return `⚠️ **Anomaly Alert:** You have **${anomalyCount} flagged transaction(s)** this month. In FinSight AI, a transaction is flagged when it is unusually high for its category: more than 2.5 standard deviations above your other spending in that category, and at least 25% above the category average. Review them in the Transaction Ledger!`;
    }
    return `✅ **All Clear!** None of your transactions this month have triggered an anomaly flag. All spending is within your typical statistical variance.`;
  }

  // 7. Identity & Purpose questions
  if (
    msg.includes('who are you') ||
    msg.includes('what are you') ||
    msg.includes('your name') ||
    msg.includes('purpose') ||
    msg.includes('what can you do') ||
    msg.includes('what do you do') ||
    msg.includes('help me') ||
    msg.includes('capabilities') ||
    msg.includes('features')
  ) {
    return `### 🤖 About FinSight AI

Hi **${userName}**! I'm **FinSight AI** — your personal Malaysian financial advisor, built to help you manage your money smarter.

**Here's what I can do for you:**
- 📊 **Spending Analysis** — Break down where your money goes each month
- 💰 **Affordability Check** — Tell you if you can afford a purchase right now
- ✂️ **Savings Tips** — Suggest where to cut costs and how much to save
- ⚠️ **Anomaly Alerts** — Flag unusual or unexpected transactions
- 📋 **Budget Guidance** — Help you apply the 50/30/20 rule to your income

**Your current snapshot:**
- Monthly Income: **RM ${income.toFixed(2)}**
- This month's spending: **RM ${totalSpend.toFixed(2)}**
- Remaining surplus: **RM ${netSavings.toFixed(2)}**

Try asking me: *"How is my spending this month?"* or *"Can I afford a RM 500 item?"*`;
  }

  // 8. User name / profile questions
  if (
    msg.includes("my name") ||
    msg.includes('who am i') ||
    msg.includes('my profile') ||
    msg.includes('my account')
  ) {
    return `Your name on record is **${userName}** 👤.\n\nYour current financial profile:\n- **Monthly Income:** RM ${income.toFixed(2)}\n- **This Month's Spending:** RM ${totalSpend.toFixed(2)}\n- **Available Surplus:** RM ${netSavings.toFixed(2)}\n- **Top Spending Area:** ${topCategory}\n\nWant to know more? Ask me about your spending breakdown or budget tips!`;
  }

  // 9. Thank you / appreciation
  if (
    msg.includes('thank') ||
    msg.includes('terima kasih') ||
    msg.includes('tq') ||
    msg.includes('good job') ||
    msg.includes('great')
  ) {
    return `You're welcome, **${userName}**! 😊 I'm always here whenever you need financial guidance. Remember, small consistent habits lead to big financial wins. Keep tracking your expenses and I'll keep helping you stay on top of your goals! 💪`;
  }

  // 10. Goodbye
  if (msg.includes('bye') || msg.includes('goodbye') || msg.includes('see you') || msg.includes('later')) {
    return `Take care, **${userName}**! 👋 Remember to check back for your spending updates. Every ringgit counts! 💛`;
  }

  // 11. General fallback — friendly redirect
  return `Hi **${userName}**! 👋 I'm FinSight AI, your personal financial advisor.

I specialize in helping you with **Malaysian personal finance**. Here are some things you can ask me:

- 📊 *"How is my spending this month?"*
- 🏷️ *"Can I afford a RM 500 item?"*
- ✂️ *"Where can I cut expenses?"*
- ⚠️ *"Do I have any unusual transactions?"*
- 💡 *"How should I budget my RM ${income.toFixed(0)} salary?"*

Your current surplus is **RM ${netSavings.toFixed(2)}** — want me to help you make the most of it?`;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Everything the advisor knows about the user, from all modules. Used for the LLM prompt,
 * the offline fallback and GET /api/advisor/context (so the UI can show exactly what the AI sees).
 */
async function buildFinancialContext(userId) {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  let hasTransactions = false;

  // Module 1: the latest month that has transactions
  const [latestTxn] = await db.query(
    'SELECT YEAR(txn_date) AS year, MONTH(txn_date) AS month FROM transactions WHERE user_id = ? ORDER BY txn_date DESC LIMIT 1',
    [userId]
  );
  if (latestTxn && latestTxn[0]?.year && latestTxn[0]?.month) {
    year = latestTxn[0].year;
    month = latestTxn[0].month;
    hasTransactions = true;
  }

  const [userRows] = await db.query('SELECT full_name, monthly_income FROM users WHERE id = ?', [userId]);
  const userName = userRows && userRows[0] ? userRows[0].full_name : 'Valued User';
  const income = userRows && userRows[0] ? parseFloat(userRows[0].monthly_income) || 0 : 0;

  const [breakdownRows] = await db.query(
    `SELECT category, SUM(amount) AS total_amount, COUNT(id) AS transaction_count
     FROM transactions
     WHERE user_id = ? AND YEAR(txn_date) = ? AND MONTH(txn_date) = ?
     GROUP BY category
     ORDER BY total_amount DESC`,
    [userId, year, month]
  );

  let totalSpend = 0;
  const breakdown = (breakdownRows || []).filter((r) => r.category !== 'Income').map((r) => {
    const amt = parseFloat(r.total_amount) || 0;
    totalSpend += amt;
    return { category: r.category, total_amount: amt, transaction_count: parseInt(r.transaction_count, 10) };
  });

  const [anomalyRows] = await db.query(
    'SELECT COUNT(id) AS count FROM transactions WHERE user_id = ? AND is_anomaly = 1 AND YEAR(txn_date) = ? AND MONTH(txn_date) = ?',
    [userId, year, month]
  );
  const anomalyCount = anomalyRows && anomalyRows[0] ? parseInt(anomalyRows[0].count, 10) || 0 : 0;

  // Modules 3-5 live in MySQL only. The advisor still answers without them.
  let goals = null;
  let latestLoan = null;
  let latestInsurance = null;
  if (!db.isUsingFallback()) {
    try {
      const surplus = await getMonthlySurplus(userId);
      goals = { ...(await getActiveGoalPlans(userId, surplus.monthly_surplus)), monthly_surplus: surplus.monthly_surplus };
    } catch (err) {
      console.warn('Advisor: could not load life goals:', err.message);
    }
    try {
      const [[loan]] = await db.query(
        `SELECT loan_type, loan_amount, monthly_instalment, tenure_years, dsr, dsr_band, risk_level, risk_counts, overall_verdict, predicted_at
         FROM loan_predictions WHERE user_id = ? ORDER BY predicted_at DESC, id DESC LIMIT 1`,
        [userId]
      );
      latestLoan = loan || null;
      const [[ins]] = await db.query(
        `SELECT age, bmi, smoker, risk_score, risk_tier, predicted_at
         FROM insurance_predictions WHERE user_id = ? ORDER BY predicted_at DESC, id DESC LIMIT 1`,
        [userId]
      );
      latestInsurance = ins ? { ...ins, smoker: Boolean(ins.smoker) } : null;
    } catch (err) {
      console.warn('Advisor: could not load loan/insurance results:', err.message);
    }
  }

  return {
    period: { year, month, label: `${MONTH_NAMES[month - 1]} ${year}`, hasTransactions },
    financialContext: {
      userName,
      income,
      totalSpend,
      netSavings: Math.max(0, income - totalSpend),
      topCategory: breakdown[0]?.category || 'None',
      breakdown,
      anomalyCount,
      goals,
    },
    goals,
    latestLoan,
    latestInsurance,
  };
}

function formatLatestResults({ latestLoan, latestInsurance }) {
  const lines = [];
  if (latestLoan) {
    const l = latestLoan;
    lines.push(
      `- Latest loan check (Module 3, ${String(l.predicted_at).slice(0, 10)}): ${l.loan_type} loan of ${rmFmt(l.loan_amount)} over ${l.tenure_years} years, ${rmFmt(l.monthly_instalment)}/month, DSR after loan ${Number(l.dsr).toFixed(1)}% (${l.dsr_band}), ${
        l.risk_counts
          ? `default risk ${l.risk_level}`
          : `model default score not applicable (the model was trained on 3-5 year personal loans, so for this loan its "${l.risk_level}" score is reference only and the verdict uses DSR alone; do not present it as a real risk level)`
      }, verdict: ${l.overall_verdict}`
    );
  }
  if (latestInsurance) {
    const i = latestInsurance;
    lines.push(
      `- Latest insurance risk check (Module 5): ${i.risk_tier} risk (score ${Math.round(i.risk_score * 100)}%), age ${i.age}, BMI ${i.bmi}, ${i.smoker ? 'smoker' : 'non-smoker'}`
    );
  }
  return lines.length ? `\n${lines.join('\n')}` : '';
}

function buildSystemPrompt(ctx) {
  const f = ctx.financialContext;
  const spendLine = ctx.period.hasTransactions
    ? `- Spending in ${ctx.period.label} (latest month with bank statement data): RM ${f.totalSpend.toFixed(2)}
- Left over that month: RM ${(f.income - f.totalSpend).toFixed(2)}
- Top Outflow Category: ${f.topCategory}
- Spending Breakdown: ${JSON.stringify(f.breakdown)}
- Anomalies Detected: ${f.anomalyCount}`
    : '- No bank statements uploaded yet (suggest uploading one in the Spend Analyser for personalised figures)';

  return `You are FinSight AI, an AI personal finance assistant for young Malaysians inside the FinSight AI app.
You are not a licensed financial adviser: give general guidance based on the user's own data, and for investment, tax or legal decisions suggest a licensed professional.
Current User Context:
- Name: not shared with the AI (data minimisation); address the user as "you"
- Monthly Net Income: RM ${f.income.toFixed(2)}
${spendLine}${formatGoalsForPrompt(ctx.goals) || '\n- Life Goals: none set yet (suggest the Life Goals Planner if the user mentions saving for marriage, Haji, a house, a car or children)'}${formatLatestResults(ctx)}

Guidelines:
1. Provide empathetic, highly actionable advice using Malaysian Ringgit (RM).
2. Reference Malaysian financial practices where appropriate (e.g. DuitNow, ASB, EPF, Tabung Haji, 50/30/20 rule, emergency funds).
3. Be direct, encouraging, and format responses cleanly with markdown bullet points and bold amounts.
4. If asked whether the user can afford a purchase, calculate the exact impact on their remaining monthly surplus, after the money committed to their life goals, and name any goal that would fall behind.
5. Only refer to goals, loan checks and insurance results listed above. Never invent figures, goals or dates.
6. Never recommend a specific bank, insurer, fund or product by name.`;
}

/**
 * The grounded prompt (Phase 4): the original context plus figures worked out in code, and
 * rules that stop the model doing its own arithmetic. `check` is the pre-computed answer to an
 * affordability question, when there is one.
 */
function buildGroundedPrompt(ctx, facts, check) {
  const base = buildSystemPrompt(ctx).replace(
    /4\. If asked whether the user can afford a purchase[^\n]*\n/,
    '4. If asked whether the user can afford something, use the PRE-COMPUTED CHECK below when there is one; otherwise point them to the Health Check page, which works it out.\n'
  );
  return `${base}
7. Every RM amount and percentage you write must come from this context. Do not add, subtract, multiply or estimate figures yourself. If a figure you need is not here, say so and name the FinSight page that works it out (Spend Analyser, Life Goals Planner, Loan Default Predictor, Health Check).
8. When the latest month and the average differ, use the average monthly surplus for planning and say so.

Computed figures (worked out by FinSight from the user's data):
${facts || '- None available'}${check ? `\n\n${check}` : ''}`;
}

/**
 * GET /api/advisor/context
 * What the advisor can see, for the banner in the chat UI.
 */
router.get('/context', async (req, res) => {
  try {
    const ctx = await buildFinancialContext(req.user.id);
    const f = ctx.financialContext;
    return res.json({
      success: true,
      data: {
        period: ctx.period,
        income: f.income,
        totalSpend: f.totalSpend,
        topCategory: f.topCategory,
        anomalyCount: f.anomalyCount,
        goals: ctx.goals
          ? { count: ctx.goals.goals.length, monthly: ctx.goals.total_required_monthly, overall: ctx.goals.overall_feasibility }
          : null,
        latestLoan: ctx.latestLoan ? { verdict: ctx.latestLoan.overall_verdict, loan_type: ctx.latestLoan.loan_type } : null,
        latestInsurance: ctx.latestInsurance ? { risk_tier: ctx.latestInsurance.risk_tier } : null,
      },
    });
  } catch (error) {
    console.error('Advisor context error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load advisor context.' });
  }
});

/** Changing the server-wide LLM key from the UI is a development convenience only. */
const settingsEditable = () => process.env.ALLOW_AI_SETTINGS === 'true';

/**
 * GET /api/advisor/settings
 * Check which AI provider is active and configured
 */
router.get('/settings', (req, res) => {
  const geminiKey = process.env.GEMINI_API_KEY || '';
  const openaiKey = process.env.OPENAI_API_KEY || '';

  let activeProvider = 'local';
  if (geminiKey) activeProvider = 'gemini';
  else if (openaiKey) activeProvider = 'openai';

  return res.json({
    success: true,
    activeProvider,
    canEdit: settingsEditable(),
    hasGeminiKey: Boolean(geminiKey),
    hasOpenAIKey: Boolean(openaiKey),
    geminiKeyMasked: geminiKey ? `${geminiKey.slice(0, 4)}...${geminiKey.slice(-4)}` : '',
    openaiKeyMasked: openaiKey ? `${openaiKey.slice(0, 4)}...${openaiKey.slice(-4)}` : '',
  });
});

/**
 * POST /api/advisor/settings
 * Save and validate API key in server/.env
 */
router.post('/settings', async (req, res) => {
  // The key is server-wide (written to server/.env), so ordinary users must not change it
  if (!settingsEditable()) {
    return res.status(403).json({
      success: false,
      message: 'AI settings are locked. Set GEMINI_API_KEY or OPENAI_API_KEY in server/.env, or set ALLOW_AI_SETTINGS=true there for local development.',
    });
  }
  try {
    const { provider, apiKey } = req.body;

    if (!provider || !['gemini', 'openai', 'local'].includes(provider)) {
      return res.status(400).json({ success: false, message: 'Invalid provider. Choose gemini, openai, or local.' });
    }

    if (provider === 'local') {
      delete process.env.GEMINI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      return res.json({
        success: true,
        message: 'Switched to the offline fallback (keyword rules, no LLM) until the server restarts.',
        activeProvider: 'local',
      });
    }

    if (!apiKey || !apiKey.trim()) {
      return res.status(400).json({ success: false, message: 'API key is required.' });
    }

    const cleanKey = apiKey.trim();

    // Test live connection to verify key validity
    if (provider === 'gemini') {
      await callGeminiAPI('You are a financial advisor.', 'Test connection. Reply with "Connected"', cleanKey);
      process.env.GEMINI_API_KEY = cleanKey;
    } else if (provider === 'openai') {
      await callOpenAIAPI('You are a financial advisor.', 'Test connection. Reply with "Connected"', cleanKey);
      process.env.OPENAI_API_KEY = cleanKey;
    }

    // Persist to server/.env if possible
    try {
      if (fs.existsSync(ENV_PATH)) {
        let envContent = fs.readFileSync(ENV_PATH, 'utf8');
        const keyName = provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY';
        if (envContent.includes(`${keyName}=`)) {
          envContent = envContent.replace(new RegExp(`${keyName}=.*`, 'g'), `${keyName}=${cleanKey}`);
        } else {
          envContent += `\n${keyName}=${cleanKey}\n`;
        }
        fs.writeFileSync(ENV_PATH, envContent);
      }
    } catch (e) {
      console.warn('Could not write to .env file, held in memory:', e.message);
    }

    return res.json({
      success: true,
      message: `Successfully connected and verified ${provider === 'gemini' ? 'Google Gemini AI' : 'OpenAI'}!`,
      activeProvider: provider,
    });
  } catch (error) {
    console.error('API key verification error:', error);
    return res.status(400).json({
      success: false,
      message: `Failed to connect with provided API key: ${error.message}`,
    });
  }
});

/**
 * DELETE /api/advisor/history
 * Clear chat history for the user
 */
router.delete('/history', async (req, res) => {
  try {
    const userId = req.user.id;
    const [sessions] = await db.query(
      'SELECT id FROM chat_sessions WHERE user_id = ?',
      [userId]
    );

    if (sessions && sessions.length > 0) {
      for (const s of sessions) {
        await db.query('DELETE FROM chat_messages WHERE session_id = ?', [s.id]);
      }
    }

    return res.json({
      success: true,
      message: 'Conversation history cleared.',
    });
  } catch (error) {
    console.error('Clear chat error:', error);
    return res.status(500).json({ success: false, message: 'Failed to clear chat history.' });
  }
});

/**
 * GET /api/advisor/history
 * Fetch conversation history for current user session
 */
router.get('/history', async (req, res) => {
  try {
    const userId = req.user.id;

    // Find latest session or create one
    let [sessions] = await db.query(
      'SELECT id FROM chat_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT 1',
      [userId]
    );

    let sessionId;
    if (!sessions || sessions.length === 0) {
      const [newSession] = await db.query('INSERT INTO chat_sessions (user_id) VALUES (?)', [userId]);
      sessionId = newSession.insertId;
      return res.json({ success: true, sessionId, messages: [] });
    }

    sessionId = sessions[0].id;

    const [messages] = await db.query(
      'SELECT id, role, content, sent_at FROM chat_messages WHERE session_id = ? ORDER BY sent_at ASC',
      [sessionId]
    );

    return res.json({
      success: true,
      sessionId,
      messages: messages || [],
    });
  } catch (error) {
    console.error('Chat history error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load chat history.' });
  }
});

const HISTORY_TURNS = 6; // earlier messages sent with each question

// Questions each user may ask in any 24 hours, so one account cannot use up the LLM quota for
// everyone (ADVISOR_DAILY_LIMIT; default 30 in production, 0 = no limit in development and tests).
const envDailyLimit = parseInt(process.env.ADVISOR_DAILY_LIMIT, 10);
const ADVISOR_DAILY_LIMIT = Number.isInteger(envDailyLimit) ? envDailyLimit : process.env.NODE_ENV === 'production' ? 30 : 0;

/** null when the user may ask; otherwise the reply to send (429). MySQL only: the JSON store has no limit. */
async function dailyLimitReply(userId) {
  if (!ADVISOR_DAILY_LIMIT || db.isUsingFallback()) return null;
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS asked, MIN(m.sent_at) AS oldest, TIMESTAMPDIFF(MINUTE, NOW(), MIN(m.sent_at) + INTERVAL 1 DAY) AS wait_minutes
       FROM chat_messages m JOIN chat_sessions s ON s.id = m.session_id
      WHERE s.user_id = ? AND m.role = 'user' AND m.sent_at >= NOW() - INTERVAL 1 DAY`,
    [userId]
  );
  if (Number(row.asked) < ADVISOR_DAILY_LIMIT) return null;
  const minutes = Math.max(1, Number(row.wait_minutes) || 60);
  const wait = minutes >= 90 ? `about ${Math.round(minutes / 60)} hours` : `${minutes} minutes`;
  return {
    success: false,
    code: 'ADVISOR_DAILY_LIMIT',
    message: `You have asked ${ADVISOR_DAILY_LIMIT} questions in the last 24 hours, the most FinSight allows so the advisor stays free for everyone. You can ask again in ${wait}. Every other page still works.`,
  };
}
const ADVISOR_MODES = ['baseline', 'computed', 'validated'];

const summariseCheck = (check) => ({
  checked: check.total,
  grounded: check.grounded,
  derived: check.derived,
  unsupported: check.unsupported.map((f) => f.text),
});

/**
 * POST /api/advisor/chat
 * Accepts user message, injects live database spending context, calls Gemini/OpenAI/Local, and saves to DB
 */
router.post('/chat', async (req, res) => {
  try {
    const userId = req.user.id;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Message content cannot be empty.' });
    }
    if (message.length > 2000) {
      return res.status(400).json({ success: false, message: 'Keep your question under 2,000 characters.' });
    }
    const limited = await dailyLimitReply(userId);
    if (limited) return res.status(429).json(limited);

    // 1. Get or create active session
    let [sessions] = await db.query(
      'SELECT id FROM chat_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT 1',
      [userId]
    );

    let sessionId;
    if (!sessions || sessions.length === 0) {
      const [newSession] = await db.query('INSERT INTO chat_sessions (user_id) VALUES (?)', [userId]);
      sessionId = newSession.insertId;
    } else {
      sessionId = sessions[0].id;
    }

    // Earlier turns of this conversation (before saving the new message)
    let recent = [];
    if (!db.isUsingFallback()) {
      [recent] = await db.query('SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY sent_at DESC, id DESC LIMIT ?', [
        sessionId,
        HISTORY_TURNS,
      ]);
    }
    // How the prompt is built. Only the evaluation (ADVISOR_EVAL=true) may ask for the older ones:
    //   baseline  - the original prompt: raw context, no history, no checks
    //   computed  - computed figures, pre-computed affordability, history
    //   validated - computed + every figure in the reply checked (the default)
    const mode = process.env.ADVISOR_EVAL === 'true' && ADVISOR_MODES.includes(req.body.mode) ? req.body.mode : 'validated';
    const history = mode === 'baseline' ? [] : (recent || []).reverse();

    // 2. Save user message to database
    await db.query('INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)', [
      sessionId,
      'user',
      message.trim(),
    ]);

    // 3. Same financial context the UI shows in "What the advisor can see", plus computed figures
    const ctx = await buildFinancialContext(userId);
    const { financialContext, goals } = ctx;
    let systemPrompt = buildSystemPrompt(ctx);
    if (mode !== 'baseline' && !db.isUsingFallback()) {
      const [facts, check] = await Promise.all([
        computedFacts(userId),
        precomputeCheck(userId, message).catch((err) => {
          console.warn('Advisor: affordability pre-check failed:', err.message);
          return null;
        }),
      ]);
      systemPrompt = buildGroundedPrompt(ctx, facts.text, check?.text);
    }

    let aiReply = '';
    let providerUsed = 'local';
    const askLlm = async (text) => {
      // 4. Google Gemini first, then OpenAI
      if (process.env.GEMINI_API_KEY) {
        try {
          const reply = await callGeminiAPI(systemPrompt, text, process.env.GEMINI_API_KEY, history);
          providerUsed = 'gemini';
          return reply;
        } catch (geminiErr) {
          console.warn('Gemini request failed, falling back:', geminiErr.message);
        }
      }
      // 5. OpenAI if Gemini is not set up or failed
      if (process.env.OPENAI_API_KEY) {
        try {
          const reply = await callOpenAIAPI(systemPrompt, text, process.env.OPENAI_API_KEY, history);
          providerUsed = 'openai';
          return reply;
        } catch (openaiErr) {
          console.warn('OpenAI request failed, falling back:', openaiErr.message);
        }
      }
      return '';
    };
    aiReply = await askLlm(message.trim());

    // Check every figure against what the advisor was given; one retry, then a visible note
    let validation = null;
    if (aiReply && mode !== 'computed') {
      const known = `${systemPrompt}\n${message}`;
      let check = validateReply(aiReply, known);
      let regenerated = false;
      if (mode === 'validated' && check.unsupported.length) {
        const retry = await askLlm(`${message.trim()}\n\n${correctionPrompt(check.unsupported)}`);
        if (retry) {
          const retryCheck = validateReply(retry, known);
          if (retryCheck.unsupported.length <= check.unsupported.length) {
            aiReply = retry;
            check = retryCheck;
          }
          regenerated = true;
        }
        if (check.unsupported.length) {
          aiReply += `\n\n---\n*FinSight could not match ${check.unsupported.map((f) => f.text).join(', ')} to your data. Treat ${check.unsupported.length === 1 ? 'that figure' : 'those figures'} with care.*`;
        }
      }
      validation = {
        checked: check.total,
        grounded: check.grounded,
        derived: check.derived,
        unsupported: check.unsupported.map((f) => f.text),
        regenerated,
      };
    } else if (aiReply) {
      validation = { ...summariseCheck(validateReply(aiReply, `${systemPrompt}\n${message}`)), regenerated: false };
    }

    // 6. FinSight Pro Local Advisor fallback
    if (!aiReply) {
      aiReply = generateContextualAdvice(message, financialContext);
      providerUsed = 'local';
    }

    // 7. Save assistant reply to database
    const [assistantMsgResult] = await db.query(
      'INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)',
      [sessionId, 'assistant', aiReply]
    );

    return res.json({
      success: true,
      reply: aiReply,
      provider: providerUsed,
      mode,
      validation,
      messageId: assistantMsgResult.insertId,
      financialContext: {
        totalSpend: financialContext.totalSpend,
        income: financialContext.income,
        topCategory: financialContext.topCategory,
        activeGoals: goals ? goals.goals.length : 0,
        goalsMonthly: goals ? goals.total_required_monthly : 0,
      },
    });
  } catch (error) {
    console.error('Advisor chat error:', error);
    return res.status(500).json({ success: false, message: 'Failed to process financial advisor message.' });
  }
});

module.exports = router;
