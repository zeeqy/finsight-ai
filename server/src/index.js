/**
 * FinSight AI - Main Express Server Entry Point
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDatabase, isUsingFallback, fallbackAllowed } = require('./db');
const { isProduction, trustProxySetting, corsOptions, securityHeaders } = require('./middleware/security');

// Route Handlers
const authRoutes = require('./routes/auth');
const transactionRoutes = require('./routes/transactions');
const budgetRoutes = require('./routes/budgets');
const advisorRoutes = require('./routes/advisor');
const loanRoutes = require('./routes/loan');
const goalRoutes = require('./routes/goals');
const insuranceRoutes = require('./routes/insurance');
const commitmentRoutes = require('./routes/commitments');
const profileRoutes = require('./routes/profile');
const { checkMlHealth } = require('./services/mlClient');

const app = express();
const PORT = process.env.PORT || 5000;

// The built React app (client/dist). Served by Express when it exists, so the site is one address
// and the ML service never has to be public. CLIENT_DIST can point elsewhere.
const CLIENT_DIST = process.env.CLIENT_DIST || path.join(__dirname, '..', '..', 'client', 'dist');
const CLIENT_INDEX = path.join(CLIENT_DIST, 'index.html');
const serveClient = process.env.SERVE_CLIENT === 'false' ? false : fs.existsSync(CLIENT_INDEX) && (isProduction || process.env.SERVE_CLIENT === 'true');

app.set('trust proxy', trustProxySetting()); // real visitor IPs behind Caddy, for the sign-in and sign-up limits
app.disable('x-powered-by');
app.use(securityHeaders({ indexHtmlPath: CLIENT_INDEX }));
app.use('/api', cors(corsOptions));

app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: true, limit: '200kb' }));

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const ml = await checkMlHealth();
  res.json({
    status: 'online',
    app: 'FinSight AI Backend API',
    version: '1.0.0',
    database: isUsingFallback() ? 'local_resilient_store' : 'mysql',
    ml_service: ml.online ? 'online' : 'offline',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/advisor', advisorRoutes);
app.use('/api/loan', loanRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/insurance', insuranceRoutes);
app.use('/api/commitments', commitmentRoutes);
app.use('/api/profile', profileRoutes);

// Global 404 handler
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, message: 'API endpoint not found.' });
});

if (serveClient) {
  // Hashed files under /assets never change, so browsers may keep them for a year; index.html is always re-checked
  app.use(
    express.static(CLIENT_DIST, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) res.set('Cache-Control', 'public, max-age=31536000, immutable');
      },
    })
  );
  app.get('*', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(CLIENT_INDEX);
  });
}

// Error handling middleware: a bad JSON body or a too-large request gets its own status; anything
// unexpected is logged and the client gets a plain message (no internal details in production)
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('[FinSight AI Server Error]:', err);
  const message =
    err.type === 'entity.too.large'
      ? 'That request is too large.'
      : err.type === 'entity.parse.failed'
        ? 'The request body is not valid JSON.'
        : status >= 500 && isProduction
          ? 'Something went wrong on the server. Try again.'
          : err.message || 'Internal Server Error';
  res.status(status).json({ success: false, message });
});

// Boot server and connect database
// In production MySQL may start after this server (Docker), so keep trying for a while instead of
// falling back to the JSON file; give up with an error the host's logs will show.
async function connectDatabase() {
  const attempts = fallbackAllowed() ? 1 : parseInt(process.env.DB_CONNECT_ATTEMPTS, 10) || 20;
  for (let i = 1; ; i++) {
    try {
      return await initDatabase();
    } catch (err) {
      if (i >= attempts) {
        console.error(`[FinSight AI DB] MySQL is unreachable after ${attempts} attempts. Stopping.`);
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

async function startServer() {
  await connectDatabase();

  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 FinSight AI Server running on http://localhost:${PORT}`);
    console.log(`📊 Mode: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔐 JWT Auth: Active`);
    if (serveClient) console.log(`🌐 Serving the web app from ${CLIENT_DIST}`);
    console.log(`======================================================\n`);
  });
}

startServer();
