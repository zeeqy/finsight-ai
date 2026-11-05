import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarCheck, Info } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Card from '../ui/Card';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ICON = {
  ok: [ArrowDownRight, 'text-ok'],
  warn: [ArrowUpRight, 'text-warn'],
  info: [Info, 'text-ink-3'],
};

/**
 * The month on screen against the month before: spending, the categories that moved most, money in
 * and unusual payments, as sentences built on the server from the numbers.
 */
export default function MonthlyReview({ year, month, refreshKey }) {
  const { authFetch } = useAuth();
  const [review, setReview] = useState(null);

  useEffect(() => {
    let live = true;
    authFetch(`/api/transactions/review?year=${year}&month=${month}`)
      .then((r) => r.json())
      .then((json) => live && setReview(json.success ? json.data : null))
      .catch(() => live && setReview(null));
    return () => {
      live = false;
    };
  }, [authFetch, year, month, refreshKey]);

  if (!review || review.year !== year || review.month !== month || !review.points.length) return null;
  const note = review.previous ? `${MONTHS[month - 1]} against ${MONTHS[review.previous.month - 1]}` : `${MONTHS[month - 1]}, your first month`;
  return (
    <Card icon={CalendarCheck} tone="purple" title="Month in review" note={note}>
      <ul className="space-y-2">
        {review.points.map((p) => {
          const [Icon, colour] = p.text.includes('unusually large') ? [AlertTriangle, 'text-warn'] : ICON[p.tone] || ICON.info;
          return (
            <li key={p.text} className="flex gap-2.5 text-sm">
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${colour}`} aria-hidden="true" />
              <span>{p.text}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
