import db from '../config/database.js'

export async function generateDailyInsight(clientId){

  const top = await db.getMany(`
    SELECT item, SUM(amount) revenue
    FROM transactions
    WHERE client_id=$1
    GROUP BY item
    ORDER BY revenue DESC
    LIMIT 3
  `, [clientId])

  return top
}
