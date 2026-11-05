/**
 * Modules 3-5 are MySQL-only (the JSON fallback store does not mirror their queries).
 */
const db = require('../db');

module.exports = function requireMysql(req, res, next) {
  if (db.isUsingFallback()) {
    return res.status(503).json({
      success: false,
      message: 'This module needs MySQL. Start MySQL in XAMPP and restart the server.',
    });
  }
  next();
};
