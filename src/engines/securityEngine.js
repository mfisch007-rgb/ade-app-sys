// ═══════════════════════════════════════════════════════════
// LedgerFlow — Security Engine (ESM FINAL STABLE)
// Compatible with Node 20 ESM
// File: src/engines/securityEngine.js
// ═══════════════════════════════════════════════════════════

import "dotenv/config"
import crypto from "crypto"
import * as db from "../config/database.js"

let bcrypt = null
try {
  const mod = await import("bcrypt")
  bcrypt = mod.default
} catch {
  console.warn("⚠️ bcrypt not installed — PIN features disabled")
}

const SECRET_SALT = process.env.SUBSCRIPTION_SALT || "ledgerflow-default-salt"



// ─────────────────────────────────────────────────────────
// RATE LIMITING (fast in-memory)
// ─────────────────────────────────────────────────────────
const rateLimitMap = new Map()

export function isRateLimited(phone){

  const now = Date.now()
  const windowMs = (parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS) || 60) * 1000
  const maxMessages = parseInt(process.env.RATE_LIMIT_MESSAGES) || 10

  const history = rateLimitMap.get(phone) || []

  const recent = history.filter(ts => now - ts < windowMs)

  if(recent.length >= maxMessages) return true

  recent.push(now)

  rateLimitMap.set(phone,recent)

  if(rateLimitMap.size > 1000){
    for(const [key,val] of rateLimitMap){
      if(val.every(ts => now - ts > windowMs)){
        rateLimitMap.delete(key)
      }
    }
  }

  return false
}



// ─────────────────────────────────────────────────────────
// DB RATE CHECK
// ─────────────────────────────────────────────────────────
export async function checkRateLimit(phone){

  const windowSeconds = parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS) || 60
  const maxMessages = parseInt(process.env.RATE_LIMIT_MESSAGES) || 10

  const result = await db.getOne(`
    SELECT COUNT(*) AS count
    FROM command_logs
    WHERE phone=$1
    AND created_at > NOW() - INTERVAL '${windowSeconds} seconds'
  `,[phone])

  const count = parseInt(result?.count || 0)

  return {
    limited: count >= maxMessages,
    count,
    limit: maxMessages
  }
}



// ─────────────────────────────────────────────────────────
// IP BLOCKING
// ─────────────────────────────────────────────────────────
export async function isBlocked(ip){

  try{

    const row = await db.getOne(`
      SELECT id
      FROM blocked_ips
      WHERE ip_address=$1
      AND (expires_at IS NULL OR expires_at > NOW())
    `,[ip])

    return !!row

  }catch{
    return false
  }

}



export async function blockIP(ip,reason,expiresAt=null){

  await db.query(`
    INSERT INTO blocked_ips(ip_address,reason,expires_at)
    VALUES($1,$2,$3)
    ON CONFLICT(ip_address)
    DO UPDATE SET reason=$2
  `,[ip,reason,expiresAt])

}



// ─────────────────────────────────────────────────────────
// PIN MANAGEMENT
// ─────────────────────────────────────────────────────────
export async function hashPIN(pin){

  if(!bcrypt) throw new Error("bcrypt not installed")

  return bcrypt.hash(pin + (process.env.PIN_PEPPER || ""),12)

}



export async function verifyPIN(input,storedHash){

  if(!bcrypt) throw new Error("bcrypt not installed")

  return bcrypt.compare(input + (process.env.PIN_PEPPER || ""),storedHash)

}



// ─────────────────────────────────────────────────────────
// SUBSCRIPTION SIGNATURE
// ─────────────────────────────────────────────────────────
export function generateSubscriptionSignature(client_id,plan,start_date,end_date){

  const data = `${client_id}|${plan}|${start_date}|${end_date}`

  return crypto
    .createHmac("sha256",SECRET_SALT)
    .update(data)
    .digest("hex")

}



// ─────────────────────────────────────────────────────────
// PAYMENT WEBHOOK VERIFICATION
// ─────────────────────────────────────────────────────────
export function verifyGatewayWebhook(rawBody,receivedSignature,secretKey){

  const expected = crypto
    .createHmac("sha256",secretKey)
    .update(rawBody)
    .digest("hex")

  return expected === receivedSignature

}



// ─────────────────────────────────────────────────────────
// API KEY MANAGEMENT
// ─────────────────────────────────────────────────────────
export async function generateApiKey(clientId,label="default"){

  const rawKey = crypto.randomBytes(40).toString("hex")

  const hash = crypto
    .createHash("sha256")
    .update(rawKey)
    .digest("hex")

  const expiresAt = new Date(Date.now() + 365*24*60*60*1000)

  await db.query(`
    INSERT INTO api_keys(client_id,api_key_hash,label,active,expires_at)
    VALUES($1,$2,$3,true,$4)
  `,[clientId,hash,label,expiresAt])

  return rawKey
}



export async function validateApiKey(rawKey){

  const hash = crypto
    .createHash("sha256")
    .update(rawKey)
    .digest("hex")

  const key = await db.getOne(`
    SELECT *
    FROM api_keys
    WHERE api_key_hash=$1
    AND active=true
    AND (expires_at IS NULL OR expires_at > NOW())
  `,[hash])

  if(!key) return null

  await db.query(`
    UPDATE api_keys
    SET last_used_at=NOW()
    WHERE id=$1
  `,[key.id])

  return key
}



// ─────────────────────────────────────────────────────────
// SECURITY EVENT LOGGING
// ─────────────────────────────────────────────────────────
export async function logSecurityEvent(phone,action,ip=null,riskScore=0){

  try{

    await db.query(`
      INSERT INTO security_logs(phone,action,ip_address,risk_score)
      VALUES($1,$2,$3,$4)
    `,[phone,action,ip,riskScore])

  }catch(err){
    console.error("Security log failed:",err.message)
  }

}



// ─────────────────────────────────────────────────────────
// ADMIN ALERTS
// ─────────────────────────────────────────────────────────
export async function createAdminAlert(message){

  try{

    const adminPhone = process.env.ADMIN_PHONE?.replace(/\D/g,"")

    if(adminPhone){

      await db.query(`
        INSERT INTO notifications(phone,message,notification_type,status)
        VALUES($1,$2,'admin_alert','pending')
      `,[adminPhone,`🚨 ADMIN ALERT\n${message}`])

    }

    console.warn("🚨 ADMIN ALERT:",message)

  }catch(err){
    console.error("createAdminAlert failed:",err.message)
  }

}



// ─────────────────────────────────────────────────────────
// RISK SCORE
// ─────────────────────────────────────────────────────────
export async function updateRiskScore(phone,points){

  try{

    await logSecurityEvent(phone,"RISK_SCORE_UPDATE",null,points)

    const recentScore = await db.getOne(`
      SELECT COALESCE(SUM(risk_score),0) AS total
      FROM security_logs
      WHERE phone=$1
      AND created_at > NOW() - INTERVAL '24 hours'
    `,[phone])

    const totalScore = parseInt(recentScore?.total || 0) + points

    const threshold = 50

    if(totalScore >= threshold){

      await createAdminAlert(
        `⚠️ HIGH RISK ACTIVITY\nPhone: ${phone}\nRisk Score: ${totalScore}`
      )

    }

  }catch(err){
    console.error("Risk score update failed:",err.message)
  }

}



// ─────────────────────────────────────────────────────────
// AGENT FRAUD DETECTION
// ─────────────────────────────────────────────────────────
export async function detectAgentFraud(agentId){

  try{

    const alerts = []

    const hourlyCount = await db.getOne(`
      SELECT COUNT(*) AS count
      FROM transactions
      WHERE agent_id=$1
      AND created_at > NOW() - INTERVAL '1 hour'
    `,[agentId])

    if(parseInt(hourlyCount?.count || 0) > 30){

      alerts.push({
        type:"HIGH_VOLUME",
        severity:"high",
        description:`${hourlyCount.count} transactions in 1 hour`
      })

    }

    for(const alert of alerts){

      await db.query(`
        INSERT INTO fraud_alerts(agent_id,alert_type,description,severity)
        VALUES($1,$2,$3,$4)
      `,[agentId,alert.type,alert.description,alert.severity])

      if(alert.severity === "high"){

        await createAdminAlert(
          `Fraud Alert\nAgent: ${agentId}\n${alert.description}`
        )

      }

    }

    return alerts

  }catch(err){

    console.error("detectAgentFraud failed:",err.message)
    return []

  }

}
