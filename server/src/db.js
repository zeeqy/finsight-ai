/**
 * FinSight AI - Database Connection Manager
 * Supports primary MySQL connection (XAMPP / local) with resilient local store fallback
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

let pool = null;
let isUsingFallback = false;

// Path to local JSON fallback database
const fallbackDataFile = path.join(__dirname, '..', 'data_store.json');

// Initialize empty fallback structure if needed
function loadFallbackData() {
  if (!fs.existsSync(fallbackDataFile)) {
    const initialData = {
      users: [],
      bank_statements: [],
      transactions: [],
      budgets: [],
      chat_sessions: [],
      chat_messages: [],
      nextIds: {
        users: 1,
        bank_statements: 1,
        transactions: 1,
        budgets: 1,
        chat_sessions: 1,
        chat_messages: 1,
      },
    };
    fs.writeFileSync(fallbackDataFile, JSON.stringify(initialData, null, 2));
    return initialData;
  }
  try {
    return JSON.parse(fs.readFileSync(fallbackDataFile, 'utf8'));
  } catch (e) {
    return {
      users: [],
      bank_statements: [],
      transactions: [],
      budgets: [],
      chat_sessions: [],
      chat_messages: [],
      nextIds: {
        users: 1,
        bank_statements: 1,
        transactions: 1,
        budgets: 1,
        chat_sessions: 1,
        chat_messages: 1,
      },
    };
  }
}

function saveFallbackData(data) {
  try {
    fs.writeFileSync(fallbackDataFile, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error saving fallback data:', err);
  }
}

/** The JSON store is a development convenience only: off in production unless DB_FALLBACK=on. */
function fallbackAllowed() {
  const setting = String(process.env.DB_FALLBACK || '').toLowerCase();
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  return process.env.NODE_ENV !== 'production';
}

async function initDatabase() {
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = parseInt(process.env.DB_PORT, 10) || 3306;
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'finsight_ai';

  try {
    // 1. First test connection to MySQL server
    const rootConnection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      connectTimeout: 2000,
    });

    await rootConnection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await rootConnection.end();

    // 2. Connect to the specific database pool
    pool = mysql.createPool({
      host,
      port,
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      // DATE columns come back as 'YYYY-MM-DD' text. Without this mysql2 turns them into JS Dates at
      // local midnight, which serialise as the previous day in UTC (1 Oct -> 2026-09-30T16:00:00Z).
      // TIMESTAMP columns are left as Dates.
      dateStrings: ['DATE'],
    });

    // 3. Create tables if not exist
    const schemaSql = `
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        full_name VARCHAR(150) NOT NULL,
        email VARCHAR(191) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        monthly_income DECIMAL(12, 2) DEFAULT 0.00,
        age INT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS bank_statements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        filename VARCHAR(255) NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        statement_id INT DEFAULT NULL,
        user_id INT NOT NULL,
        txn_date DATE NOT NULL,
        description VARCHAR(255) NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        category VARCHAR(100) NOT NULL DEFAULT 'Others',
        category_source VARCHAR(30) DEFAULT NULL,
        is_anomaly TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_txn_user (user_id),
        INDEX idx_txn_date (txn_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS budgets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        category VARCHAR(100) NOT NULL,
        budget_limit DECIMAL(12, 2) NOT NULL,
        month INT NOT NULL,
        year INT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_user_cat_month_year (user_id, category, month, year)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS chat_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_chat_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS chat_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id INT NOT NULL,
        role ENUM('user', 'assistant') NOT NULL,
        content TEXT NOT NULL,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_chat_session (session_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS loan_predictions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        loan_type ENUM('personal', 'car', 'house') NOT NULL,
        interest_method ENUM('flat', 'reducing') NOT NULL,
        item_price DECIMAL(12, 2) NOT NULL,
        down_payment DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        loan_amount DECIMAL(12, 2) NOT NULL,
        interest_rate FLOAT NOT NULL,
        tenure_years INT NOT NULL,
        monthly_income DECIMAL(10, 2) NOT NULL,
        existing_commitments DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        employment_type VARCHAR(30) DEFAULT NULL,
        years_employed FLOAT DEFAULT NULL,
        dependants INT DEFAULT 0,
        age INT DEFAULT NULL,
        monthly_instalment DECIMAL(10, 2) NOT NULL,
        total_payment DECIMAL(12, 2) NOT NULL,
        total_interest DECIMAL(12, 2) NOT NULL,
        dsr FLOAT NOT NULL,
        dsr_band VARCHAR(20) NOT NULL,
        default_probability FLOAT DEFAULT NULL,
        risk_level VARCHAR(20) DEFAULT NULL,
        risk_source VARCHAR(30) DEFAULT NULL,
        risk_counts BOOLEAN NOT NULL DEFAULT TRUE,
        overall_verdict VARCHAR(20) NOT NULL,
        predicted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_loan_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS life_goals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        goal_type ENUM('kahwin', 'children', 'haji', 'house', 'car', 'custom') NOT NULL,
        title VARCHAR(150) NOT NULL,
        target_amount DECIMAL(12, 2) NOT NULL,
        current_saved DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        target_date DATE NOT NULL,
        savings_vehicle ENUM('piggybank', 'savings', 'tabung_haji', 'asb', 'gold') NOT NULL DEFAULT 'piggybank',
        expected_rate FLOAT DEFAULT NULL,
        required_monthly DECIMAL(10, 2) DEFAULT NULL,
        feasibility VARCHAR(20) DEFAULT NULL,
        asset_price DECIMAL(12, 2) DEFAULT NULL,
        loan_rate FLOAT DEFAULT NULL,
        loan_tenure_months INT DEFAULT NULL,
        est_monthly_instalment DECIMAL(10, 2) DEFAULT NULL,
        projected_dsr FLOAT DEFAULT NULL,
        status ENUM('active', 'completed', 'paused') NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_goal_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS goal_cost_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        goal_id INT NOT NULL,
        item_name VARCHAR(150) NOT NULL,
        estimated_cost DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        CONSTRAINT fk_costitems_goal FOREIGN KEY (goal_id) REFERENCES life_goals (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS goal_contributions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        goal_id INT NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        contributed_at DATE NOT NULL,
        CONSTRAINT fk_contrib_goal FOREIGN KEY (goal_id) REFERENCES life_goals (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS cost_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        goal_type VARCHAR(20) NOT NULL,
        income_group ENUM('B40', 'M40', 'T20', 'ALL') NOT NULL DEFAULT 'ALL',
        item_name VARCHAR(150) NOT NULL,
        default_cost DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        source VARCHAR(255) DEFAULT NULL,
        INDEX idx_template_type (goal_type, income_group)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS insurance_predictions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        age INT NOT NULL,
        height_cm FLOAT DEFAULT NULL,
        weight_kg FLOAT DEFAULT NULL,
        bmi FLOAT NOT NULL,
        smoker BOOLEAN NOT NULL,
        children INT NOT NULL DEFAULT 0,
        risk_score FLOAT NOT NULL,
        risk_tier VARCHAR(20) NOT NULL,
        shap_values JSON NOT NULL,
        predicted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ins_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS commitments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        kind ENUM('car_loan', 'house_loan', 'personal_loan', 'ptptn', 'credit_card', 'insurance', 'other') NOT NULL,
        label VARCHAR(100) NOT NULL,
        monthly_amount DECIMAL(10, 2) NOT NULL,
        balance DECIMAL(12, 2) DEFAULT NULL,
        annual_rate FLOAT DEFAULT NULL,
        end_date DATE DEFAULT NULL,
        paid_from_statement BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_commit_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS recurring_overrides (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        merchant_key VARCHAR(100) NOT NULL,
        status ENUM('confirmed', 'dismissed') NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_recurring_user_key (user_id, merchant_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS goal_deposit_links (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        transaction_id INT NOT NULL,
        goal_id INT DEFAULT NULL,
        status ENUM('added', 'dismissed') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_deposit_txn (transaction_id),
        INDEX idx_deposit_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS insurance_quotes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        provider VARCHAR(100) NOT NULL,
        plan_name VARCHAR(150) DEFAULT NULL,
        plan_type ENUM('medical', 'life', 'critical_illness') NOT NULL,
        takaful BOOLEAN NOT NULL DEFAULT FALSE,
        premium DECIMAL(10, 2) NOT NULL,
        premium_frequency ENUM('monthly', 'yearly') NOT NULL DEFAULT 'monthly',
        coverage DECIMAL(12, 2) DEFAULT NULL,
        annual_limit DECIMAL(12, 2) DEFAULT NULL,
        deductible DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        co_pay_pct FLOAT NOT NULL DEFAULT 0,
        co_pay_cap DECIMAL(10, 2) DEFAULT NULL,
        room_board DECIMAL(10, 2) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_quote_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS savings_entries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        kind ENUM('add', 'withdraw', 'set') NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        balance_before DECIMAL(12, 2) DEFAULT NULL,
        balance_after DECIMAL(12, 2) NOT NULL,
        note VARCHAR(80) DEFAULT NULL,
        entry_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_savings_user (user_id, entry_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;

    const statements = schemaSql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      await pool.query(stmt);
    }

    // Module 4: income group drives Haji / children cost templates
    try {
      await pool.query("ALTER TABLE users ADD COLUMN income_group ENUM('B40','M40','T20') NULL");
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }

    // Module 1 "Your uploads": which bank and file type each upload was, so one file can be found and deleted
    for (const col of ['bank VARCHAR(40) NULL', 'file_type VARCHAR(10) NULL']) {
      try {
        await pool.query(`ALTER TABLE bank_statements ADD COLUMN ${col}`);
      } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') throw err;
      }
    }

    // Health check: emergency savings and household type (for the Belanjawanku reference budget)
    // terms_accepted_at: when the sign-up box (18 or older, Terms of use) was ticked
    // token_version: raised on a password change, so sign-ins issued before it stop working
    for (const col of ['emergency_savings DECIMAL(12, 2) NULL', 'household_type VARCHAR(30) NULL', 'terms_accepted_at DATETIME NULL', 'token_version INT NOT NULL DEFAULT 0']) {
      try {
        await pool.query(`ALTER TABLE users ADD COLUMN ${col}`);
      } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') throw err;
      }
    }

    // savings_entries.balance_before (added after the table, for databases that already have it)
    try {
      await pool.query('ALTER TABLE savings_entries ADD COLUMN balance_before DECIMAL(12, 2) DEFAULT NULL AFTER amount');
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }

    // Module 1: who set the category (model | model_low_confidence | rules | sign | user)
    try {
      await pool.query('ALTER TABLE transactions ADD COLUMN category_source VARCHAR(30) DEFAULT NULL AFTER category');
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }

    // Module 3: false when the model score was outside its training range (reference only)
    try {
      await pool.query('ALTER TABLE loan_predictions ADD COLUMN risk_counts BOOLEAN NOT NULL DEFAULT TRUE AFTER risk_source');
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }

    // Seed Module 4 cost templates, and reseed whenever data/costTemplates.js changes (pure seed data:
    // goals copy the figures into goal_cost_items, so nothing points at these rows)
    const { COST_TEMPLATES } = require('./data/costTemplates');
    const [seeded] = await pool.query('SELECT goal_type, income_group, item_name, default_cost, source FROM cost_templates ORDER BY id');
    const rowKey = (t) => [t.goal_type, t.income_group, t.item_name, Number(t.default_cost).toFixed(2), t.source].join('|');
    if (seeded.map(rowKey).join('\n') !== COST_TEMPLATES.map(rowKey).join('\n')) {
      await pool.query('DELETE FROM cost_templates');
      await pool.query(
        'INSERT INTO cost_templates (goal_type, income_group, item_name, default_cost, source) VALUES ?',
        [COST_TEMPLATES.map((t) => [t.goal_type, t.income_group, t.item_name, t.default_cost, t.source])]
      );
    }

    isUsingFallback = false;
    console.log(`[FinSight AI DB] ✅ Successfully connected to MySQL (${host}:${port}/${database}). All tables verified.`);
  } catch (error) {
    console.warn(`[FinSight AI DB] ⚠️ Could not connect to MySQL (${host}:${port}): ${error.message}`);
    // In production the JSON file must never hold real users' data: fail, so the caller retries or stops
    if (!fallbackAllowed()) throw error;
    console.log('[FinSight AI DB] 🚀 Activating local JSON persistence fallback. (Start XAMPP MySQL anytime to use MySQL)');
    isUsingFallback = true;
    loadFallbackData();
  }
}

/**
 * Universal query runner: executes against MySQL pool or fallback JSON engine
 */
async function query(sql, params = []) {
  if (!isUsingFallback && pool) {
    try {
      const [rows, fields] = await pool.query(sql, params);
      return [rows, fields];
    } catch (err) {
      console.error('[FinSight AI DB Error]:', err.message);
      throw err;
    }
  }

  // Fallback Engine
  return executeFallbackQuery(sql, params);
}

function executeFallbackQuery(sql, params) {
  const data = loadFallbackData();
  const trimmed = sql.trim();
  const upper = trimmed.toUpperCase();

  const normalizedUpper = upper.replace(/\s+/g, ' ');

  // 1. SELECT queries
  if (normalizedUpper.startsWith('SELECT')) {
    if (normalizedUpper.includes('FROM USERS WHERE EMAIL =')) {
      const email = params[0]?.toLowerCase();
      const user = data.users.find((u) => u.email.toLowerCase() === email);
      return [user ? [user] : []];
    }

    if (normalizedUpper.includes('FROM USERS WHERE ID =')) {
      const id = parseInt(params[0], 10);
      const user = data.users.find((u) => u.id === id);
      return [user ? [user] : []];
    }

    // Anomaly count query
    if (normalizedUpper.includes('COUNT(ID) AS ANOMALY_COUNT')) {
      const userId = parseInt(params[0], 10);
      const year = parseInt(params[1], 10);
      const month = parseInt(params[2], 10);
      const anomalyTxns = data.transactions.filter((t) => {
        if (t.user_id !== userId || !t.is_anomaly) return false;
        const d = new Date(t.txn_date);
        return d.getFullYear() === year && d.getMonth() + 1 === month;
      });
      return [[{ anomaly_count: anomalyTxns.length }]];
    }

    // Summary by category query
    if (normalizedUpper.includes('GROUP BY CATEGORY')) {
      const userId = parseInt(params[0], 10);
      const year = parseInt(params[1], 10);
      const month = parseInt(params[2], 10);

      const userTxns = data.transactions.filter((t) => {
        if (t.user_id !== userId) return false;
        const d = new Date(t.txn_date);
        return d.getFullYear() === year && d.getMonth() + 1 === month;
      });

      const catMap = {};
      userTxns.forEach((t) => {
        const cat = t.category || 'Others';
        catMap[cat] = (catMap[cat] || 0) + parseFloat(t.amount || 0);
      });

      const rows = Object.keys(catMap).map((cat) => ({
        category: cat,
        total_amount: catMap[cat],
        transaction_count: userTxns.filter((t) => t.category === cat).length,
      }));

      // Sort descending by total_amount
      rows.sort((a, b) => b.total_amount - a.total_amount);
      return [rows];
    }

    // Distinct periods in transactions
    if (normalizedUpper.includes('DISTINCT YEAR(TXN_DATE)') || (normalizedUpper.includes('GROUP BY YEAR(TXN_DATE)') && normalizedUpper.includes('FROM TRANSACTIONS'))) {
      const userId = parseInt(params[0], 10);
      const userTxns = data.transactions.filter((t) => t.user_id === userId);
      const periodMap = {};
      userTxns.forEach((t) => {
        const d = new Date(t.txn_date);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const key = `${y}-${m}`;
        if (!periodMap[key]) {
          periodMap[key] = { year: y, month: m, count: 0, total_spend: 0 };
        }
        periodMap[key].count++;
        periodMap[key].total_spend += parseFloat(t.amount || 0);
      });
      const periods = Object.values(periodMap).sort((a, b) => b.year - a.year || b.month - a.month);
      return [periods];
    }

    if (normalizedUpper.includes('FROM TRANSACTIONS WHERE USER_ID =') && normalizedUpper.includes('YEAR(TXN_DATE) =') && normalizedUpper.includes('MONTH(TXN_DATE) =')) {
      const userId = parseInt(params[0], 10);
      const year = parseInt(params[1], 10);
      const month = parseInt(params[2], 10);
      let list = data.transactions.filter((t) => {
        if (t.user_id !== userId) return false;
        const d = new Date(t.txn_date);
        return d.getFullYear() === year && d.getMonth() + 1 === month;
      });
      list.sort((a, b) => new Date(b.txn_date) - new Date(a.txn_date) || b.id - a.id);
      return [list];
    }

    if (normalizedUpper.includes('FROM TRANSACTIONS WHERE USER_ID =') && normalizedUpper.includes('ORDER BY')) {
      const userId = parseInt(params[0], 10);
      let list = data.transactions.filter((t) => t.user_id === userId);
      list.sort((a, b) => new Date(b.txn_date) - new Date(a.txn_date) || b.id - a.id);
      return [list];
    }

    if (normalizedUpper.includes('FROM TRANSACTIONS WHERE USER_ID =')) {
      const userId = parseInt(params[0], 10);
      const list = data.transactions.filter((t) => t.user_id === userId);
      return [list];
    }

    if (normalizedUpper.includes('FROM BUDGETS WHERE USER_ID =')) {
      const userId = parseInt(params[0], 10);
      const month = params[1] ? parseInt(params[1], 10) : null;
      const year = params[2] ? parseInt(params[2], 10) : null;
      let list = data.budgets.filter((b) => b.user_id === userId);
      if (month && year) {
        list = list.filter((b) => b.month === month && b.year === year);
      }
      return [list];
    }

    if (normalizedUpper.includes('FROM CHAT_MESSAGES')) {
      const sessionId = parseInt(params[0], 10);
      let msgs = data.chat_messages.filter((m) => m.session_id === sessionId);
      msgs.sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at));
      return [msgs];
    }

    if (normalizedUpper.includes('FROM CHAT_SESSIONS WHERE USER_ID =')) {
      const userId = parseInt(params[0], 10);
      let sessions = data.chat_sessions.filter((s) => s.user_id === userId);
      sessions.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
      return [sessions];
    }

    return [[]];
  }

  // 2. INSERT queries
  if (upper.startsWith('INSERT INTO USERS')) {
    const id = data.nextIds.users++;
    const newUser = {
      id,
      full_name: params[0],
      email: params[1],
      password_hash: params[2],
      monthly_income: parseFloat(params[3]) || 0,
      age: parseInt(params[4], 10) || null,
      created_at: new Date().toISOString(),
    };
    data.users.push(newUser);
    saveFallbackData(data);
    return [{ insertId: id, affectedRows: 1 }];
  }

  if (upper.startsWith('INSERT INTO BANK_STATEMENTS')) {
    const id = data.nextIds.bank_statements++;
    const newStmt = {
      id,
      user_id: parseInt(params[0], 10),
      filename: params[1],
      bank: params[2] || null,
      file_type: params[3] || null,
      uploaded_at: new Date().toISOString(),
    };
    data.bank_statements.push(newStmt);
    saveFallbackData(data);
    return [{ insertId: id, affectedRows: 1 }];
  }

  if (upper.startsWith('INSERT INTO TRANSACTIONS')) {
    const id = data.nextIds.transactions++;
    const newTxn = {
      id,
      statement_id: params[0] ? parseInt(params[0], 10) : null,
      user_id: parseInt(params[1], 10),
      txn_date: params[2],
      description: params[3],
      amount: parseFloat(params[4]),
      category: params[5],
      is_anomaly: params[6] ? 1 : 0,
      category_source: params[7] || null,
      created_at: new Date().toISOString(),
    };
    data.transactions.push(newTxn);
    saveFallbackData(data);
    return [{ insertId: id, affectedRows: 1 }];
  }

  if (upper.startsWith('INSERT INTO BUDGETS')) {
    const userId = parseInt(params[0], 10);
    const category = params[1];
    const limit = parseFloat(params[2]);
    const month = parseInt(params[3], 10);
    const year = parseInt(params[4], 10);

    const existingIndex = data.budgets.findIndex(
      (b) => b.user_id === userId && b.category === category && b.month === month && b.year === year
    );

    if (existingIndex >= 0) {
      data.budgets[existingIndex].budget_limit = limit;
      data.budgets[existingIndex].updated_at = new Date().toISOString();
      saveFallbackData(data);
      return [{ insertId: data.budgets[existingIndex].id, affectedRows: 1 }];
    } else {
      const id = data.nextIds.budgets++;
      data.budgets.push({
        id,
        user_id: userId,
        category,
        budget_limit: limit,
        month,
        year,
        updated_at: new Date().toISOString(),
      });
      saveFallbackData(data);
      return [{ insertId: id, affectedRows: 1 }];
    }
  }

  if (upper.startsWith('INSERT INTO CHAT_SESSIONS')) {
    const id = data.nextIds.chat_sessions++;
    const session = {
      id,
      user_id: parseInt(params[0], 10),
      started_at: new Date().toISOString(),
    };
    data.chat_sessions.push(session);
    saveFallbackData(data);
    return [{ insertId: id, affectedRows: 1 }];
  }

  if (upper.startsWith('INSERT INTO CHAT_MESSAGES')) {
    const id = data.nextIds.chat_messages++;
    const msg = {
      id,
      session_id: parseInt(params[0], 10),
      role: params[1],
      content: params[2],
      sent_at: new Date().toISOString(),
    };
    data.chat_messages.push(msg);
    saveFallbackData(data);
    return [{ insertId: id, affectedRows: 1 }];
  }

  // 3. UPDATE queries
  if (normalizedUpper.startsWith('UPDATE TRANSACTIONS SET IS_ANOMALY =') && normalizedUpper.includes('WHERE ID =') && normalizedUpper.includes('AND USER_ID =')) {
    const flag = params[0] ? 1 : 0;
    const txnId = parseInt(params[1], 10);
    const userId = parseInt(params[2], 10);
    const txn = data.transactions.find((t) => t.id === txnId && t.user_id === userId);
    if (txn) {
      txn.is_anomaly = flag;
      saveFallbackData(data);
      return [{ affectedRows: 1 }];
    }
    return [{ affectedRows: 0 }];
  }

  if (normalizedUpper.startsWith('UPDATE TRANSACTIONS SET CATEGORY =') && normalizedUpper.includes('WHERE ID =') && normalizedUpper.includes('AND USER_ID =')) {
    const newCategory = params[0];
    const txnId = parseInt(params[1], 10);
    const userId = parseInt(params[2], 10);
    const txn = data.transactions.find((t) => t.id === txnId && t.user_id === userId);
    if (txn) {
      txn.category = newCategory;
      txn.category_source = 'user';
      saveFallbackData(data);
      return [{ affectedRows: 1 }];
    }
    return [{ affectedRows: 0 }];
  }

  // 4. DELETE queries
  // Delete by month and year
  if (normalizedUpper.startsWith('DELETE FROM TRANSACTIONS WHERE USER_ID =') && normalizedUpper.includes('YEAR(TXN_DATE) =') && normalizedUpper.includes('MONTH(TXN_DATE) =')) {
    const userId = parseInt(params[0], 10);
    const year = parseInt(params[1], 10);
    const month = parseInt(params[2], 10);
    const initialLength = data.transactions.length;
    data.transactions = data.transactions.filter((t) => {
      if (t.user_id !== userId) return true;
      const d = new Date(t.txn_date);
      const isMatch = d.getFullYear() === year && d.getMonth() + 1 === month;
      return !isMatch; // keep non-matches
    });
    saveFallbackData(data);
    return [{ affectedRows: initialLength - data.transactions.length }];
  }

  // Delete all transactions for user
  if (normalizedUpper === 'DELETE FROM TRANSACTIONS WHERE USER_ID = ?') {
    const userId = parseInt(params[0], 10);
    const initialLength = data.transactions.length;
    data.transactions = data.transactions.filter((t) => t.user_id !== userId);
    saveFallbackData(data);
    return [{ affectedRows: initialLength - data.transactions.length }];
  }

  // Bulk delete by array of IDs
  if (normalizedUpper.includes('DELETE FROM TRANSACTIONS WHERE USER_ID =') && normalizedUpper.includes('ID IN')) {
    const userId = parseInt(params[0], 10);
    const ids = params.slice(1).map((x) => parseInt(x, 10));
    const initialLength = data.transactions.length;
    data.transactions = data.transactions.filter((t) => !(t.user_id === userId && ids.includes(t.id)));
    saveFallbackData(data);
    return [{ affectedRows: initialLength - data.transactions.length }];
  }

  // Delete single transaction
  if (upper.startsWith('DELETE FROM TRANSACTIONS WHERE ID =') && upper.includes('AND USER_ID =')) {
    const id = parseInt(params[0], 10);
    const userId = parseInt(params[1], 10);
    const initialLength = data.transactions.length;
    data.transactions = data.transactions.filter((t) => !(t.id === id && t.user_id === userId));
    saveFallbackData(data);
    return [{ affectedRows: initialLength - data.transactions.length }];
  }

  // Delete budget
  if (normalizedUpper.startsWith('DELETE FROM BUDGETS WHERE ID =') && normalizedUpper.includes('AND USER_ID =')) {
    const id = parseInt(params[0], 10);
    const userId = parseInt(params[1], 10);
    const initialLength = data.budgets.length;
    data.budgets = data.budgets.filter((b) => !(b.id === id && b.user_id === userId));
    saveFallbackData(data);
    return [{ affectedRows: initialLength - data.budgets.length }];
  }

  // Clear chat messages for session or user
  if (normalizedUpper.includes('DELETE FROM CHAT_MESSAGES WHERE SESSION_ID =')) {
    const sessionId = parseInt(params[0], 10);
    const initialLength = data.chat_messages.length;
    data.chat_messages = data.chat_messages.filter((m) => m.session_id !== sessionId);
    saveFallbackData(data);
    return [{ affectedRows: initialLength - data.chat_messages.length }];
  }

  return [{ affectedRows: 0 }];
}

/** Runs fn(query) on one MySQL connection inside a transaction; rolls back if fn throws. MySQL only. */
async function withTransaction(fn) {
  if (isUsingFallback || !pool) throw new Error('Transactions need MySQL.');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn((sql, params = []) => conn.query(sql, params));
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  initDatabase,
  fallbackAllowed,
  query,
  withTransaction,
  isUsingFallback: () => isUsingFallback,
};
