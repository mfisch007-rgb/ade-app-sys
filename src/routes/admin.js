// ═══════════════════════════════════════════════════════════
// LedgerFlow — Admin Routes
// File: src/routes/admin.js
// FIXES: FATAL-19 — routes folder was empty
// ═══════════════════════════════════════════════════════════
const express = require('express');
const router  = express.Router();
const db      = require('../config/database');
const { activateSubscription } = require('../engines/subscriptionEngine');
const { generateApiKey }       = require('../engines/securityEngine');

// ─── Auth middleware ──────────────────────────────────────
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!key || key !== process.env.JWT_SECRET) {
    return res.status(401).json({ error: 'Unauthorized — provide x-admin-key header' });
  }
  next();
}

router.use(requireAdmin);

// ─── GET /api/admin/stats ─────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const stats = await db.getOne(`
      SELECT
        COUNT(*) FILTER (WHERE status='active')  AS active,
        COUNT(*) FILTER (WHERE status='trial')   AS trial,
        COUNT(*) FILTER (WHERE status='expired') AS expired,
        COUNT(*) FILTER (WHERE last_activity_at > NOW()-INTERVAL '24 hours') AS active_today,
        SUM(total_transactions) AS total_transactions
      FROM clients
    `);
    const mrr = await db.getOne(`
      SELECT
        COUNT(*) FILTER (WHERE plan='MICRO') * 5000  AS micro_mrr,
        COUNT(*) FILTER (WHERE plan='PRO')   * 10000 AS pro_mrr,
        COUNT(*) FILTER (WHERE plan='SME')   * 25000 AS sme_mrr
      FROM clients WHERE status='active'
    `);
    const total_mrr = (parseInt(mrr.micro_mrr||0)) + (parseInt(mrr.pro_mrr||0)) + (parseInt(mrr.sme_mrr||0));
    res.json({ clients: stats, revenue: { ...mrr, total_mrr } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/admin/clients ───────────────────────────────
router.get('/clients', async (req, res) => {
  try {
    const { status, plan, limit = 50 } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (status) { params.push(status); where += ` AND status=$${params.length}`; }
    if (plan)   { params.push(plan);   where += ` AND plan=$${params.length}`; }
    params.push(parseInt(limit));

    const clients = await db.getMany(`
      SELECT id, phone, business_name, owner_name, plan, status,
             streak_count, health_score, total_transactions,
             trial_ends_at, subscription_expires_at, last_activity_at, created_at
      FROM clients ${where}
      ORDER BY created_at DESC LIMIT $${params.length}
    `, params);
    res.json({ count: clients.length, clients });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/admin/clients/:phone ───────────────────────
router.get('/clients/:phone', async (req, res) => {
  try {
    const client = await db.getOne(`SELECT * FROM clients WHERE phone=$1`, [req.params.phone]);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const today = await db.getOne(`
      SELECT
        COALESCE(SUM(CASE WHEN type='SALE'    THEN amount END),0) AS sales,
        COALESCE(SUM(CASE WHEN type='EXPENSE' THEN amount END),0) AS expenses,
        COUNT(*) AS tx_count
      FROM transactions
      WHERE client_id=$1 AND DATE(created_at AT TIME ZONE 'Africa/Lagos')=CURRENT_DATE
    `, [client.id]);

    const openCredits = await db.getOne(
      `SELECT COUNT(*) AS count, COALESCE(SUM(balance_owed),0) AS total FROM credits WHERE client_id=$1 AND status IN ('open','partial')`,
      [client.id]
    );

    res.json({ client, today, open_credits: openCredits });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/admin/clients ─────────────────────────────
router.post('/clients', async (req, res) => {
  try {
    const { phone, business_name, owner_name, plan = 'trial', language = 'en' } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone is required' });

    const clean = phone.replace(/\D/g, '');
    const client = await db.insert(`
      INSERT INTO clients(phone, business_name, owner_name, plan, status, language)
      VALUES($1,$2,$3,$4,'trial',$5)
      ON CONFLICT(phone) DO UPDATE SET
        business_name=EXCLUDED.business_name, updated_at=NOW()
      RETURNING *
    `, [clean, business_name, owner_name, plan, language]);

    // Send welcome message (non-blocking)
    const { isConnected, sendWhatsAppMessage } = require('../whatsapp/whatsappClient');
    if (isConnected()) {
      sendWhatsAppMessage(clean,
        `👋 *Welcome to LedgerFlow!*\n` +
        (business_name ? `🏪 ${business_name}\n\n` : '\n') +
        `You have *14 days FREE* to track your business!\n\n` +
        `*Quick Start:*\nSALE 5000 RICE\nEXPENSE 1200 FUEL\nBAL\n\n` +
        `Type *HELP* for all commands 📖\n\n_LedgerFlow — Your business, tracked._ 🚀`
      ).catch(err => console.error('Welcome msg failed:', err.message));
    }

    res.json({ success: true, client });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/admin/clients/:phone/activate ─────────────
router.post('/clients/:phone/activate', async (req, res) => {
  try {
    const { plan = 'MICRO', months = 1 } = req.body;
    const client = await activateSubscription(req.params.phone, plan, parseInt(months));
    res.json({ success: true, client });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/admin/message ─────────────────────────────
router.post('/message', async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ error: 'phone and message required' });
    const { sendWhatsAppMessage } = require('../whatsapp/whatsappClient');
    await sendWhatsAppMessage(phone, message);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/admin/support-tickets ──────────────────────
router.get('/support-tickets', async (req, res) => {
  try {
    const tickets = await db.getMany(`
      SELECT st.*, c.business_name, c.phone AS client_phone
      FROM support_tickets st
      LEFT JOIN clients c ON st.client_id = c.id
      WHERE st.status='open'
      ORDER BY st.created_at DESC LIMIT 50
    `);
    res.json({ count: tickets.length, tickets });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/admin/fraud-alerts ─────────────────────────
router.get('/fraud-alerts', async (req, res) => {
  try {
    const alerts = await db.getMany(`
      SELECT fa.*, c.phone, c.business_name
      FROM fraud_alerts fa
      LEFT JOIN clients c ON fa.client_id=c.id
      WHERE fa.resolved=false
      ORDER BY fa.created_at DESC LIMIT 50
    `);
    res.json({ count: alerts.length, alerts });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/admin/clients/:phone/apikey ───────────────
router.post('/clients/:phone/apikey', async (req, res) => {
  try {
    const client = await db.getOne(`SELECT * FROM clients WHERE phone=$1`, [req.params.phone]);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const rawKey = await generateApiKey(client.id, req.body.label || 'default');
    res.json({ success: true, api_key: rawKey, warning: 'Store this key — it will not be shown again!' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
