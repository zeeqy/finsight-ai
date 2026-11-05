import React from 'react';
import { m } from 'motion/react';
import { Rosette } from '../components/ui/Guilloche';
import { Words } from '../components/ui/Reveal';
import Logo from '../components/ui/Logo';
import { EASE } from '../lib/motion';

/** Sign-in and register share this screen: the rosette and headline on the left, the form lifted on the right. */
export default function AuthLayout({ headline, lead, children }) {
  return (
    <div className="relative min-h-dvh overflow-hidden flex flex-col">
      <div className="absolute inset-0 md:left-[-14%] md:right-[22%]">
        <Rosette className="w-full h-full opacity-50 md:opacity-100" />
      </div>

      <div className="page relative z-10 pt-5">
        <Logo />
      </div>

      <div className="page relative z-10 flex-1 grid md:grid-cols-[minmax(0,1fr)_25rem] gap-8 lg:gap-16 items-center py-8">
        <div className="min-w-0">
          <h1 className="t-display max-w-[14ch]">
            <Words text={headline} delay={0.1} />
          </h1>
          <m.p
            className="mt-5 max-w-[42ch] text-ink-2 text-base md:text-lg font-medium [text-shadow:0_0_10px_var(--paper),0_0_4px_var(--paper)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.5 }}
          >
            {lead}
          </m.p>
        </div>

        <m.div
          className="sheet-lift p-6 sm:p-7"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE, delay: 0.25 }}
        >
          {children}
        </m.div>
      </div>

      <p className="page relative z-10 pb-4 t-note max-w-none">
        FinSight AI – An AI-Powered Personalised Financial Management Web Application
      </p>
    </div>
  );
}
