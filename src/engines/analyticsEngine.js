import { supabase } from "../config/database.js"

export async function dailyReport(clientId){

const { data } = await supabase
.from("transactions")
.select("amount,type")
.eq("client_id",clientId)

if(!data || data.length === 0){
return {
sales:0,
expenses:0,
profit:0
}
}

let sales = data
.filter(x=>x.type==="sale")
.reduce((a,b)=>a+b.amount,0)

let expenses = data
.filter(x=>x.type==="expense")
.reduce((a,b)=>a+b.amount,0)

return {
sales,
expenses,
profit:sales-expenses
}

}