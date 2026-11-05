/**
 * FinSight AI - Authentication Routes: register, login, the profile (view, edit, password), data export and account deletion
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const authenticateToken = require('../middleware/auth');
const requireMysql = require('../middleware/requireMysql');
const { loginLimiter, recordLoginFailure, clearLoginFailures } = require('../middleware/loginLimiter');
const { exportUserData, deleteUserData } = require('../services/accountData');
const { registerLimiter, recordSignup } = require('../middleware/registerLimiter');
const { REFERENCE_BUDGETS } = require('../data/referenceBudgets');

const router = express.Router();
const { JWT_SECRET, JWT_EXPIRES_IN } = authenticateToken;
const MIN_PASSWORD_LENGTH = 6; // same rule as RegisterPage.jsx
const MIN_AGE = 18; // FinSight is for adults (the sign-up box confirms it)

// POST /api/auth/register
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { full_name, email, password, monthly_income, age, accept_terms } = req.body || {};

    if (!full_name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Full name, email, and password are required.',
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      });
    }

    if (String(full_name).trim().length > 100) {
      return res.status(400).json({ success: false, message: 'Your name must be 100 characters or fewer.' });
    }
    // The sign-up box: "I am 18 or older and agree to the Terms of use and the privacy notice"
    if (accept_terms !== true) {
      return res.status(400).json({ success: false, code: 'TERMS_REQUIRED', message: 'Confirm that you are 18 or older and agree to the Terms of use.' });
    }
    const parsedAge = age === undefined || age === null || age === '' ? null : Number(age);
    if (parsedAge !== null && !(Number.isInteger(parsedAge) && parsedAge >= MIN_AGE && parsedAge <= 100)) {
      return res.status(422).json({ success: false, message: `FinSight is for adults: age must be a whole number from ${MIN_AGE} to 100.` });
    }
    const parsedIncome = Number(monthly_income) || 0;
    if (parsedIncome < 0 || parsedIncome > MAX_INCOME) {
      return res.status(422).json({ success: false, message: 'Monthly income must be between RM 0 and RM 1,000,000.' });
    }

    // Check if email already registered
    const [existingUsers] = await db.query('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (existingUsers && existingUsers.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists.',
      });
    }

    // Hash password with bcrypt
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Insert user into database (when the terms were accepted is kept as a record; MySQL only)
    const [insertResult] = db.isUsingFallback()
      ? await db.query('INSERT INTO users (full_name, email, password_hash, monthly_income, age) VALUES (?, ?, ?, ?, ?)', [
          full_name.trim(),
          cleanEmail,
          password_hash,
          parsedIncome,
          parsedAge,
        ])
      : await db.query('INSERT INTO users (full_name, email, password_hash, monthly_income, age, terms_accepted_at) VALUES (?, ?, ?, ?, ?, NOW())', [
          full_name.trim(),
          cleanEmail,
          password_hash,
          parsedIncome,
          parsedAge,
        ]);

    const userId = insertResult.insertId;
    recordSignup(req);

    // Create JWT
    const token = jwt.sign(
      {
        id: userId,
        email: cleanEmail,
        full_name: full_name.trim(),
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.status(201).json({
      success: true,
      message: 'Registration successful! Welcome to FinSight AI.',
      token,
      user: {
        id: userId,
        full_name: full_name.trim(),
        email: cleanEmail,
        monthly_income: parsedIncome,
        age: parsedAge,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during registration.',
    });
  }
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.',
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Find user
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [cleanEmail]);
    if (!users || users.length === 0) {
      recordLoginFailure(req);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const user = users[0];

    // Compare bcrypt password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      recordLoginFailure(req);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    clearLoginFailures(req);

    // Generate JWT
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      success: true,
      message: 'Login successful!',
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        monthly_income: parseFloat(user.monthly_income) || 0,
        age: user.age,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during login.',
    });
  }
});

// GET /api/auth/me (Protected)
router.get('/me', authenticateToken, async (req, res) => {
  try {
    let users;
    try {
      [users] = await db.query(`SELECT ${PROFILE_COLUMNS} FROM users WHERE id = ?`, [req.user.id]);
    } catch {
      // The JSON fallback store may not have the newer columns
      [users] = await db.query('SELECT id, full_name, email, monthly_income, age, created_at FROM users WHERE id = ?', [req.user.id]);
    }
    if (!users || users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // The household budgets come along so the profile dialog can list them with their amounts
    return res.json({ success: true, user: publicUser(users[0]), households: REFERENCE_BUDGETS });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch user profile.' });
  }
});

const INCOME_GROUPS = ['B40', 'M40', 'T20'];
const PROFILE_COLUMNS = 'id, full_name, email, monthly_income, age, income_group, household_type, created_at';
const MAX_INCOME = 1000000;

/** Checks the editable profile fields; returns [sets, values] for the UPDATE or throws RangeError. */
function profileUpdates(body) {
  const sets = [];
  const values = [];
  if ('full_name' in body) {
    const name = String(body.full_name || '').trim();
    if (!name) throw new RangeError('Enter your name.');
    if (name.length > 100) throw new RangeError('Your name must be 100 characters or fewer.');
    sets.push('full_name = ?');
    values.push(name);
  }
  if ('monthly_income' in body) {
    const income = body.monthly_income === '' || body.monthly_income === null ? 0 : Number(body.monthly_income);
    if (!Number.isFinite(income) || income < 0 || income > MAX_INCOME) throw new RangeError('Monthly income must be between RM 0 and RM 1,000,000.');
    sets.push('monthly_income = ?');
    values.push(Math.round(income * 100) / 100);
  }
  if ('age' in body) {
    const age = body.age === '' || body.age === null ? null : Number(body.age);
    if (age !== null && !(Number.isInteger(age) && age >= MIN_AGE && age <= 100)) throw new RangeError(`Age must be a whole number from ${MIN_AGE} to 100.`);
    sets.push('age = ?');
    values.push(age);
  }
  if ('income_group' in body) {
    const group = body.income_group || null;
    if (group !== null && !INCOME_GROUPS.includes(group)) throw new RangeError('Income group must be B40, M40 or T20.');
    sets.push('income_group = ?');
    values.push(group);
  }
  if ('household_type' in body) {
    const household = body.household_type || null;
    if (household !== null && !REFERENCE_BUDGETS[household]) throw new RangeError('Choose one of the listed household types.');
    sets.push('household_type = ?');
    values.push(household);
  }
  return [sets, values];
}

const publicUser = (u) => ({ ...u, monthly_income: parseFloat(u.monthly_income) || 0 });

// PATCH /api/auth/me {full_name?, monthly_income?, age?, income_group?, household_type?} - edit the profile
router.patch('/me', authenticateToken, requireMysql, async (req, res) => {
  try {
    const [sets, values] = profileUpdates(req.body || {});
    if (!sets.length) return res.status(422).json({ success: false, message: 'Nothing to update.' });
    await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...values, req.user.id]);
    const [users] = await db.query(`SELECT ${PROFILE_COLUMNS} FROM users WHERE id = ?`, [req.user.id]);
    if (!users.length) return res.status(404).json({ success: false, message: 'User not found.' });
    return res.json({ success: true, message: 'Profile saved.', user: publicUser(users[0]) });
  } catch (error) {
    if (error instanceof RangeError) return res.status(422).json({ success: false, message: error.message });
    console.error('Profile update error:', error);
    return res.status(500).json({ success: false, message: 'Failed to save your profile.' });
  }
});

// POST /api/auth/me/password {current_password, new_password} - change the password
router.post('/me/password', authenticateToken, requireMysql, async (req, res) => {
  try {
    const { current_password: current, new_password: next } = req.body || {};
    if (!current || !next) return res.status(400).json({ success: false, message: 'Enter your current and new password.' });
    if (String(next).length < MIN_PASSWORD_LENGTH) {
      return res.status(422).json({ success: false, message: `Your new password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    }
    const [users] = await db.query('SELECT id, password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!users.length) return res.status(404).json({ success: false, message: 'User not found.' });
    if (!(await bcrypt.compare(current, users[0].password_hash))) {
      // 422, not 401, so the client does not sign out
      return res.status(422).json({ success: false, message: 'Your current password is not right. Nothing was changed.' });
    }
    const hash = await bcrypt.hash(String(next), 10);
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
    return res.json({ success: true, message: 'Password changed.' });
  } catch (error) {
    console.error('Password change error:', error);
    return res.status(500).json({ success: false, message: 'Failed to change your password.' });
  }
});

// GET /api/auth/me/export - everything stored about the user, as a JSON download (PDPA 2010 access)
router.get('/me/export', authenticateToken, requireMysql, async (req, res) => {
  try {
    const data = await exportUserData(req.user.id);
    if (!data.user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.set('Content-Disposition', `attachment; filename="finsight-data-${new Date().toLocaleDateString('en-CA')}.json"`);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Export error:', error);
    return res.status(500).json({ success: false, message: 'Failed to prepare your data.' });
  }
});

// DELETE /api/auth/me { password } - deletes the account and all its data, after the password is confirmed
router.delete('/me', authenticateToken, requireMysql, async (req, res) => {
  try {
    const password = req.body?.password;
    if (!password) return res.status(400).json({ success: false, message: 'Enter your password to delete your account.' });
    const [users] = await db.query('SELECT id, password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!users.length) return res.status(404).json({ success: false, message: 'User not found.' });
    if (!(await bcrypt.compare(password, users[0].password_hash))) {
      // 422, not 401: the session is fine, and the client signs out on 401
      return res.status(422).json({ success: false, message: 'That password is not right. Your account has not been deleted.' });
    }
    const removed = await deleteUserData(req.user.id);
    return res.json({ success: true, message: 'Your account and all its data have been deleted.', data: { removed } });
  } catch (error) {
    console.error('Delete account error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete your account. Nothing was removed.' });
  }
});

module.exports = router;
