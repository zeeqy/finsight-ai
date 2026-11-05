# Saved UI versions

The project is not in git, so each finished look of the client is kept here as a full copy.

| Version | Look | Saved |
|---|---|---|
| UI1 | Dark charcoal and yellow, left sidebar, stat cards, donut chart | 2 Nov 2026, rebuilt from edit history |
| UI2 | Light jade, banknote-engraving style, top bar, sentence headlines, heavy motion | 2 Nov 2026 |
| UI3 | Yellow theme, yellow left sidebar, white cards, donut chart, small colour accents per module, guides for new users | 3 Nov 2026, last synced 5 Nov 2026 with every feature up to quote comparison and effective-rate loans |
| UI3.5 | UI3 plus Intelligent Oyen (3D cat mascot on a new Home page and in the advisor), "Good morning, Name", light / dark / device theme, light glass, hover and scroll motion | 5 Nov 2026 |
| UI3.6 | UI3.5 plus a different engraved line drawing behind each module heading, a soft page background and frosted glass cards (with a Glass effect switch) | 5 Nov 2026 |

The live version is in `client/`. `backup-<time>` folders are automatic copies made by the restore script.

To switch, run this from the project root. The version being replaced is saved first as `ui-versions/backup-<time>`.

```bash
node ui-versions/restore.js UI2
```

Only the client changes. The API, ML service and database are shared by every version.

UI1 and UI2 were saved before the features added on 3 and 4 Nov 2026 (commitments, ledger sorting, info buttons, shared goal surplus notes, recurring payments and forecast, manual entry, the Health Check page, affordability and debt planner on the loan page, zakat, protection, the advisor's figure check, PDF e-statement upload with password and preview). Restoring them brings back the older look **without** those screens; the API still works, so only the new controls are missing.
