import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  ssl:
    process.env.DB_SSL === "true"
      ? { rejectUnauthorized: false }
      : false,

  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err) => {
  console.error("[DB ERROR]", err.message);
});

const db = {

  async query(text, params = []) {
    const result = await pool.query(text, params);
    return result;
  },

  async getOne(text, params = []) {
    const result = await pool.query(text, params);
    return result.rows[0] || null;
  },

  async getMany(text, params = []) {
    const result = await pool.query(text, params);
    return result.rows;
  },

  async insert(text, params = []) {
    const result = await pool.query(text, params);
    return result.rows[0];
  },

  async transaction(callback) {

    const client = await pool.connect();

    try {

      await client.query("BEGIN");

      const tx = {

        query: (text, params = []) =>
          client.query(text, params),

        getOne: async (text, params = []) => {
          const result = await client.query(text, params);
          return result.rows[0] || null;
        },

        getMany: async (text, params = []) => {
          const result = await client.query(text, params);
          return result.rows;
        },

      };

      const result = await callback(tx);

      await client.query("COMMIT");

      return result;

    } catch (err) {

      await client.query("ROLLBACK");

      console.error("[DB TRANSACTION ERROR]", err.message);

      throw err;

    } finally {

      client.release();

    }
  },

  pool,
};

export default db;