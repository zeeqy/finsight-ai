# FinSight AI design system (UI3)

**Design read:** a personal finance app for Malaysians aged 18 to 40 who may be using one for the first time. Yellow, friendly and easy to find your way around. Dials: energy 2, rhythm 2, motion 2.

**The rule above all others: a new user must always know where they are, what this page does and what to press next.** If something looks good but makes that harder, drop it.

Earlier looks are saved in `ui-versions/` (UI1 dark, UI2 light jade with a top bar). UI2 felt uneasy because page titles changed with the data, nothing was grouped, content faded in during scrolling and the navigation stopped explaining itself. Do not bring those back.

## Rules

1. **Tokens only.** No hex values and no `slate/gray/rose/emerald/amber` Tailwind colours. Use `bg-paper`, `bg-paper-2`, `bg-surface`, `text-ink`, `text-ink-2`, `text-ink-3`, `border-line`, `border-line-strong`, `bg-gold`, `text-accent`, `bg-accent`, `bg-accent-wash`, `text-ok`, `bg-ok-wash`, `text-danger`, `bg-danger-wash`, `text-warn`, `bg-warn-wash`. Inline SVG or Recharts colours use `var(--name)` or `CHART` from `components/ui/chartTheme.js`. This keeps a dark theme a small job.
2. **Yellow is the theme, colour is for little things.** Yellow is the sidebar, the page tint, the main button and the one leading figure on a page (`.card-gold`). Everything else is white cards on pale yellow. Colour then appears only on small things: icon chips, tags, buttons, chart marks and selected states. Never tint a whole card with a module colour, and no gradients.
3. **Colour jobs.**
   - `accent` is the current module's colour (Spending blue, Advisor purple, Loan green, Goals orange, Insurance pink, Health Check teal). It is set automatically from `data-module` on the root, including inside dialogs. Use it for selection, secondary buttons, links and focus.
   - `ok`, `warn`, `danger` carry meaning and never change between modules. Good results use `ok`, never `accent`. Colour never carries meaning alone: pair it with a word or icon.
   - Chip tones (`tone-blue`, `tone-purple`, `tone-green`, `tone-orange`, `tone-pink`, `tone-gold`, `tone-danger`, `tone-accent`) tell sections apart. Give neighbouring cards on a page different tones, chosen for meaning where possible.
4. **Buttons.** One `btn-primary` (yellow) per view for the main action. `btn-accent` to confirm or go forward in a form or dialog. `btn-soft` for a section's own action such as "Add budget". `btn-quiet` for neutral actions. `btn-danger` and `btn-danger-quiet` for destructive ones. Every button says what happens.
5. **Everything lives in a card.** Group related content with `Card` (or `.card`). Layout is a consistent grid with `gap-4` and `space-y-4`, not whitespace and rules. Tools with a form use the same shape everywhere: form card on the left (`xl:col-span-5`), results on the right (`xl:col-span-7`), with an inviting empty state in the results until something is calculated.
6. **Fixed names.** `PageHeader` shows the module's fixed name and a plain sentence from `lib/modules.js`. Never put changing data in the title. Results and data go into cards below. Section titles are short nouns ("Monthly trend", "Budgets"), not questions.
7. **Say what to do next.** Each page must work for someone who has never seen it: empty states explain why and give the one action, forms have clear labels and hints, and multi-step flows number their steps. If two modules are linked, offer the link with `useGoTo()` from `context/NavContext`.
8. **Type.** `.t-page` page name (only in PageHeader). `.t-section` card titles. `.t-figure` big numbers. `.t-label` field labels. `.t-note` small supporting text. Body is 15px; do not use `text-xs` or `text-[10px]` for reading text. No `uppercase`, no `tracking-wider`, no monospace. Numbers in text and tables get `.num`.
9. **Radius.** Controls use `rounded-control`, cards `rounded-panel`, inner boxes `rounded-xl`.
10. **Copy.** Sentence case. Plain words from the user's side ("Check this loan", not "Submit"). No em dashes. No "seamless", "powerful", "intelligent", "unlock". Errors say what happened and what to do. Don't invent facts or figures. Keep every number, limitation, disclaimer and model-card fact that is already on the page.
11. **Accessibility.** Every control is a real `<button>` or `<a>` with a visible label (`Field` handles this) or `aria-label`; icons get `aria-hidden="true"`. 44px targets (`.btn` does this; `.btn-sm` is for secondary actions). Keyboard works. Nothing appears on hover only.
12. **Responsive.** Must work from 360px up with no horizontal page scroll. The sidebar becomes an icon rail below 1024px and a bottom bar below 768px. Grids collapse to one column; wide tables go in `overflow-x-auto` or drop secondary columns. Use `min-w-0` on grid children.

## Components (`client/src/components/ui/`)

| Import | Use |
|---|---|
| `PageHeader` (default, `PageHeader.jsx`) | `module` is the id from `lib/modules.js`; `children` are the page's main actions. Inside it, `.page` is applied. `energy` (0 to 1) adds the engraved band and a taller header: Spend Analyser only, where it follows the share of income spent. |
| `Card` (default, `Card.jsx`) | `icon`, `tone`, `title`, `note`, `action`, `flush` (no body padding, for tables), `className`. Without `title` it is a plain card with padding. |
| `Money`, `RollingText` (`RollingNumber.jsx`) | Headline amounts and percentages. Rolls on mount and on change. Not for table rows. |
| `Reveal`, `RevealItem` (`Reveal.jsx`) | Short rise when a page opens. Only for a row of cards or a results block, never for reading text. |
| `Stamp` (`Stamp.jsx`) | `label`, `note`, `tone` ok/warn/danger. The verdict. One per screen. |
| `Field`, `Segmented`, `Meter`, `Notice`, `Loading`, `Empty` (`Controls.jsx`) | Form field, sliding choice, animated bar, sliding status message, loading text, empty state |
| `MoneyInput` (`Controls.jsx`) | Every ringgit field. Digits and one dot with up to 2 decimals, decimal keypad on phones, shows `1,234.50` when not being edited and selects the amount on focus. `onChange` gets `{ target: { name, value } }` with the plain number text. Rates, years, ages and counts stay `type="number"` with a `step` that allows decimals where they make sense. |
| `parseDay` (`lib/dates.js`) | Calendar dates from the API are `YYYY-MM-DD` text; read them with `parseDay`, never `new Date('2026-10-01')` (that is UTC midnight). |
| `InfoTip` (`Controls.jsx`) | Small "i" button that explains a figure or feature. `label` finishes "About ...". Opens on tap, click, Enter or hover, so it is never hover only, and shifts sideways to stay on screen. Use it for "how was this worked out", not for anything the user must read to proceed. |
| `ForecastCard`, `RecurringCard` (`components/dashboard/SpendingInsights.jsx`) | Next month's estimate with its range and the share already committed; recurring payments with confirm and hide. Both explain their method in an `InfoTip`. |
| `AffordabilityCard`, `DebtPlannerCard` (`components/loan/`) | Loan page: the decision simulator's verdict and reasons for this loan; avalanche vs snowball over saved debts. |
| `ZakatCard` (`components/goals/`), `ProtectionCard` (`components/insurance/`) | Zakat on savings and income; emergency cover and life-cover gap. |
| `QuoteCompareCard` (`components/insurance/`) | Quotes the user got from insurers or takaful operators: one table per plan type (quotes as columns, row labels pinned while it scrolls sideways), plain highlights that never name a "best" insurer, and links to each company's site in alphabetical order. FinSight never shows its own prices. |
| `DepositSuggestions` (`components/goals/`) | Transfers to Tabung Haji or ASNB found in statements, offered to the goal saved there. Hidden when there is nothing to ask. |
| `MonthlyReview` (`components/dashboard/`) | The month on screen against the month before, as sentences from the server. Hidden when there is nothing to say. |
| `AccountDataModal`, `PrivacyNotice` (`components/`) | "Your data and privacy" from the account menu: what is kept, download everything, delete the account (password confirmed). `PrivacyNotice` is also on the register page. Keep every sentence true to the code. |
| `pages/HealthPage.jsx` | Health Check: index card (gold, the page's leading figure), "Your figures", "Can I afford this?" simulator. Its one `Stamp` is the simulator verdict; keep stamp notes to two or three words and put explanations beside the stamp, because the stamp does not wrap. |
| `UploadModal` (`components/dashboard/DashboardModals.jsx`) | Statement upload. A PDF goes through a password step if locked, then a preview (checks as ticked or warning lines, first rows; on phones the date sits under the description) with "Import N transactions". CSV/XLSX import straight away. After an import the dashboard opens on the month the statement covers. |
| `CommitmentsModal` (`components/CommitmentsModal.jsx`) | The user's saved monthly commitments. After a change it fires `COMMITMENTS_CHANGED` on `window`; pages that show a surplus or DSR listen and reload. |
| `Modal`, `useConfirm` (`Modal.jsx`) | Dialog. `await confirm({ title, body, action })` replaces `window.confirm`. |
| `CHART`, `kFormat` (`chartTheme.js`) | Recharts axis, grid, tooltip, legend and animation props. `CHART.accent`, `.ok`, `.gold`, `.blue`, `.danger`, `.muted`. |

CSS classes: `.page` (page width and gutters), `.card`, `.card-gold`, `.chip` + `.tone-*` (`.chip-lg`), `.btn` with `.btn-primary`, `.btn-accent`, `.btn-soft`, `.btn-quiet`, `.btn-danger`, `.btn-danger-quiet`, `.btn-icon`, `.btn-sm`; `.field`; `.link`; `.tag` with `.tag-ok`, `.tag-warn`, `.tag-danger`, `.tag-plain`.

## Motion

`LazyMotion strict` wraps the app, so import `m` (never `motion`) from `motion/react`. Timings come from `lib/motion.js` (`EASE`, `SPRING`, `rise`, `stagger`). `prefers-reduced-motion` is honoured globally.

Motion here is friendly and short. It answers something the user did, and never gets in the way of reading.

- Keep: the engraved band behind the Spend Analyser header (moves only with the page opening, the pointer, scrolling or the data, then stops), the sliding sidebar pill and segmented pill, rolling digits, the donut sweep and its hover, bars filling, results sliding open, dialogs rising, buttons pressing down, a stamp landing, removed items collapsing.
- Never: content that only appears when scrolled into view, long entrances, anything over about 0.9 s, or moving things while the user reads. The only loop is the sign-in rosette, which has a pause button.
- Spinners only for real waits, with text saying what is happening.

The Spend Analyser (`pages/DashboardPage.jsx` and `components/dashboard/`) is the reference implementation.
