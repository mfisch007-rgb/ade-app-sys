// ═══════════════════════════════════════════════════════════
// LedgerFlow — Database Configuration
// File: src/config/database.js
// FIX: BUG 001 (wrong host) + BUG 004 (special chars in password)
// Uses individual params so @ $ # in password never break anything
// ═══════════════════════════════════════════════════════════
require('dotenv').config();
const { Pool } = require('pg');

// ─────────────────────────────────────────────────────────────
// Connection config
// We prefer individual params over connection string
// because the password contains special URL characters (@ $ #)
// that silently break connection string parsing.
// ─────────────────────────────────────────────────────────────
function buildPoolConfig() {
  // If individual env vars are set, use them (safest for special chars)
  if (process.env.DB_HOST) {
    return {
      host:     process.env.DB_HOST,
      port:     parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'postgres',
      user:     process.env.DB_USER,
      password: process.env.DB_PASSWORD,          // pg handles this safely
      ssl:      { rejectUnauthorized: false },
      max:      10,
      idleTimeoutMillis:    30_000,
      connectionTimeoutMillis: 10_000,
    };
  }

  // Fallback: use DATABASE_URL (password must be URL-encoded)
  return {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis:    30_000,
    connectionTimeoutMillis: 10_000,
  };
}

const pool = new Pool(buildPoolConfig());

// ─────────────────────────────────────────────────────────────
// Pool event handlers
// ─────────────────────────────────────────────────────────────
pool.on('connect', (client) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('🟢 DB: New connection established');
  }
});

pool.on('error', (err) => {
  console.error('🔴 DB Pool error:', err.message);
  // Don't crash — pool will retry
});

// ─────────────────────────────────────────────────────────────
// Database helper methods
// ─────────────────────────────────────────────────────────────
const db = {
  /**
   * Run any SQL query
   * @param {string} text - SQL string with $1, $2 placeholders
   * @param {Array}  params - Values for placeholders
   */
  query: async (text, params = []) => {
    const start = Date.now();
    try {
      const result = await pool.query(text, params);
      if (process.env.NODE_ENV === 'development') {
        const ms = Date.now() - start;
        if (ms > 500) console.warn(`⚠️  Slow query (${ms}ms):`, text.substring(0, 80));
      }
      return result;
    } catch (err) {
      console.error('🔴 DB Query error:', err.message);
      if (process.env.NODE_ENV === 'development') {
        console.error('Query:', text);
        console.error('Params:', params);
      }
      throw err;
    }
  },

  /** Return first row or null */
  getOne: async (text, params = []) => {
    const result = await db.query(text, params);
    return result.rows[0] || null;
  },

  /** Return all rows */
  getMany: async (text, params = []) => {
    const result = await db.query(text, params);
    return result.rows;
  },

  /** INSERT … RETURNING * → returns inserted row */
  insert: async (text, params = []) => {
    const result = await db.query(text, params);
    return result.rows[0] || null;
  },

  /** Run multiple queries in a transaction */
  transaction: async (callback) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /** Test the connection — used at startup */
  testConnection: async () => {
    try {
      const result = await pool.query('SELECT NOW() AS now, version() AS ver');
      console.log('✅ DB connected:', result.rows[0].now);
      return true;
    } catch (err) {
      console.error('❌ DB connection FAILED:', err.message);
      console.error('   Check your DB_HOST / DATABASE_URL in .env');
      return false;
    }
  },

  /** Graceful shutdown */
  close: async () => {
    await pool.end();
    console.log('🔌 DB pool closed');
  }
};

module.exports = db;
