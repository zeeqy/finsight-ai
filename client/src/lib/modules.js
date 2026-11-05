import { Gauge, HeartPulse, House, Landmark, MessagesSquare, ReceiptText, Target } from 'lucide-react';

/**
 * The five modules plus the Health Check, which joins them: one source for the sidebar, page
 * headers and the sign-in screen.
 */
export const MODULES = [
  {
    id: 'dashboard',
    label: 'Spend Analyser',
    short: 'Spending',
    hint: 'See where your money goes',
    description: 'Upload a bank statement to see where your money goes, set budgets and spot unusual spending.',
    icon: ReceiptText,
    tone: 'blue',
  },
  {
    id: 'advisor',
    label: 'AI Financial Advisor',
    short: 'Advisor',
    hint: 'Ask Intelligent Oyen',
    description: 'Ask Intelligent Oyen anything about your money. Oyen reads your real spending, goals and latest checks.',
    icon: MessagesSquare,
    tone: 'purple',
  },
  {
    id: 'loan',
    label: 'Loan Default Predictor',
    short: 'Loans',
    hint: 'Check if a loan is affordable',
    description: 'Enter a loan to see the instalment, whether it fits your budget and goals, and how risky it is. Plan how to clear the debts you already have.',
    icon: Landmark,
    tone: 'green',
  },
  {
    id: 'goals',
    label: 'Life Goals Planner',
    short: 'Goals',
    hint: 'Kahwin, children, Haji, house, car',
    description: 'Plan your savings for kahwin, children, Haji, a house or a car, and see if each goal fits your budget.',
    icon: Target,
    tone: 'orange',
  },
  {
    id: 'insurance',
    label: 'Insurance Risk Predictor',
    short: 'Insurance',
    hint: 'See what affects your risk',
    description: 'See your health-cost risk and what would lower it, and how well your savings and cover would protect you and your family.',
    icon: HeartPulse,
    tone: 'pink',
  },
  {
    id: 'health',
    label: 'Health Check',
    short: 'Health',
    hint: 'Can I afford this?',
    description: 'Your money in one score, built from every module, and what a loan or big purchase would do to it before you commit.',
    icon: Gauge,
    tone: 'teal',
  },
];

/** Home: the greeting, the month at a glance and Oyen. First in the navigation, not a module. */
export const HOME = {
  id: 'home',
  label: 'Home',
  short: 'Home',
  hint: 'Your month at a glance',
  description: 'Your month at a glance, and what to do next.',
  icon: House,
  tone: 'gold',
};

/** Sidebar and phone bar: Home, then the modules */
export const NAV = [HOME, ...MODULES];

export const moduleById = (id) => NAV.find((item) => item.id === id);
