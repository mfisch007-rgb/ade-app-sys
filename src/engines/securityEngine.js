// ═══════════════════════════════════════════════════════════
// LedgerFlow — Security Engine (FINAL MERGED VERSION)
// File: src/engines/securityEngine.js
//
// FIXES:
//   FATAL-01: isRateLimited() restored (in-memory, fast)
//   FATAL-15: generateSubscriptionSignature() restored
//   FATAL-16: verifyGatewayWebhook() restored
//   FATAL-17: createAdminAlert() restored
//   MERGED:   hashPIN, verifyPIN, generateApiKey, validateApiKey
//             updateRiskScore, logSecurityEvent, detectAgentFraud
// ═══════════════════════════════════════════════════════════
require('dotenv').config();
const crypto = require('crypto');
const db     = require('../config/database');

let bcrypt = null;
try {
  bcrypt = require('bcrypt');
} catch {
  console.warn('⚠️  bcrypt not installed — PIN features disabled. Run: npm install bcrypt');
}

const SECRET_SALT = process.env.SUBSCRIPTION_SALT || 'ledgerflow-default-salt';

// ─────────────────────────────────────────────────────────────
// RATE LIMITING (in-memory — fast, no DB round-trip)
// FATAL-01 FIX: isRateLimited() was missing from new code
// ─────────────────────────────────────────────────────────────
const rateLimitMap = new Map();

function isRateLimited(phone) {
  const now        = Date.now();
  const windowMs   = (parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS) || 60) * 1000;
  const maxMessages = parseInt(process.env.RATE_LIMIT_MESSAGES) || 10;
  const history    = rateLimitMap.get(phone) || [];
  const recent     = history.filter(ts => now - ts < windowMs);

  if (recent.length >= maxMessages) return true;

  recent.push(now);
  rateLimitMap.set(phone, recent);

  // Clean up old entries every 1000 phones to prevent memory leak
  if (rateLimitMap.size > 1000) {
    for (const [key, val] of rateLimitMap) {
      if (val.every(ts => now - ts > windowMs)) {
        rateLimitMap.delete(key);
      }
    }
  }
  return false;
}

/** DB-based rate check (for admin API endpoints) */
async function checkRateLimit(phone) {
  const windowSeconds = parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS) || 60;
  const maxMessages   = parseInt(process.env.RATE_LIMIT_MESSAGES) || 10;

  const result = await db.getOne(`
    SELECT COUNT(*) AS count FROM command_logs
    WHERE phone=$1 AND created_at > NOW() - INTERVAL '${windowSeconds} seconds'
  `, [phone]);

  const count = parseInt(result?.count || 0);
  return { limited: count >= maxMessages, count, limit: maxMessages };
}

// ─────────────────────────────────────────────────────────────
// IP BLOCKING
// ─────────────────────────────────────────────────────────────
async function isBlocked(ip) {
  try {
    const row = await db.getOne(
      `SELECT id FROM blocked_ips
       WHERE ip_address=$1 AND (expires_at IS NULL OR expires_at > NOW())`,
      [ip]
    );
    return !!row;
  } catch { return false; }
}

async function blockIP(ip, reason, expiresAt = null) {
  await db.query(
    `INSERT INTO blocked_ips(ip_address, reason, expires_at)
     VALUES($1,$2,$3) ON CONFLICT(ip_address) DO UPDATE SET reason=$2`,
    [ip, reason, expiresAt]
  );
}

// ─────────────────────────────────────────────────────────────
// PIN MANAGEMENT (bcrypt-based)
// ─────────────────────────────────────────────────────────────
async function hashPIN(pin) {
  if (!bcrypt) throw new Error('bcrypt not installed');
  return bcrypt.hash(pin + (process.env.PIN_PEPPER || ''), 12);
}

async function verifyPIN(input, storedHash) {
  if (!bcrypt) throw new Error('bcrypt not installed');
  return bcrypt.compare(input + (process.env.PIN_PEPPER || ''), storedHash);
}

// ─────────────────────────────────────────────────────────────
// SUBSCRIPTION SIGNATURE (HMAC — tamper-proof payment records)
// FATAL-15 FIX: generateSubscriptionSignature() was missing
// ─────────────────────────────────────────────────────────────
function generateSubscriptionSignature(client_id, plan, start_date, end_date) {
  const data = `${client_id}|${plan}|${start_date}|${end_date}`;
  return crypto.createHmac('sha256', SECRET_SALT).update(data).digest('hex');
}

// ─────────────────────────────────────────────────────────────
// PAYMENT WEBHOOK VERIFICATION
// FATAL-16 FIX: verifyGatewayWebhook() was missing
// Used for Paystack, Flutterwave, and future ADE payment system
// ─────────────────────────────────────────────────────────────
function verifyGatewayWebhook(rawBody, receivedSignature, secretKey) {
  const expected = crypto
    .createHmac('sha256', secretKey)
    .update(rawBody)
    .digest('hex');
  return expected === receivedSignature;
}

// ─────────────────────────────────────────────────────────────
// API KEY MANAGEMENT
// Needed for future ADE API access
// ─────────────────────────────────────────────────────────────
async function generateApiKey(clientId, label = 'default') {
  const rawKey    = crypto.randomBytes(40).toString('hex');
  const hash      = crypto.createHash('sha256').update(rawKey).digest('hex');
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  await db.query(
    `INSERT INTO api_keys(client_id, api_key_hash, label, active, expires_at)
     VALUES($1,$2,$3,true,$4)`,
    [clientId, hash, label, expiresAt]
  );
  return rawKey;   // Return raw key ONCE — never stored in plain text
}

async function validateApiKey(rawKey) {
  const hash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const key  = await db.getOne(
    `SELECT * FROM api_keys
     WHERE api_key_hash=$1 AND active=true
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [hash]
  );
  if (!key) return null;
  await db.query(`UPDATE api_keys SET last_used_at=NOW() WHERE id=$1`, [key.id]);
  return key;
}

// ─────────────────────────────────────────────────────────────
// RISK SCORING
// ─────────────────────────────────────────────────────────────
async function updateRiskScore(phone, points) {
  try {
    await logSecurityEvent(phone, 'RISK_SCORE_UPDATE', null, points);
    
    const recentScore = await db.getOne(`
      SELECT COALESCE(SUM(risk_score), 0) AS total
      FROM security_logs
      WHERE phone=$1 AND created_at > NOW() - INTERVAL '24 hours'
    `, [phone]);

    const totalScore = parseInt(recentScore?.total || 0) + points;
    const threshold  = 50;

    if (totalScore >= threshold) {
      console.warn(`⚠️  High risk score (${totalScore}) for ${phone}`);
      await createAdminAlert(
        `⚠️ HIGH RISK ACTIVITY\nPhone: ${phone}\n24hr Risk Score: ${totalScore}\nThreshold: ${threshold}`
      );
    }
  } catch (err) {
    console.error('Risk score update failed:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// ADMIN ALERTS
// FATAL-17 FIX: createAdminAlert() was missing from new code
// detectAgentFraud() called it but it didn't exist → crash
// ─────────────────────────────────────────────────────────────
async function createAdminAlert(message) {
  try {
    // Queue alert to admin phone
    const adminPhone = process.env.ADMIN_PHONE?.replace(/\D/g, '');
    if (adminPhone) {
      await db.query(
        `INSERT INTO notifications(phone, message, notification_type, status)
         VALUES($1,$2,'admin_alert','pending')`,
        [adminPhone, `🚨 ADMIN ALERT\n${message}`]
      );
    }
    console.warn('🚨 ADMIN ALERT:', message);
  } catch (err) {
    console.error('createAdminAlert failed:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// SECURITY EVENT LOGGING
// ─────────────────────────────────────────────────────────────
async function logSecurityEvent(phone, action, ip = null, riskScore = 0) {
  try {
    await db.query(
      `INSERT INTO security_logs(phone, action, ip_address, risk_score)
       VALUES($1,$2,$3,$4)`,
      [phone, action, ip, riskScore]
    );
  } catch (err) {
    console.error('Security log failed:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// AGENT FRAUD DETECTION
// ─────────────────────────────────────────────────────────────
const ALERT_THRESHOLDS = {
  DUPLICATE_WINDOW_MINUTES: 2,
  SPIKE_MULTIPLIER:         5,
  MAX_SINGLE_TRANSACTION:   500_000,
  MAX_HOURLY_TRANSACTIONS:  30,
};

async function detectAgentFraud(agentId) {
  try {
    const agent = await db.getOne(
      `SELECT a.*, c.phone AS client_phone FROM agents a
       JOIN clients c ON a.client_id = c.id WHERE a.agent_id=$1`,
      [agentId]
    );
    if (!agent) return;

    const alerts = [];

    // Duplicate transactions in 2 minutes
    const duplicates = await db.getMany(`
      SELECT type, amount, item, COUNT(*) AS cnt
      FROM transactions
      WHERE client_id=(SELECT client_id FROM agents WHERE agent_id=$1)
        AND created_at > NOW() - INTERVAL '${ALERT_THRESHOLDS.DUPLICATE_WINDOW_MINUTES} minutes'
      GROUP BY type, amount, item HAVING COUNT(*)>1
    `, [agentId]);

    if (duplicates.length > 0) {
      alerts.push({ type:'DUPLICATE_TRANSACTION', severity:'medium',
        description:`${duplicates.length} duplicate(s) in ${ALERT_THRESHOLDS.DUPLICATE_WINDOW_MINUTES} min` });
    }

    // High hourly volume
    const hourlyCount = await db.getOne(`
      SELECT COUNT(*) AS count FROM transactions
      WHERE client_id=(SELECT client_id FROM agents WHERE agent_id=$1)
        AND created_at > NOW() - INTERVAL '1 hour'
    `, [agentId]);

    if (parseInt(hourlyCount.count) > ALERT_THRESHOLDS.MAX_HOURLY_TRANSACTIONS) {
      alerts.push({ type:'HIGH_VOLUME', severity:'high',
        description:`${hourlyCount.count} transactions in 1 hour` });
    }

    // Record and notify
    for (const alert of alerts) {
      await db.query(`
        INSERT INTO fraud_alerts(client_id, agent_id, alert_type, description, severity)
        SELECT client_id,$1,$2,$3,$4 FROM agents WHERE agent_id=$1
      `, [agentId, alert.type, alert.description, alert.severity]);

      if (['high','critical'].includes(alert.severity)) {
        await createAdminAlert(
          `Fraud [${alert.severity.toUpperCase()}]\nAgent: ${agent.name || agentId}\nClient: ${agent.client_phone}\n${alert.description}`
        );
      }
    }
    return alerts;
  } catch (err) {
    console.error('detectAgentFraud failed:', err.message);
    return [];
  }
}

module.exports = {
  // Rate limiting
  isRateLimited,
  checkRateLimit,
  // IP blocking
  isBlocked,
  blockIP,
  // PIN
  hashPIN,
  verifyPIN,
  // Payment & subscription integrity
  generateSubscriptionSignature,
  verifyGatewayWebhook,
  // API keys
  generateApiKey,
  validateApiKey,
  // Risk & fraud
  updateRiskScore,
  detectAgentFraud,
  // Logging & alerts
  logSecurityEvent,
  createAdminAlert,
};
