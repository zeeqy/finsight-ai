import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Pencil, Plus, Scale, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Card from '../ui/Card';
import { Empty, Field, InfoTip, Loading, MoneyInput, Notice, Segmented } from '../ui/Controls';
import { Modal, useConfirm } from '../ui/Modal';
import { COMMITMENTS_CHANGED } from '../CommitmentsModal';

const fmtRM = (n) => `RM ${Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtRM0 = (n) => `RM ${Math.round(Number(n || 0)).toLocaleString('en-MY')}`;
const VERDICT_TAG = { Manageable: 'tag-ok', Tight: 'tag-warn', Risky: 'tag-danger' };
const EXAMPLE_BILL = '20000';

const PLAN_OPTIONS = [
  { value: 'medical', label: 'Medical card' },
  { value: 'life', label: 'Life cover' },
  { value: 'critical_illness', label: 'Critical illness' },
];
const FREQUENCY_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];
const KIND_OPTIONS = [
  { value: false, label: 'Conventional' },
  { value: true, label: 'Takaful' },
];
const BLANK = {
  provider: '',
  plan_name: '',
  plan_type: 'medical',
  takaful: false,
  premium: '',
  premium_frequency: 'monthly',
  coverage: '',
  annual_limit: '',
  deductible: '',
  co_pay_pct: '',
  co_pay_cap: '',
  room_board: '',
};
const asForm = (q) => Object.fromEntries(Object.keys(BLANK).map((k) => [k, q[k] === null || q[k] === undefined ? BLANK[k] : q[k]]));

/** Add or edit one quote. */
function QuoteForm({ initial, onSave, onClose, busy, error }) {
  const [f, setF] = useState(initial);
  const set = (key) => (e) => setF((prev) => ({ ...prev, [key]: e.target.value }));
  const medical = f.plan_type === 'medical';
  return (
    <Modal
      title={initial.id ? 'Edit quote' : 'Add a quote'}
      description="Copy the figures from the quote or Product Disclosure Sheet the insurer gave you."
      onClose={onClose}
      width="max-w-lg"
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(f);
        }}
      >
        <Segmented label="Type of plan" options={PLAN_OPTIONS} value={f.plan_type} onChange={(v) => setF((p) => ({ ...p, plan_type: v }))} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Insurer or takaful operator">
            <input value={f.provider} onChange={set('provider')} maxLength={100} placeholder="Who gave you the quote" required />
          </Field>
          <Field label="Plan name (optional)">
            <input value={f.plan_name} onChange={set('plan_name')} maxLength={150} />
          </Field>
        </div>
        <Segmented label="Conventional or takaful" options={KIND_OPTIONS} value={Boolean(f.takaful)} onChange={(v) => setF((p) => ({ ...p, takaful: v }))} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <Field label="Premium or contribution" prefix="RM">
            <MoneyInput value={f.premium} onChange={set('premium')} required />
          </Field>
          <Segmented label="How often you pay" options={FREQUENCY_OPTIONS} value={f.premium_frequency} onChange={(v) => setF((p) => ({ ...p, premium_frequency: v }))} />
        </div>
        {medical ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Annual limit" prefix="RM" hint="The most the plan pays in a year.">
              <MoneyInput value={f.annual_limit} onChange={set('annual_limit')} required />
            </Field>
            <Field label="Room and board a day" prefix="RM" hint="Leave blank if the quote does not say.">
              <MoneyInput value={f.room_board} onChange={set('room_board')} />
            </Field>
            <Field label="Deductible" prefix="RM" hint="What you pay first on each claim.">
              <MoneyInput value={f.deductible} onChange={set('deductible')} placeholder="0" />
            </Field>
            <Field label="Co-payment (%)" hint="Your share of the bill after the deductible.">
              <input type="number" min="0" max="100" step="0.1" className="num" value={f.co_pay_pct} onChange={set('co_pay_pct')} placeholder="0" />
            </Field>
            <Field label="Co-payment cap" prefix="RM" hint="The most co-payment can come to, if there is a cap." className="sm:col-span-2">
              <MoneyInput value={f.co_pay_cap} onChange={set('co_pay_cap')} />
            </Field>
          </div>
        ) : (
          <Field label={f.plan_type === 'life' ? 'Amount of cover (sum assured)' : 'Lump sum paid on diagnosis'} prefix="RM">
            <MoneyInput value={f.coverage} onChange={set('coverage')} required />
          </Field>
        )}
        <Notice tone="danger" show={Boolean(error)}>
          {error}
        </Notice>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-quiet">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="btn btn-accent">
            {initial.id ? 'Save changes' : 'Add quote'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const quoteName = (q) => (
  <>
    <span className="font-semibold text-ink">{q.provider}</span>
    {q.plan_name && <span className="block t-note">{q.plan_name}</span>}
    <span className="block t-note">{q.takaful ? 'Takaful' : 'Conventional'}</span>
  </>
);

/** One table per kind of plan, quotes as columns, so like is only compared with like. */
function ComparisonTable({ type, rows, exampleBill, onEdit, onRemove }) {
  const medical = type === 'medical';
  const lines = [
    ['Premium a month', (q) => <span className="num font-semibold">{fmtRM(q.monthly_premium)}</span>],
    ['Premium a year', (q) => <span className="num">{fmtRM(q.yearly_premium)}</span>],
    ['Share of what you have left each month', (q) => <span className="num">{q.share_of_surplus_pct === null ? 'No surplus' : `${q.share_of_surplus_pct}%`}</span>],
    [
      'With this premium',
      (q) => (
        <>
          <span className={`tag ${VERDICT_TAG[q.affordability.verdict]}`}>{q.affordability.verdict}</span>
          <span className="block t-note mt-1 num">{fmtRM0(q.affordability.surplus_after)} left a month</span>
        </>
      ),
    ],
  ];
  if (medical) {
    lines.push(
      ['Annual limit', (q) => <span className="num">{fmtRM0(q.medical.annual_limit)}</span>],
      ['Room and board a day', (q) => <span className="num">{q.medical.room_board === null ? 'Not given' : fmtRM0(q.medical.room_board)}</span>],
      ['Deductible', (q) => <span className="num">{fmtRM0(q.medical.deductible)}</span>],
      ['Co-payment', (q) => <span className="num">{q.medical.co_pay_pct ? `${q.medical.co_pay_pct}%${q.medical.co_pay_cap !== null ? `, up to ${fmtRM0(q.medical.co_pay_cap)}` : ''}` : 'None'}</span>]
    );
    if (exampleBill) {
      lines.push([
        `You pay on a ${fmtRM0(exampleBill)} bill`,
        (q) => (
          <>
            <span className="num font-semibold">{fmtRM(q.medical.you_pay)}</span>
            {q.medical.above_limit > 0 && <span className="block t-note num">{fmtRM0(q.medical.above_limit)} above the limit</span>}
          </>
        ),
      ]);
    }
  } else {
    lines.push(
      [type === 'life' ? 'Cover' : 'Lump sum on diagnosis', (q) => <span className="num font-semibold">{fmtRM0(q.cover.coverage)}</span>],
      ['Cover for each RM 1 of premium a year', (q) => <span className="num">{fmtRM0(q.cover.per_rm_premium)}</span>]
    );
    if (type === 'life') {
      lines.push([
        'Your protection gap closed',
        (q) =>
          q.cover.gap_closed_pct === null ? (
            <span className="t-note">Add dependants above</span>
          ) : (
            <>
              <span className="num font-semibold">{q.cover.gap_closed_pct}%</span>
              {q.cover.gap_left > 0 && <span className="block t-note num">{fmtRM0(q.cover.gap_left)} still open</span>}
            </>
          ),
      ]);
    }
  }

  return (
    <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5 pb-1">
      <table className="w-full text-left text-sm min-w-[28rem]">
        <caption className="text-left t-label pb-2">{PLAN_OPTIONS.find((p) => p.value === type).label}</caption>
        <thead>
          <tr className="border-b border-line align-bottom">
            <th scope="col" className="py-2 pr-3 font-medium text-ink-3 w-44 sticky left-0 bg-surface">
              <span className="sr-only">Detail</span>
            </th>
            {rows.map((q) => (
              <th key={q.id} scope="col" className="py-2 pr-3 font-normal min-w-[9rem]">
                {quoteName(q)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {lines.map(([label, cell]) => (
            <tr key={label}>
              <th scope="row" className="py-2 pr-3 font-medium text-ink-2 sticky left-0 bg-surface">
                {label}
              </th>
              {rows.map((q) => (
                <td key={q.id} className="py-2 pr-3 align-top">
                  {cell(q)}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <th scope="row" className="py-2 pr-3">
              <span className="sr-only">Actions</span>
            </th>
            {rows.map((q) => (
              <td key={q.id} className="py-2 pr-3">
                <div className="flex gap-1">
                  <button type="button" onClick={() => onEdit(q)} className="btn btn-quiet btn-sm btn-icon" aria-label={`Edit the ${q.provider} quote`}>
                    <Pencil className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => onRemove(q)} className="btn btn-danger-quiet btn-sm btn-icon" aria-label={`Remove the ${q.provider} quote`}>
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * Compare quotes the user received from insurers or takaful operators against their own figures.
 * FinSight never prices a policy or picks an insurer: it shows what each quote means for them.
 */
export default function QuoteCompareCard({ defaultDependants = 0 }) {
  const { authFetch } = useAuth();
  const confirm = useConfirm();
  const [quotes, setQuotes] = useState(null);
  const [config, setConfig] = useState(null);
  const [result, setResult] = useState(null);
  const [options, setOptions] = useState({ example_bill: EXAMPLE_BILL, dependants: String(defaultDependants) });
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [error, setError] = useState('');

  const loadQuotes = useCallback(async () => {
    try {
      const json = await authFetch('/api/insurance/quotes').then((r) => r.json());
      if (!json.success) throw new Error(json.message);
      setQuotes(json.data.quotes);
      setConfig(json.data.config);
    } catch (err) {
      setError(err.message || 'Could not load your quotes.');
    }
  }, [authFetch]);

  const compare = useCallback(async () => {
    if (!quotes?.length) {
      setResult(null);
      return;
    }
    try {
      const json = await authFetch('/api/insurance/quotes/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      }).then((r) => r.json());
      if (!json.success) throw new Error(json.message);
      setResult(json.data);
      setError('');
    } catch (err) {
      setError(err.message || 'Could not compare your quotes.');
    }
  }, [authFetch, quotes, options]);

  useEffect(() => {
    loadQuotes();
  }, [loadQuotes]);

  useEffect(() => {
    const t = setTimeout(compare, 350);
    window.addEventListener(COMMITMENTS_CHANGED, compare);
    return () => {
      clearTimeout(t);
      window.removeEventListener(COMMITMENTS_CHANGED, compare);
    };
  }, [compare]);

  const save = async (f) => {
    setBusy(true);
    setFormError('');
    try {
      const json = await authFetch(editing.id ? `/api/insurance/quotes/${editing.id}` : '/api/insurance/quotes', {
        method: editing.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(f),
      }).then((r) => r.json());
      if (!json.success) throw new Error(json.message);
      setEditing(null);
      await loadQuotes();
    } catch (err) {
      setFormError(err.message || 'Could not save the quote.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (q) => {
    const ok = await confirm({ title: 'Remove this quote?', body: `The ${q.provider} quote will be removed from the comparison.`, action: 'Remove quote' });
    if (!ok) return;
    const json = await authFetch(`/api/insurance/quotes/${q.id}`, { method: 'DELETE' }).then((r) => r.json());
    if (!json.success) setError(json.message);
    await loadQuotes();
  };

  const open = (q) => {
    setFormError('');
    setEditing(q ? { id: q.id, ...asForm(q) } : { ...BLANK });
  };
  const full = config && quotes && quotes.length >= config.maxQuotes;
  const types = result ? PLAN_OPTIONS.map((p) => p.value).filter((t) => result.quotes.some((q) => q.plan_type === t)) : [];
  const links = config?.links || [];

  return (
    <Card
      icon={Scale}
      tone="green"
      title="Compare quotes"
      note="Quotes you got from insurers, checked against your figures"
      action={
        quotes?.length > 0 && (
          <button type="button" onClick={() => open(null)} disabled={full} className="btn btn-soft btn-sm">
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add a quote
          </button>
        )
      }
    >
      <Notice tone="danger" show={Boolean(error)}>
        {error}
      </Notice>
      {quotes === null ? (
        <Loading>Loading your quotes</Loading>
      ) : quotes.length === 0 ? (
        <Empty
          icon={Scale}
          title="No quotes yet"
          action={
            <button type="button" onClick={() => open(null)} className="btn btn-soft">
              <Plus className="w-4 h-4" aria-hidden="true" />
              Add a quote
            </button>
          }
        >
          Ask two or three insurers or takaful operators for a quote on the same kind of plan, then add them here. FinSight shows what each one
          costs you, what it covers, and what it does to your monthly budget.
        </Empty>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
            <Field label="Example hospital bill" prefix="RM" hint="Any amount, to see what each medical card leaves you to pay.">
              <MoneyInput value={options.example_bill} onChange={(e) => setOptions((o) => ({ ...o, example_bill: e.target.value }))} />
            </Field>
            <Field label="Dependants" hint="People who rely on your income, for the life-cover gap.">
              <input type="number" min="0" className="num" value={options.dependants} onChange={(e) => setOptions((o) => ({ ...o, dependants: e.target.value }))} />
            </Field>
          </div>

          {result?.highlights?.length > 0 && (
            <ul className="space-y-1.5" aria-label="What sets the quotes apart">
              {result.highlights.map((h) => (
                <li key={h.text} className="flex gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-ok" aria-hidden="true" />
                  {h.text}
                </li>
              ))}
            </ul>
          )}

          {result ? (
            types.map((t) => (
              <ComparisonTable
                key={t}
                type={t}
                rows={result.quotes.filter((q) => q.plan_type === t)}
                exampleBill={result.example_bill}
                onEdit={(q) => open(quotes.find((x) => x.id === q.id))}
                onRemove={remove}
              />
            ))
          ) : (
            <Loading>Comparing your quotes</Loading>
          )}

          {full && <p className="t-note">You can keep up to {config.maxQuotes} quotes. Remove one to add another.</p>}
          {result?.notes?.map((n) => (
            <p key={n} className="t-note">
              {n}
            </p>
          ))}
        </div>
      )}

      {links.length > 0 && (
        <div className="mt-5 pt-4 border-t border-line">
          <p className="t-label mb-1 flex items-center gap-1.5">
            Where to get a quote
            <InfoTip label="where these links go">
              Links go to each company&apos;s own website, in alphabetical order. FinSight has no arrangement with any of them and does not recommend one.
            </InfoTip>
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
            {links.map((l) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1 text-sm">
                  {l.name}
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="t-note mt-2">
            Before you choose, read each plan&apos;s Product Disclosure Sheet. The{' '}
            {config.guide && (
              <a href={config.guide.url} target="_blank" rel="noopener noreferrer" className="link">
                Financial Education Network guide
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}{' '}
            explains what to check, and{' '}
            {config.licensedList && (
              <a href={config.licensedList.url} target="_blank" rel="noopener noreferrer" className="link">
                Bank Negara&apos;s list
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}{' '}
            shows which companies are licensed.
          </p>
        </div>
      )}

      {editing && <QuoteForm initial={editing} onSave={save} onClose={() => setEditing(null)} busy={busy} error={formError} />}
    </Card>
  );
}
