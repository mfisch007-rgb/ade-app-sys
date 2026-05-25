import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

/* ─────────────────────────────────────────────
   DATABASE POOL
───────────────────────────────────────────── */

const pool = new Pool({

  connectionString: process.env.DATABASE_URL,

  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false
});

/* ─────────────────────────────────────────────
   QUERY HELPERS
───────────────────────────────────────────── */

async function query(text, params = []) {

  const result = await pool.query(text, params);

  return result;
}

async function getOne(text, params = []) {

  const result = await pool.query(text, params);

  return result.rows[0] || null;
}

async function getMany(text, params = []) {

  const result = await pool.query(text, params);

  return result.rows;
}

async function insert(text, params = []) {

  const result = await pool.query(text, params);

  return result.rows[0];
}

/* ─────────────────────────────────────────────
   EXPORTS
───────────────────────────────────────────── */

const db = {
  query,
  getOne,
  getMany,
  insert,
  pool
};

export {
  query,
  getOne,
  getMany,
  insert,
  pool
};

export default db;