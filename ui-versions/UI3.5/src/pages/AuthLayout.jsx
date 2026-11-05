import React from 'react';
import { m } from 'motion/react';
import { Rosette } from '../components/ui/Guilloche';
import Logo from '../components/ui/Logo';
import { ThemeToggle } from '../components/ThemeSwitch';
import { MODULES } from '../lib/modules';
import { EASE } from '../lib/motion';

/** Sign-in and register share this screen: what the app does on yellow, the form on white. */
export default function AuthLayout({ headline, lead, children }) {
  return (
    <div className="min-h-dvh grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="relative overflow-hidden bg-gold text-on-gold on-gold flex flex-col p-5 sm:p-8 lg:p-12">
        <div className="absolute inset-0 md:-right-1/3 md:left-1/4">
          <Rosette className="w-full h-full opacity-25 md:opacity-40" />
        </div>
        {/* Intelligent Oyen says hello (a still render; the 3D Oyen lives on Home) */}
        <img
          src="/mascot/oyen-wave.webp"
          alt=""
          width="360"
          height="760"
          loading="lazy"
          decoding="async"
          className="hidden lg:block absolute right-6 xl:right-12 bottom-0 h-[58%] w-auto float-soft drop-shadow-[0_18px_24px_rgb(22_34_74/0.25)] pointer-events-none"
        />
        <div className="relative">
          <Logo />
        </div>
        <div className="relative md:flex-1 flex flex-col justify-center mt-6 md:mt-0">
          <h1 className="t-display max-w-[14ch]">{headline}</h1>
          <p className="mt-3 md:mt-4 max-w-[42ch] text-base md:text-lg font-medium">{lead}</p>
          <ul className="hidden md:block mt-7 space-y-2.5">
            {MODULES.map((item, i) => {
              const Icon = item.icon;
              return (
                <m.li
                  key={item.id}
                  className="flex items-center gap-3"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, ease: EASE, delay: 0.15 + i * 0.06 }}
                >
                  <span className={`chip tone-${item.tone} !bg-surface`}>
                    <Icon className="w-[1.125rem] h-[1.125rem]" aria-hidden="true" />
                  </span>
                  <span className="font-semibold">
                    {item.label}
                    <span className="block text-sm font-normal text-ink-2 leading-tight">{item.hint}</span>
                  </span>
                </m.li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="relative bg-surface flex flex-col">
        <ThemeToggle className="absolute top-3 right-3" />
        <div className="flex-1 flex items-center justify-center p-5 sm:p-8">
          <div className="w-full max-w-sm">
            {children}
          </div>
        </div>
        <p className="px-5 sm:px-8 pb-4 t-note text-center">FinSight AI – An AI-Powered Personalised Financial Management Web Application</p>
      </div>
    </div>
  );
}
