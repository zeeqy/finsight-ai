import React, { useId } from 'react';

/**
 * A titled group of content. `icon` and `tone` (accent, blue, purple, green, orange, pink, gold,
 * danger) colour the small chip that tells sections apart. `action` sits top right. `flush` drops
 * the body padding for tables.
 */
export default function Card({ icon: Icon, tone = 'accent', title, note, action, flush = false, className = '', children }) {
  const id = useId();
  return (
    <section aria-labelledby={title ? id : undefined} className={`card min-w-0 ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-4 sm:pt-5">
          <div className="flex items-center gap-3 min-w-0">
            {Icon && (
              <span className={`chip tone-${tone}`}>
                <Icon className="w-[1.125rem] h-[1.125rem]" aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0">
              <h2 id={id} className="t-section">
                {title}
              </h2>
              {note && <p className="t-note">{note}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={flush ? 'mt-3' : `px-4 sm:px-5 pb-4 sm:pb-5 ${title ? 'pt-3' : 'pt-4 sm:pt-5'}`}>{children}</div>
    </section>
  );
}
