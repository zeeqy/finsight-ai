import React from 'react';
import { m } from 'motion/react';
import { Band } from './Guilloche';
import { Words } from './Reveal';
import { EASE } from '../../lib/motion';

/**
 * Top of every module page: the module name and one sentence that states the answer the page
 * gives, with real numbers where they exist. `title` is a string (words rise in) or nodes such
 * as <Money/>. `energy` (0 to 1) sets the swell of the engraved band.
 */
export default function PageHero({ module, title, lead, energy = 0.45, children }) {
  return (
    <section className="relative overflow-hidden">
      <Band
        energy={energy}
        className="absolute inset-y-0 right-0 w-full md:w-[72%] h-full [mask-image:linear-gradient(to_right,transparent,black_38%)] opacity-60 md:opacity-100"
      />
      <div className="page relative pt-8 md:pt-14 pb-7 md:pb-10">
        <p className="t-label text-jade mb-3">{module}</p>
        <h1 className="t-display max-w-[17ch] md:max-w-[20ch]">
          {typeof title === 'string' ? (
            <Words text={title} />
          ) : (
            <m.span
              className="block"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE }}
            >
              {title}
            </m.span>
          )}
        </h1>
        {lead && (
          <m.p
            className="mt-4 max-w-[58ch] text-ink-2 md:text-base"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.25 }}
          >
            {lead}
          </m.p>
        )}
        {children && (
          <m.div
            className="mt-6"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.3 }}
          >
            {children}
          </m.div>
        )}
      </div>
    </section>
  );
}
