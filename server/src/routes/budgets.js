/**
 * FinSight AI - Budgets Management Routes
 * Supports predefined and custom budget categories
 */

const express = require('express');
const db = require('../db');
const authenticateToken = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// GET /api/budgets
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const month = parseInt(req.query.month, 10) || now.getMonth() + 1;
    const year = parseInt(req.query.year, 10) || now.getFullYear();

    const [budgets] = await db.query(
      'SELECT id, category, budget_limit, month, year, updated_at FROM budgets WHERE user_id = ? AND month = ? AND year = ?',
      [userId, month, year]
    );

    // Also get all distinct categories that have appeared in user's transactions
    const [txnCats] = await db.query(
      'SELECT DISTINCT category FROM transactions WHERE user_id = ?',
      [userId]
    );

    const usedCategories = (txnCats || [])
      .map((r) => r.category)
      .filter((c) => c && c !== 'Income');

    return res.json({
      success: true,
      budgets: budgets || [],
      usedCategories,
    });
  } catch (error) {
    console.error('Budgets fetch error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch budgets.' });
  }
});

// POST /api/budgets
// Set or update budget limit for any predefined or custom category
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { category, budget_limit, month, year } = req.body;

    if (!category || !String(category).trim() || budget_limit === undefined) {
      return res.status(400).json({ success: false, message: 'Category name and budget limit are required.' });
    }

    if (!(parseFloat(budget_limit) > 0)) {
      return res.status(400).json({ success: false, message: 'Budget limit must be more than RM 0.' });
    }

    const cleanCategory = String(category).trim();
    const now = new Date();
    const targetMonth = parseInt(month, 10) || now.getMonth() + 1;
    const targetYear = parseInt(year, 10) || now.getFullYear();
    const limit = Math.max(0, parseFloat(budget_limit) || 0);

    // Upsert budget limit
    await db.query(
      `INSERT INTO budgets (user_id, category, budget_limit, month, year)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE budget_limit = VALUES(budget_limit), updated_at = CURRENT_TIMESTAMP`,
      [userId, cleanCategory, limit, targetMonth, targetYear]
    );

    return res.json({
      success: true,
      message: `Budget for "${cleanCategory}" set to RM ${limit.toFixed(2)}.`,
      budget: {
        category: cleanCategory,
        budget_limit: limit,
        month: targetMonth,
        year: targetYear,
      },
    });
  } catch (error) {
    console.error('Budget save error:', error);
    return res.status(500).json({ success: false, message: 'Failed to save budget.' });
  }
});

// DELETE /api/budgets/:id
// Remove a budget target
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const budgetId = parseInt(req.params.id, 10);

    const [result] = await db.query(
      'DELETE FROM budgets WHERE id = ? AND user_id = ?',
      [budgetId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Budget limit not found.' });
    }

    return res.json({
      success: true,
      message: 'Budget limit successfully removed.',
    });
  } catch (error) {
    console.error('Budget delete error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete budget limit.' });
  }
});

module.exports = router;
