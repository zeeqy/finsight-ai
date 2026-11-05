import React from 'react';
import { m } from 'motion/react';
import { EASE, rise, stagger } from '../../lib/motion';

/** Rises into place the first time it scrolls into view. Children marked <RevealItem> stagger. */
export function Reveal({ children, className = '', delay = 0, gap = 0.07, as = 'div' }) {
  const Tag = m[as];
  return (
    <Tag
      className={className}
      variants={stagger(gap, delay)}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
    >
      {children}
    </Tag>
  );
}

export function RevealItem({ children, className = '', as = 'div' }) {
  const Tag = m[as];
  return (
    <Tag className={className} variants={rise}>
      {children}
    </Tag>
  );
}

/** A headline whose words rise out of a mask one after another. */
export function Words({ text, className = '', delay = 0 }) {
  const words = text.split(' ');
  return (
    <span className={className} aria-label={text} role="text">
      {words.map((word, i) => (
        <span key={`${word}-${i}`} aria-hidden="true" className="inline-block overflow-hidden align-bottom pb-[0.08em] -mb-[0.08em]">
          <m.span
            className="inline-block"
            initial={{ y: '105%' }}
            animate={{ y: 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: delay + i * 0.05 }}
          >
            {word}
            {i < words.length - 1 ? ' ' : ''}
          </m.span>
        </span>
      ))}
    </span>
  );
}
