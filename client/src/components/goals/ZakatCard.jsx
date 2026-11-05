import React, { useState } from 'react';
import { HandHeart } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Card from '../ui/Card';
import { Field, InfoTip, MoneyInput, Notice } from '../ui/Controls';

const fmtRM = (n) => `RM ${Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthLabel = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });

/** Zakat on savings and income, with the nisab worked out from the gold price Module 4 already uses. */
export default function ZakatCard({ monthlyIncome }) {
  const { authFetch } = useAuth();
  const [savings, setSavings] = useState('');
  const [annualIncome, setAnnualIncome] = useState(monthlyIncome > 0 ? String(Math.round(monthlyIncome * 12)) : '');
  const [nisab, setNisab] = useState('');
  const [heldOneYear, setHeldOneYear] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const run = async (e) => {
    e.preventDefault();
    try {
      const res = await authFetch('/api/profile/zakat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ savings, annual_income: annualIncome, nisab: nisab || null, held_one_year: heldOneYear }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      setResult(json.data);
      setError('');
    } catch (err) {
      setError(err.message || 'Could not work out zakat.');
    }
  };

  return (
    <Card
      icon={HandHeart}
      tone="green"
      title="Zakat"
      note="On savings and on income, as a planning estimate"
      action={
        <InfoTip label="how zakat is worked out">
          Following Lembaga Zakat Selangor: zakat is 2.5%, due when the amount reaches the nisab, the value of 85 g of gold. Savings must also
          have been held for one lunar year. Income uses the no-deduction method (2.5% of gross yearly income), which every state accepts; some
          states also allow deductions, which give a smaller figure. Your state zakat office announces the official nisab and collects
          payment.
        </InfoTip>
      }
    >
      <form onSubmit={run} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Savings held for a year" prefix="RM" hint="The lowest balance across all your savings during the year.">
            <MoneyInput min="0" value={savings} onChange={(e) => setSavings(e.target.value)} className="num" />
          </Field>
          <Field label="Yearly income before deductions" prefix="RM">
            <MoneyInput min="0" value={annualIncome} onChange={(e) => setAnnualIncome(e.target.value)} className="num" />
          </Field>
          <Field label="Official nisab (optional)" prefix="RM" hint="From your state zakat office. Left empty, it is worked out from the gold price.">
            <MoneyInput min="0" value={nisab} onChange={(e) => setNisab(e.target.value)} className="num" />
          </Field>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer sm:mt-7">
            <input type="checkbox" checked={heldOneYear} onChange={(e) => setHeldOneYear(e.target.checked)} className="w-4 h-4 accent-[var(--accent)]" />
            I have held these savings for a full lunar year
          </label>
        </div>
        <button type="submit" className="btn btn-accent">
          Work out zakat
        </button>
      </form>
      <Notice tone="danger" show={Boolean(error)} className="mt-3">
        {error}
      </Notice>
      {result && (
        <div className="mt-4 space-y-2 text-sm">
          <p>
            Nisab: <span className="num font-semibold">{fmtRM(result.nisab)}</span>{' '}
            <span className="text-ink-2">
              {result.nisab_source === 'entered'
                ? '(the figure you entered)'
                : `(85 g at ${fmtRM(result.gold.price)} a gram, ${monthLabel(result.gold.month)} gold price${result.gold.source === 'fallback' ? ', stored figure because the gold service is offline' : ''})`}
            </span>
          </p>
          <ul className="divide-y divide-line rounded-xl border border-line">
            <li className="flex justify-between gap-3 p-3">
              <span>
                On savings
                <span className="block t-note">
                  {!result.savings.held_one_year ? 'Not due until held for a year' : result.savings.above_nisab ? '2.5% of your savings' : 'Below the nisab, none due'}
                </span>
              </span>
              <span className="num font-semibold">{fmtRM(result.savings.zakat)}</span>
            </li>
            <li className="flex justify-between gap-3 p-3">
              <span>
                On income
                <span className="block t-note">
                  {result.income.above_nisab ? `2.5% of yearly income, about ${fmtRM(result.income.monthly)} a month` : 'Below the nisab, none due'}
                </span>
              </span>
              <span className="num font-semibold">{fmtRM(result.income.zakat)}</span>
            </li>
            <li className="flex justify-between gap-3 p-3 font-semibold">
              <span>Total for the year</span>
              <span className="num">{fmtRM(result.total)}</span>
            </li>
          </ul>
          <p className="t-note">
            An estimate to plan with. Confirm the amount with your state zakat office. Zakat paid to a recognised body can be claimed as an
            income tax rebate.
          </p>
        </div>
      )}
    </Card>
  );
}
