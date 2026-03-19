// ═══════════════════════════════════════════════════════════
// LedgerFlow — Main Server (FINAL VERSION)
// File: src/server.js
// Uses route files from src/routes/ (was inline before)
// ═══════════════════════════════════════════════════════════
require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────
app.use(cors());
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }   // needed for webhook signature verification
}));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  // Skip logging for health pings to keep logs clean
  if (req.path !== '/ping' && req.path !== '/health') {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  }
  next();
});

// ─── Health / Uptime endpoints ────────────────────────────
// UptimeRobot pings /ping every 5 minutes
app.get('/ping', (req, res) => res.send('pong'));

app.get('/health', async (req, res) => {
  const db = require('./config/database');
  const { isConnected } = require('./whatsapp/whatsappClient');
  const dbOk = await db.testConnection().catch(() => false);

  res.json({
    status:    'LedgerFlow is running',
    version:   '1.0.0',
    timestamp: new Date().toISOString(),
    services: {
      database:  dbOk ? 'connected' : 'disconnected',
      whatsapp:  isConnected() ? 'connected' : 'disconnected',
    },
  });
});

app.get('/', (req, res) => {
  res.json({
    name:    'LedgerFlow AaaS',
    tagline: 'WhatsApp bookkeeping for Nigerian small businesses',
    status:  'online',
    docs:    ['/health', '/ping', '/api/admin/stats', '/api/admin/clients'],
  });
});

// ─── Routes (from src/routes/) ────────────────────────────
const adminRoutes    = require('./routes/admin');
const whatsappRoutes = require('./routes/whatsapp');

app.use('/api/admin',    adminRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/payments', whatsappRoutes);    // payment webhooks on same router

// ─── Error Handlers ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('🔴 Server error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
});

// ─── Startup ──────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║       🚀 LEDGERFLOW SERVER STARTING        ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log(`📡 Port:    ${PORT}`);
  console.log(`🌍 Env:     ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health:  http://localhost:${PORT}/health`);
  console.log(`🏓 Ping:    http://localhost:${PORT}/ping\n`);

  // 1. Test DB
  const db = require('./config/database');
  const dbOk = await db.testConnection();
  if (!dbOk) {
    console.error('❌ FATAL: Database connection failed. Check .env DB_ variables.');
    console.error('   Continuing startup — will retry on next query.');
  }

  // 2. Start scheduler
  const { startScheduler } = require('./scheduler');
  startScheduler();

  // 3. Start WhatsApp
  try {
    const { startWhatsApp } = require('./whatsapp/whatsappClient');
    await startWhatsApp();
  } catch (err) {
    console.error('❌ WhatsApp failed to start:', err.message);
    console.error('   Check: npm install @whiskeysockets/baileys');
  }
});

// ─── Graceful Shutdown ────────────────────────────────────
async function shutdown(signal) {
  console.log(`\n🛑 ${signal} received — shutting down gracefully...`);
  const db = require('./config/database');
  await db.close().catch(() => {});
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

module.exports = app;
