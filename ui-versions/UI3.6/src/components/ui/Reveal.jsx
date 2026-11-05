import React from 'react';
import { m } from 'motion/react';
import { rise, stagger } from '../../lib/motion';

/** A short rise when a page opens. Children marked <RevealItem> follow one after another. */
export function Reveal({ children, className = '', delay = 0, gap = 0.05, as = 'div' }) {
  const Tag = m[as];
  return (
    <Tag className={className} variants={stagger(gap, delay)} initial="hidden" animate="show">
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
