/**
 * FinSight AI - JWT Authentication Middleware
 */

const jwt = require('jsonwebtoken');
const db = require('../db');

// No fallback secret: a secret in the source code would let anyone forge tokens
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set in server/.env (at least 32 characters).');
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  // Support both "Bearer <token>" and raw token
  const token = authHeader && (authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No authentication token provided.',
    });
  }

  jwt.verify(token, JWT_SECRET, async (err, decodedUser) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: 'Invalid or expired token. Please log in again.',
      });
    }

    // A valid signature is not enough: the account must still exist, and a password change since this
    // sign-in (token_version raised) ends it. One primary-key lookup per request.
    // Skipped on the local JSON fallback store: password change and account deletion are MySQL-only, so
    // nothing there can end a sign-in, and production refuses to start without MySQL.
    if (db.isUsingFallback()) {
      req.user = decodedUser;
      return next();
    }
    try {
      const [rows] = await db.query('SELECT token_version FROM users WHERE id = ?', [decodedUser.id]);
      if (!rows || !rows.length) {
        return res.status(401).json({ success: false, code: 'ACCOUNT_GONE', message: 'This account no longer exists. Please sign in again.' });
      }
      if (Number(rows[0].token_version || 0) !== Number(decodedUser.tv || 0)) {
        return res.status(401).json({
          success: false,
          code: 'SIGNED_OUT',
          message: 'You were signed out because the password was changed. Please sign in again.',
        });
      }
    } catch (dbErr) {
      console.error('Auth check error:', dbErr.message);
      return res.status(503).json({ success: false, message: 'The service is busy. Please try again in a moment.' });
    }

    req.user = decodedUser; // { id, email, full_name, tv }
    next();
  });
}

/** The sign-in token for a user row; `tv` is the user's token_version at sign-in. */
function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, full_name: user.full_name, tv: Number(user.token_version || 0) },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

module.exports = authenticateToken;
module.exports.JWT_SECRET = JWT_SECRET;
module.exports.JWT_EXPIRES_IN = JWT_EXPIRES_IN;
module.exports.signToken = signToken;
