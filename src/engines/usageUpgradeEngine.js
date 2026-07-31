async function checkUsageUpgrade(clientId){

const tx = await db.getOne(`
SELECT COUNT(*) AS total
FROM transactions
WHERE client_id=$1
`,[clientId])

if(tx.total > 5000){
 upgradePlan(clientId,"business_pro")
}

}
