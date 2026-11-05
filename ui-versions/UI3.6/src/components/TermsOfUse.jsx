import React from 'react';
import { Modal } from './ui/Modal';
import { SITE } from '../lib/site';

/**
 * Terms of use in plain words. Each point must stay true to the app: no advice licence, estimates
 * only, statements read then deleted, the advisor's figures sent to an AI provider, free and as is.
 */
export const TERMS = [
  {
    title: 'What FinSight is',
    text: `FinSight AI is a free personal finance tool built by ${SITE.operator} as a final-year project. It helps you see your spending, check whether a loan or goal fits your budget and understand your insurance risk.`,
  },
  {
    title: 'Not financial advice',
    text: 'FinSight is not a licensed financial adviser, financial planner, bank or insurer. Its figures, scores, forecasts and the AI advisor\'s replies are estimates from your own data and public sources, for general guidance only. Banks, takaful operators and insurers use their own criteria. Before a big decision, check with the provider or a licensed adviser.',
  },
  {
    title: 'Who can use it',
    text: 'You must be 18 or older. Use only your own statements and figures, or ones you have permission to use.',
  },
  {
    title: 'Your account',
    text: 'Keep your password to yourself. You can download your data or delete your account at any time from the account menu. An account may be removed if it is used to attack or overload the service.',
  },
  {
    title: 'Fair use',
    text: 'Do not try to break into the service, read other people\'s data or flood it with requests. The AI advisor has a daily question limit so it stays available for everyone.',
  },
  {
    title: 'No guarantee',
    text: 'FinSight is provided as it is, without a guarantee that it is always available or free of mistakes. Data may be lost if something goes wrong, so keep your own copies of your statements. FinSight is not responsible for decisions you make with it.',
  },
  {
    title: 'Changes',
    text: 'These terms and the privacy notice may change as the project develops. The date below shows the latest version.',
  },
];

export function TermsList({ className = '' }) {
  return (
    <dl className={`space-y-2.5 ${className}`}>
      {TERMS.map((t) => (
        <div key={t.title}>
          <dt className="text-sm font-semibold text-ink">{t.title}</dt>
          <dd className="t-note">{t.text}</dd>
        </div>
      ))}
      <p className="t-note pt-1">
        Last updated {SITE.termsUpdated}.{SITE.contactEmail && ` Questions: ${SITE.contactEmail}.`}
      </p>
    </dl>
  );
}

export default function TermsModal({ onClose }) {
  return (
    <Modal title="Terms of use" description="The short version of the rules for using FinSight." onClose={onClose} width="max-w-lg">
      <TermsList />
      <div className="flex justify-end mt-4">
        <button type="button" onClick={onClose} className="btn btn-primary">
          Close
        </button>
      </div>
    </Modal>
  );
}
