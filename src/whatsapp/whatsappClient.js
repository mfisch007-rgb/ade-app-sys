import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import qrcode from 'qrcode-terminal';
import { messageQueue } from '../queues/messageQueue.js';

const AUTH_FOLDER = "./auth";
const PHONE_NUMBER = (process.env.PAIRING_PHONE || "").replace(/\D/g, "");

// This 'export' is exactly what start-dev.js was crying about missing.
export async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    // This is the "Ubuntu" trick. It's just a setting, not an operating system change.
    browser: ["Ubuntu", "Chrome", "20.0.04"], 
    syncFullHistory: false,
    connectTimeoutMs: 120_000,
    keepAliveIntervalMs: 25_000,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !sock.authState.creds.registered) {
      console.log("\n📌 PAIRING STATUS: WAITING FOR LINK...");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("╔══════════════════════════════════════════════╗");
      console.log("║  ✅ WHATSAPP CONNECTED & READY FOR QUEUE     ║");
      console.log("╚══════════════════════════════════════════════╝");
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error instanceof Boom 
        ? lastDisconnect.error.output?.statusCode 
        : null;
      if (statusCode !== DisconnectReason.loggedOut) {
        setTimeout(startWhatsApp, 5000);
      }
    }
  });

  // ── AGGRESSIVE DEBUG MESSAGE LISTENER ──────────────────────
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      // NOTE: I removed the "if(msg.key.fromMe) continue;" line.
      // Now you CAN test the bot by messaging your own number!

      if (!msg.message) continue;

      // Extract text no matter how WhatsApp wraps it
      const text = (
        msg.message?.conversation || 
        msg.message?.extendedTextMessage?.text || 
        msg.message?.imageMessage?.caption || 
        ""
      ).trim();

      const phoneJid = msg.key.remoteJid;
      const phoneOnly = phoneJid.replace("@s.whatsapp.net", "").replace(/\D/g, "");
      
      if (!text) continue;

      console.log(`\n📨 [Incoming] ← ${phoneOnly}: "${text}"`);

      try {
        console.log("⏳ [DEBUG] Sending to Redis Worker...");
        const job = await messageQueue.add({
          sender: phoneOnly,
          text: text,
          msg: msg 
        });

        console.log("⏳ [DEBUG] Waiting for Worker to cook the reply...");
        const result = await job.finished();
        console.log("✅ [DEBUG] Worker finished! Result:", result);

        if (result && result.reply) {
          const brandedReply = `*ADE-Automated Business LedgerFlow*\n\n${result.reply}`;
          
          // Send the reply back to the chat it came from
          await sock.sendMessage(phoneJid, { text: brandedReply });
          console.log(`📤 [Replied] → ${phoneOnly}`);
        } else {
          console.log("❌ [DEBUG] Worker returned empty reply data.");
        }

        // Send read receipt
        await sock.readMessages([msg.key]);
        
      } catch (e) {
        console.error("❌ Processing Error:", e.message);
      }
    }
  });

  return sock;
}
