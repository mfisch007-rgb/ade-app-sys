import "dotenv/config"
import { isRateLimited } from "../engines/securityEngine.js"

/*
LedgerFlow Message Parser
Clean stable version
*/

function fmt(num){
  return Number(num).toLocaleString("en-NG",{
    minimumFractionDigits:2,
    maximumFractionDigits:2
  })
}

function normalizeText(text){
  return text.trim().replace(/\s+/g," ").toLowerCase()
}

export async function parseMessage(sender,text,msg){

  if(!text || text.trim()===""){
    return { reply:"Empty message received." }
  }

  text = normalizeText(text)

  if(await isRateLimited(sender)){
    return { reply:"Too many requests. Please wait." }
  }

  /* HELP */

  if(text === "help"){
    return {
      reply:
`LedgerFlow Commands

sales 5000
expense 1200
balance
report
help`
    }
  }

  /* SALES */

  if(text.startsWith("sales")){

    const parts = text.split(" ")

    if(parts.length < 2){
      return { reply:"Example: sales 5000" }
    }

    const amount = Number(parts[1])

    if(isNaN(amount)){
      return { reply:"Invalid amount" }
    }

    return {
      type:"sales",
      amount,
      reply:`Sale recorded: ₦${fmt(amount)}`
    }
  }

  /* EXPENSE */

  if(text.startsWith("expense")){

    const parts = text.split(" ")

    if(parts.length < 2){
      return { reply:"Example: expense 2000" }
    }

    const amount = Number(parts[1])

    if(isNaN(amount)){
      return { reply:"Invalid amount" }
    }

    return {
      type:"expense",
      amount,
      reply:`Expense recorded: ₦${fmt(amount)}`
    }
  }

  /* BALANCE */

  if(text === "balance"){
    return {
      type:"balance_request",
      reply:"Balance request received. Processing..."
    }
  }

  /* REPORT */

  if(text === "report"){
    return {
      type:"report_request",
      reply:"Generating your report..."
    }
  }

  /* UNKNOWN */

  return {
    reply:
`Command not recognized.

Type "help" to see available commands.`
  }

}

export { fmt }
