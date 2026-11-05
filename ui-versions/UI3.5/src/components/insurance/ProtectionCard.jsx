import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Umbrella } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useGoTo } from '../../context/NavContext';
import Card from '../ui/Card';
import { Field, InfoTip, Meter, MoneyInput, Notice } from '../ui/Controls';
import { COMMITMENTS_CHANGED } from '../CommitmentsModal';

const fmtRM0 = (n) => `RM ${Math.round(Number(n || 0)).toLocaleString('en-MY')}`;

/**
 * "How protected am I?": emergency cover from real spending and savings, and a needs-based
 * life-cover gap for dependants. Uses the shared profile, unlike the lifestyle model above.
 */
export default function ProtectionCard({ defaultDependants = 0 }) {
  const { authFetch } = useAuth();
  const goTo = useGoTo();
  const [form, setForm] = useState({ dependants: String(defaultDependants), existing_cover: '', support_years: '10' });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const load = useCallback(async () => {
    try {
      const res = await authFetch('/api/insurance/protection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      setData(json.data);
      setError('');
    } catch (err) {
      setError(err.message || 'Could not work out your protection.');
    }
  }, [authFetch, form]);

  useEffect(() => {
    const t = setTimeout(load, 350);
    window.addEventListener(COMMITMENTS_CHANGED, load);
    return () => {
      clearTimeout(t);
      window.removeEventListener(COMMITMENTS_CHANGED, load);
    };
  }, [load]);

  const e = data?.emergency;
  const g = data?.gap;
  return (
    <Card
      icon={Umbrella}
      tone="teal"
      title="How protected am I?"
      note="From your real spending, savings and debts"
      action={
        <InfoTip label="how protection is worked out">
          Emergency cover is your emergency savings divided by your usual monthly spending. The life-cover gap uses a simple needs approach:
          your yearly income for the years your family would need support, plus the debts you have saved, minus your savings and any life cover
          you already have. Every assumption is shown and you can change it. It is not a quote or a product recommendation.
        </InfoTip>
      }
    >
      <Notice tone="danger" show={Boolean(error)}>
        {error}
      </Notice>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <p className="t-label mb-1.5">Emergency cover</p>
          {e ? (
            <>
              <p className="t-figure text-2xl">
                {e.months} <span className="text-base font-semibold text-ink-2">months of spending</span>
              </p>
              <div className="mt-2">
                <Meter value={(e.months / 6) * 100} marker={50} tone={e.months >= 6 ? 'ok' : e.months >= 3 ? 'warn' : 'danger'} label="Emergency cover towards 6 months" />
              </div>
              <p className="t-note mt-1.5">
                The mark is 3 months ({fmtRM0(e.target_3)}); 6 months is {fmtRM0(e.target_6)}.
                {e.short_of_3 > 0 ? ` You are ${fmtRM0(e.short_of_3)} short of 3 months.` : ''}
              </p>
            </>
          ) : (
            <p className="text-sm text-ink-2">
              Add your emergency savings in the Health Check to see how long they would last.{' '}
              <button type="button" onClick={() => goTo('health')} className="link inline-flex items-center gap-1">
                Open Health Check <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </p>
          )}
        </div>

        <div className="space-y-3">
          <p className="t-label">Life cover for your family</p>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Dependants">
              <input type="number" min="0" value={form.dependants} onChange={set('dependants')} className="num" />
            </Field>
            <Field label="Years of support">
              <input type="number" min="1" max="40" value={form.support_years} onChange={set('support_years')} className="num" />
            </Field>
            <Field label="Cover you have" prefix="RM">
              <MoneyInput min="0" value={form.existing_cover} onChange={set('existing_cover')} className="num" />
            </Field>
          </div>
          {g ? (
            <div className="text-sm space-y-1">
              <p>
                Need: {fmtRM0(g.income_need)} income for {g.support_years} years + {fmtRM0(g.debts)} debts ={' '}
                <span className="num font-semibold">{fmtRM0(g.need)}</span>
              </p>
              <p>
                Gap after {fmtRM0(g.savings)} savings and {fmtRM0(g.existing_cover)} cover:{' '}
                <span className={`num font-semibold ${g.gap > 0 ? 'text-danger' : 'text-ok'}`}>{fmtRM0(g.gap)}</span>
              </p>
              <Meter value={g.covered_pct} tone={g.covered_pct >= 100 ? 'ok' : g.covered_pct >= 50 ? 'warn' : 'danger'} label="Share of the need already covered" />
            </div>
          ) : (
            <p className="t-note">With no dependants, life cover mostly matters for debts you would leave behind. Add dependants to see a gap.</p>
          )}
        </div>
      </div>
    </Card>
  );
}
