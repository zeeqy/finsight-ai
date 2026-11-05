/**
 * FinSight AI - JWT Authentication Middleware
 */

const jwt = require('jsonwebtoken');

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

  jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: 'Invalid or expired token. Please log in again.',
      });
    }

    req.user = decodedUser; // { id, email, full_name }
    next();
  });
}

module.exports = authenticateToken;
module.exports.JWT_SECRET = JWT_SECRET;
module.exports.JWT_EXPIRES_IN = JWT_EXPIRES_IN;
