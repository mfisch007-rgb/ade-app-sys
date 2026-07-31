import { supabase } from "../config/supabaseClient.js"

export async function checkFraud(clientId, item, price){

const { data } = await supabase
.from("transactions")
.select("price")
.eq("item", item)
.eq("client_id", clientId)
.limit(50)

if(!data || data.length < 5) return false

let avg = data.reduce((a,b)=>a + b.price,0) / data.length

// prevent divide-by-zero crash
if(avg === 0) return false

let deviation = Math.abs(price-avg)/avg

if(deviation > 0.7){

await supabase
.from("fraud_logs")
.insert({
client_id: clientId,
item,
price,
expected_price: avg
})

return true
}

return false
}
