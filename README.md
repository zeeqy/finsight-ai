# FinSight AI — An AI-Powered Personal Financial Management Web Application

> **Final Year Project (CSP600) — CS Netcentric (CDCS251)**  
> **Phase 1 Implementation: Full-Stack Platform, Spend Analyser, & AI Copilot**  
> **Aesthetic Theme: Maybank Signature Yellow & Charcoal Dark Mode**

---

## 📌 1. Project Overview & Architecture

**FinSight AI** is a commercial-grade SaaS platform built to transform personal finance from *reactive expense tracking* into *proactive, predictive risk management*.

- **Design System:** Maybank Signature Yellow (`#FFC80A`), deep charcoal cards (`#141824`), and high-contrast typography inspired by Maybank2u and the MAE app.
- **Frontend:** React.js, Tailwind CSS (v4), Recharts (dynamic doughnut chart), Lucide React.
- **Backend:** Node.js with Express.js, JWT Authentication (in-memory token handling), Multer CSV ingestion pipeline.
- **Database:** MySQL (relational schema with foreign keys) with an automated local JSON resilience fallback.
- **AI Intelligence:** Supports **Google Gemini API** (free tier at Google AI Studio), **OpenAI API** (`gpt-4o-mini`), and the built-in **FinSight Pro** Malaysian fintech advisor.
- **Bank Statement Parsing:** Native ingestion of real Malaysian bank statements (Bank Islam CASATIA CSV exports, Maybank2u exports, CIMB and Bank Islam PDF e-statements).

```
Finsight AI Builds/
├── server/
│   ├── src/
│   │   ├── index.js              # Express app entry & middleware
│   │   ├── db.js                 # MySQL pool & resilient fallback engine
│   │   ├── middleware/auth.js    # JWT Bearer token authentication
│   │   ├── routes/
│   │   │   ├── auth.js           # Register, Login, Me endpoints
│   │   │   ├── transactions.js   # Statement parser, Period filters, Bulk delete, Re-categorize
│   │   │   ├── budgets.js        # Custom category budget limit management
│   │   │   └── advisor.js        # Real AI Advisor (Google Gemini / OpenAI / FinSight Pro)
│   │   └── utils/categorizer.js  # Rule-based Malaysian transaction categorizer (Bank Islam CASATIA ready)
│   ├── schema.sql                # Complete MySQL DDL schema
│   ├── .env                      # Server configuration & AI API keys
│   └── package.json
└── client/
    ├── src/
    │   ├── context/AuthContext.jsx # In-memory JWT auth state & fetcher
    │   ├── components/
    │   │   ├── Sidebar.jsx        # Maybank Yellow navigation, user profile
    │   │   └── Header.jsx         # Live DB indicator, active period pill, quick upload
    │   ├── pages/
    │   │   ├── LoginPage.jsx      # Maybank styled auth with 1-click Demo Fill
    │   │   ├── RegisterPage.jsx   # Profile setup (Income, Age, Name)
    │   │   ├── DashboardPage.jsx  # Module 1: Spend Analyser, Period selector, Bulk clear, Custom budgets
    │   │   └── AdvisorPage.jsx    # Module 2: AI Financial Copilot Chat & Key Setup Modal
    │   ├── App.jsx
    │   └── index.css              # Maybank color tokens & custom styling
    ├── vite.config.js             # Tailwind v4 plugin + /api reverse proxy
    └── package.json
```

---

## 🌟 2. Key Features & Adjustments

### 1. Hard to Clear or Delete Records (Categorised by Month/Year)
- **Period Navigator:** Switch between months (e.g. `◀ October 2026 ▶`) or view All-Time History. All KPI cards, doughnut charts, and transaction ledger rows immediately sync to the selected month.
- **Clear Records Modal:**
  - Option A: Clear all records for the selected month/year only.
  - Option B: Purge all transactions across all months.
- **Batch Deletion:** Select checkboxes for individual transactions or "Select All" to bulk delete records.
- **Single Row Deletion:** Quick trash icon on every row.

### 2. Automated & Editable Record Categorisation
- Enhanced rule-based categorizer specifically tuned for Malaysian banking merchants:
  - `Transport`: Grab/MyTeksi, Shell, Petronas, Petron, Caltex, Semasa Parking, Setia City Mall Parking, TnG.
  - `Food & Dining`: Rotiboy, McDonald's, KFC, Starbucks, Tealive, Zus, Luckin Coffee, Kopi Saigon, CBTL, Texas Chicken, TCRS, Fish & Co, Bread History, Restoran, Kopitiam, Nasi Kandar.
  - `Groceries`: 99 Speedmart, KK FamilyMart, Lotus's, Aeon, Jaya Grocer, Giant.
  - `Shopping`: Shopee, Lazada, TikTok Shop, Uniqlo, Padini, Watsons, Guardian, Mr DIY.
  - `Utilities`: Digi, Celcom, Maxis, U Mobile, Unifi, TNB, Syabas/Air Selangor.
  - `Education`: UiTM, Universiti, College, PTPTN.
  - `Income / Inflow`: Inward DuitNow transfers (+RM), salary, freelance payments.
- **In-line Category Reclassification:** Click any category badge directly in the Transaction Ledger to reassign it via dropdown on the fly!

### 3. Custom Categories for Budget Targets
- The **"+ Set Budget"** modal allows choosing from existing categories OR clicking **"+ Add Custom Category"**.
- Set custom category limits (e.g., `Rent`, `Car Loan`, `Parents Allowance`, `Takaful`, `Gym`).
- Real-time progress bars compare spending against assigned limits with visual alerts (Normal, Warning, Over Budget).
- Delete budget limits with a single click.

### 4. Support for Real Bank Statements (Bank Islam CASATIA)
- Native parsing of `CASATIA_Report_17102026.csv` (located in `Real Bank csv/`).
- Handles:
  - Formats: `DD Mon YYYY` (e.g. `17 Oct 2026`), `DD/MM/YYYY`, `YYYY-MM-DD`.
  - Column matching: `Reference 1`, `Transaction Description`, `Reference 2`, `Transaction Amount`.
  - Cleans `+RM` and `-RM` amounts without UTC timezone shift.

### 5. Real AI Financial Advisor with Setup Guide
- **Google Gemini API Integration (Free Tier):**
  - Instant access with a free key from [Google AI Studio](https://aistudio.google.com/app/apikey) (no credit card needed).
- **OpenAI API Integration:**
  - Supports `gpt-4o-mini` and `gpt-3.5-turbo`.
- **FinSight Pro Local Engine:**
  - Comprehensive, natural Malaysian fintech conversational model with full context injection (income, current spend, surplus, top category, anomalies).
- **In-App AI Setup Modal:**
  - Click **"AI Setup & Keys"** in the Advisor tab to enter, verify, and switch AI providers on the fly.
- **Conversation Management:**
  - Refresh or clear chat history anytime.

### 6. Maybank Visual Identity
- Signature Maybank Yellow (`#FFC80A`) badges, buttons, active states, and highlights.
- Professional charcoal and onyx card backgrounds (`#0B0D13` base, `#141824` cards).
- Clear, readable typography and visual cues matching modern fintech apps like Maybank MAE.

---

## 🚀 3. How to Run Locally

### Step 1: Start the Backend Server
```bash
cd "Finsight AI Builds/server"
node src/index.js
# Or: npm run dev
```
*Server runs on:* `http://localhost:5000`

### Step 2: Start the Frontend Client
```bash
cd "Finsight AI Builds/client"
cmd.exe /c "npm run dev"
# Or: npm run dev
```
*Frontend runs on:* `http://localhost:5173`

---

## 🔑 4. Setting up Real AI (Google Gemini — Free)

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Click **"Create API Key"** and copy the generated key.
3. Open FinSight AI in your browser (`http://localhost:5173`).
4. Click **"AI Financial Advisor"** in the sidebar.
5. Click **"AI Setup & Keys"** at the top right.
6. Select **"Google Gemini"**, paste your key, and click **"Save & Verify Key"**.
7. Alternatively, paste the key directly into `Finsight AI Builds/server/.env`:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
