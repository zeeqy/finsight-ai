import React from 'react';

/**
 * What FinSight keeps and where it goes, in plain words. Shown on the register page and in the
 * "Your data" dialog. Each point must stay true to the code (see server/src/services/accountData.js).
 */
export const PRIVACY_POINTS = [
  {
    title: 'What is kept',
    text: 'Your name, email, income and age; the transactions read from the statements you upload (date, description, amount, category); and the budgets, goals, commitments, checks and advisor chats you create.',
  },
  {
    title: 'Statement files and passwords',
    text: 'An uploaded file is read for its transactions and then deleted from the server. A PDF password is used once to open the file and is never saved. FinSight never asks for your online banking login.',
  },
  {
    title: 'The AI advisor',
    text: 'When you ask the advisor a question, your question and a summary of your figures (such as spending, goals, debts and your latest checks) are sent to the AI provider shown in the chat, Google Gemini or OpenAI, to write the reply.',
  },
  {
    title: 'Your password',
    text: 'Stored only as a one-way hash, so nobody can read it back.',
  },
  {
    title: 'Your control',
    text: 'From the account menu you can download everything stored about you, or delete your account and all of its data. Personal Data Protection Act 2010 (Malaysia).',
  },
];

export default function PrivacyNotice({ className = '' }) {
  return (
    <dl className={`space-y-2.5 ${className}`}>
      {PRIVACY_POINTS.map((p) => (
        <div key={p.title}>
          <dt className="text-sm font-semibold text-ink">{p.title}</dt>
          <dd className="t-note">{p.text}</dd>
        </div>
      ))}
    </dl>
  );
}
