# FinSight AI design system

**Design read:** a personal finance app for Malaysians aged 18 to 40, in a banknote-engraving style. Dials: energy 2, rhythm 3, motion 3.

**Identity:** fine guilloche lines, the security printing on banknotes, drawn live on canvas. A verdict lands like a bank's rubber stamp. Amounts roll like a counter. Each comes from the world of money, not from a template.

## Rules

1. **Tokens only.** No hex values, no `slate/gray/rose/emerald/amber` Tailwind colours, no `#FFC80A` in JSX. Use `bg-paper`, `bg-paper-2`, `bg-surface`, `text-ink`, `text-ink-2`, `text-ink-3`, `border-line`, `border-line-strong`, `text-jade`, `bg-jade`, `bg-jade-wash`, `bg-gold`, `bg-gold-wash`, `text-danger`, `bg-danger-wash`, `text-warn`, `bg-warn-wash`. Inline SVG or Recharts colours use `var(--name)` or `CHART` from `components/ui/chartTheme.js`. This is what makes a dark theme a small job later.
2. **Colour jobs.** Gold (`btn-primary`) is the page's main action, and only that. Jade means brand, selection and good. Danger means bad or destructive. Warn means caution. Colour never carries meaning alone: pair it with a word or icon.
3. **No card grids.** Content sits on the paper, separated by whitespace and `.rule` lines. `.sheet` (flat white, for tables or a form) is used sparingly. `.sheet-lift` goes on at most one element per screen, usually the main result or form. Vary layout between sections; asymmetric columns (`lg:grid-cols-12` with 7/5 or 5/7 splits) are the default.
4. **The page answers a question.** The `PageHero` title is a sentence stating the answer, with real numbers where they exist, and a clear invitation where they do not. No four-equal-stat-card rows: fold figures into the sentence, and pick the one or two that matter.
5. **Type.** `.t-display` page headline. `.t-section` section heading (`<h2>`), written as the question that section answers when that reads naturally. `.t-figure` big numbers. `.t-label` field labels. `.t-note` small supporting text. Body is 15px; do not use `text-xs` or `text-[10px]` for reading text. No `uppercase`, no `tracking-wider`, no monospace. Numbers in text and tables get `.num`.
6. **Radius.** Controls use `rounded-control`, big surfaces `rounded-panel`, only `.btn-primary` is a pill.
7. **No decoration without a job.** No gradients, glows, coloured shadows, blurred blobs, icon-in-a-tinted-square, badges saying "Module 3", arrows on buttons, emoji, or status dots with no real state. If an icon adds nothing, drop it.
8. **Copy.** Sentence case. Plain words from the user's side ("Check this loan", not "Submit" or "Get Started"). No em dashes. No "seamless", "powerful", "intelligent", "unlock", "AI-powered". Errors say what happened and what to do. Empty states say why and give the one action. Don't invent facts or figures. Keep every number, limitation, disclaimer and model-card fact that is already on the page.
9. **Accessibility.** Every control is a real `<button>` or `<a>` with a visible label (`Field` handles this) or `aria-label`; icons get `aria-hidden="true"`. 44px targets (`.btn` does this). Keyboard works. Nothing appears on hover only.
10. **Responsive.** Must work from 360px up with no horizontal page scroll. Grids collapse to one column; wide tables go in `overflow-x-auto` or drop secondary columns. Use `min-w-0` on grid children.

## Components (`client/src/components/ui/`)

| Import | Use |
|---|---|
| `PageHero` (default, `PageHero.jsx`) | `module`, `title` (string or nodes), `lead`, `energy` 0 to 1, `children` for the page's controls |
| `Money`, `RollingText` (`RollingNumber.jsx`) | Any headline amount or percentage. Rolls on mount and on change. Not for table rows. |
| `Reveal`, `RevealItem`, `Words` (`Reveal.jsx`) | Scroll-triggered rise with stagger. Wrap sections, not single lines. |
| `Stamp` (`Stamp.jsx`) | `label`, `note`, `tone` ok/warn/danger. The verdict. One per screen. |
| `Field`, `Segmented`, `Meter`, `Notice`, `Loading`, `Empty` (`Controls.jsx`) | Form field, sliding choice, animated bar, sliding status message, loading text, empty state |
| `Modal`, `useConfirm` (`Modal.jsx`) | Dialog. `await confirm({ title, body, action })` replaces `window.confirm`. |
| `CHART`, `kFormat` (`chartTheme.js`) | Recharts axis, grid, tooltip, legend and animation props |

CSS classes: `.page` (page width and gutters), `.btn` with `.btn-primary`, `.btn-jade`, `.btn-quiet`, `.btn-danger`, `.btn-danger-quiet`, `.btn-icon`, `.btn-sm`; `.field`; `.link`; `.tag` with `.tag-ok`, `.tag-warn`, `.tag-danger`, `.tag-plain`.

## Motion

`LazyMotion strict` wraps the app, so import `m` (never `motion`) from `motion/react`. Timings come from `lib/motion.js` (`EASE`, `SPRING`, `rise`, `stagger`). `prefers-reduced-motion` is honoured globally.

- Nothing loops without a user trigger, except the sign-in rosette, which has a pause button.
- Entrances answer the page opening or scrolling. Layout changes answer an action: results slide open, options slide with a `layoutId` pill, removed items collapse with `AnimatePresence`.
- One big moment per screen: the rolling headline, or a stamp landing. Everything else stays calm.
- Spinners only for real waits, with text saying what is happening.

The Spend Analyser (`pages/DashboardPage.jsx` and `components/dashboard/`) is the reference implementation.
