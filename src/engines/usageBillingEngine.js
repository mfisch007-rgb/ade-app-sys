import db from "../config/database.js";

export async function checkUsageUpgrade(clientId) {

  try {

    const client = await db.getOne(
      `SELECT id, phone, plan FROM clients WHERE id=$1`,
      [clientId]
    );

    if (!client) return;

    // Get plan configuration from database
    const plan = await db.getOne(
      `SELECT name, transaction_limit, next_plan
       FROM plans
       WHERE name=$1`,
      [client.plan]
    );

    if (!plan) return;

    const usage = await db.getOne(
      `SELECT COUNT(*)::int AS total
       FROM transactions
       WHERE client_id=$1`,
      [clientId]
    );

    if (usage.total > plan.transaction_limit && plan.next_plan) {

      await db.query(
        `UPDATE clients SET plan=$2 WHERE id=$1`,
        [clientId, plan.next_plan]
      );

      console.log(
        `📈 Client ${client.phone} upgraded from ${plan.name} → ${plan.next_plan}`
      );

    }

  } catch (err) {

    console.error("Usage upgrade engine error:", err.message);

  }

}
