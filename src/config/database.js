// ═══════════════════════════════════════════════════════
// LedgerFlow Database Module (ESM Version)
// File: src/config/database.js
// Compatible with Node 20 + "type": "module"
// ═══════════════════════════════════════════════════════

import "dotenv/config"
import pkg from "pg"

const { Pool } = pkg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === "true"
    ? { rejectUnauthorized: false }
    : false
})

pool.on("connect", () => {
  console.log("🗄️ Database connected")
})

pool.on("error", (err) => {
  console.error("❌ Database error:", err.message)
})



// ─────────────────────────────────────────
// QUERY
// ─────────────────────────────────────────
export async function query(sql, params = []) {
  const res = await pool.query(sql, params)
  return res
}



// ─────────────────────────────────────────
// GET ONE
// ─────────────────────────────────────────
export async function getOne(sql, params = []) {
  const res = await pool.query(sql, params)
  return res.rows[0] || null
}



// ─────────────────────────────────────────
// GET MANY
// ─────────────────────────────────────────
export async function getMany(sql, params = []) {
  const res = await pool.query(sql, params)
  return res.rows
}



// ─────────────────────────────────────────
// TRANSACTION
// ─────────────────────────────────────────
export async function transaction(callback) {

  const client = await pool.connect()

  try {

    await client.query("BEGIN")

    const result = await callback(client)

    await client.query("COMMIT")

    return result

  } catch (err) {

    await client.query("ROLLBACK")

    throw err

  } finally {

    client.release()

  }

}