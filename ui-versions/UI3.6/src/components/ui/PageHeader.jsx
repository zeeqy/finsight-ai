import React from 'react';
import { Band, MODULE_MOTIF } from './Guilloche';
import { moduleById } from '../../lib/modules';

/**
 * Top of every module page. The name matches the sidebar and the line under it says what the
 * page is for, so a new user always knows where they are. `children` are the page's main actions.
 * Behind it sits the module's own engraved line drawing; `energy` (0 to 1) lets the page's figures move it.
 */
export default function PageHeader({ module, energy = 0.5, children }) {
  const { label, description, icon: Icon, tone } = moduleById(module);
  const motif = MODULE_MOTIF[module];
  return (
    <div className="relative overflow-hidden">
      {motif && (
        <Band
          motif={motif}
          energy={energy}
          className="absolute inset-y-0 right-0 w-full md:w-[72%] h-full [--guilloche:var(--guilloche-soft)] [mask-image:linear-gradient(to_right,transparent_12%,black_50%)] opacity-40 md:opacity-100"
        />
      )}
      <header className="page relative flex pt-7 md:pt-11 pb-7 md:pb-11 flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <span className={`chip chip-lg tone-${tone} !bg-[var(--tone)] !text-[var(--on-tone)]`}>
            <Icon className="w-6 h-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="t-page">{label}</h1>
            <p className="text-ink-2 mt-1 max-w-[44ch]">{description}</p>
          </div>
        </div>
        {children && <div className="flex flex-wrap items-center gap-2 shrink-0">{children}</div>}
      </header>
    </div>
  );
}
