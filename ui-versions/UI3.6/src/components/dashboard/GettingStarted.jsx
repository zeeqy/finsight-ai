import React from 'react';
import { Download, MessagesSquare, Target, UploadCloud, Wallet } from 'lucide-react';
import Card from '../ui/Card';
import { useGoTo } from '../../context/NavContext';
import { downloadSampleCsv } from './dashboardUtils';

/** First screen of a new account: the order to use the app in, with the button for each step. */
export default function GettingStarted({ onUpload, onAddBudget }) {
  const goTo = useGoTo();

  const steps = [
    {
      title: 'Upload a bank statement',
      text: 'Use the PDF e-statement your bank emails you, or a CSV export. FinSight sorts each transaction into a category.',
      tone: 'blue',
      icon: UploadCloud,
      action: (
        <button type="button" onClick={onUpload} className="btn btn-primary btn-sm">
          Upload statement
        </button>
      ),
    },
    {
      title: 'Set a budget',
      text: 'Pick a monthly limit for a category and watch how close you get.',
      tone: 'green',
      icon: Wallet,
      action: (
        <button type="button" onClick={onAddBudget} className="btn btn-quiet btn-sm">
          Add a budget
        </button>
      ),
    },
    {
      title: 'Ask the advisor',
      text: 'Once your spending is in, the advisor can answer questions using your own numbers.',
      tone: 'purple',
      icon: MessagesSquare,
      action: (
        <button type="button" onClick={() => goTo('advisor')} className="btn btn-quiet btn-sm">
          Open the advisor
        </button>
      ),
    },
    {
      title: 'Plan what comes next',
      text: 'Check a loan before you apply, or start saving for a life goal.',
      tone: 'orange',
      icon: Target,
      action: (
        <button type="button" onClick={() => goTo('goals')} className="btn btn-quiet btn-sm">
          Plan a goal
        </button>
      ),
    },
  ];

  return (
    <Card
      title="Start here"
      note="Four steps to get the most out of FinSight AI"
      action={
        <button type="button" onClick={downloadSampleCsv} className="btn btn-soft btn-sm">
          <Download className="w-4 h-4" aria-hidden="true" />
          <span className="hidden sm:inline">No statement? Get a sample CSV</span>
          <span className="sm:hidden">Sample CSV</span>
        </button>
      }
    >
      <ol className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mt-1">
        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <li key={step.title} className="rounded-xl border border-line p-4 flex flex-col">
              <div className="flex items-center gap-2.5">
                <span className={`chip tone-${step.tone}`}>
                  <Icon className="w-[1.125rem] h-[1.125rem]" aria-hidden="true" />
                </span>
                <span className="t-note font-semibold">Step {i + 1}</span>
              </div>
              <p className="font-display font-semibold mt-2.5">{step.title}</p>
              <p className="t-note mt-1 flex-1">{step.text}</p>
              <div className="mt-3">{step.action}</div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
