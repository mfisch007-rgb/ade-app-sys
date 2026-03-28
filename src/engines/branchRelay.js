import { supabase } from "../config/database.js"

export async function resolveBranch(clientId, tag){

const { data } = await supabase
.from("branches")
.select("*")
.eq("enterprise_id", clientId)
.eq("tag", tag)
.single()

return data
}