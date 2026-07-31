import { supabase } from "../config/supabaseClient.js"

export async function resolveBranch(clientId, tag){

const { data } = await supabase
.from("branches")
.select("*")
.eq("enterprise_id", clientId)
.eq("tag", tag)
.single()

return data
}
