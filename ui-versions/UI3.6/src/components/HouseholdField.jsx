import React from 'react';
import { Field, InfoTip } from './ui/Controls';

// What each household's figure means, in plain words (figures from server/src/data/referenceBudgets.js)
const MEANING = {
  single: 'one adult living alone and getting around by bus, LRT or MRT',
  single_car: 'one adult living alone who owns and runs a car (petrol, tolls, parking, insurance and road tax included)',
  couple_two_children: 'a married couple and their two children together',
};

/**
 * "Your household" select with an explanation of the RM figure in brackets: EPF's Belanjawanku
 * reference budget, a reasonable minimum to live on in the Klang Valley. Used in the profile dialog
 * and on the Health Check page.
 */
export default function HouseholdField({ households, value, onChange }) {
  const chosen = households?.[value];
  return (
    <div>
      <div className="flex items-center gap-1 mb-1.5">
        {/* Visible label; the select's own label (screen readers) is the hidden one below */}
        <span className="t-label" aria-hidden="true">
          Your household
        </span>
        <InfoTip label="what the household amounts mean">
          The amount in brackets is EPF&apos;s Belanjawanku 2024/2025 budget for the Klang Valley: what that household needs each month for a
          reasonable standard of living, such as food, rent, transport, bills, healthcare and a little for social life and savings. It is a
          monthly figure, not a salary target. FinSight checks that what you have left after your loan repayments still covers it.
        </InfoTip>
      </div>
      <Field label="Your household" className="[&>label]:sr-only">
        <select value={value} onChange={onChange}>
          <option value="">Not set</option>
          {Object.entries(households || {}).map(([key, h]) => (
            <option key={key} value={key}>
              {h.label} (RM {h.monthly.toLocaleString('en-MY')} a month)
            </option>
          ))}
        </select>
      </Field>
      <p className="t-note mt-1.5">
        {chosen ? (
          <>
            RM {chosen.monthly.toLocaleString('en-MY')} a month is EPF&apos;s estimate for {MEANING[value] || chosen.label.toLowerCase()} in the
            Klang Valley.
            {value === 'couple_two_children' && ' Only the income on your profile is counted, so if your spouse also earns, the check is stricter than your real household.'}
          </>
        ) : (
          'Pick the closest one. It sets the minimum you should still have to live on after loan repayments (EPF Belanjawanku 2024/2025, Klang Valley).'
        )}
      </p>
    </div>
  );
}
