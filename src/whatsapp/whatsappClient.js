require('dotenv').config();
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  BufferJSON
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');
const { supabase } = require('../config/supabaseClient');

const AUTH_DIR = path.join(__dirname, '../../auth_info');
const QR_LIFETIME = 300_000; 
const RECONNECT_MS = 5_000;

let sock = null;

async function startWhatsApp() {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

  // ─── SUPABASE SESSION RESTORE ───
  try {
    const { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('data')
      .eq('id', 'ledgerflow_main')
      .single();

    if (session && (!fs.existsSync(path.join(AUTH_DIR, 'creds.json')))) {
      fs.writeFileSync(path.join(AUTH_DIR, 'creds.json'), JSON.stringify(session.data, BufferJSON.replacer));
      console.log('✅ Session Restored from Supabase.');
    }
  } catch (err) { console.log('💡 Fresh session required.'); }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['LedgerFlow', 'Chrome', '120.0.0'],
    syncFullHistory: false,
    connectTimeoutMs: QR_LIFETIME,
  });

  // ─── AUTO-SAVE TO CLOUD ───
  sock.ev.on('creds.update', async () => {
    await saveCreds();
    try {
      const creds = JSON.parse(fs.readFileSync(path.join(AUTH_DIR, 'creds.json'), 'utf-8'));
      await supabase.from('whatsapp_sessions').upsert({
        id: 'ledgerflow_main',
        data: creds,
        updated_at: new Date()
      });
    } catch (e) { console.error("Cloud Sync Error:", e.message); }
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) qrcode.generate(qr, { small: true });
    
    if (connection === 'open') {
        console.log('🚀 LEDGERFLOW ONLINE');
        // ALERT SYSTEM: Notify you when bot comes online
        await sock.sendMessage('2349075197772@s.whatsapp.net', { text: "🛡️ LedgerFlow System Alert: Your engine is now LIVE on Render." });
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error instanceof Boom) ? lastDisconnect.error.output?.statusCode : null;
      if (statusCode !== DisconnectReason.loggedOut) setTimeout(startWhatsApp, RECONNECT_MS);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
    const text = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").trim();

    // ADMIN CHECK
    const isAdmin = sender === '2349075197772';
    if (text.toLowerCase() === '!status' && isAdmin) {
      return await sock.sendMessage(msg.key.remoteJid, { text: "🛡️ LedgerFlow: ACTIVE\nDatabase: Cloud Synced" });
    }

    // NLP / COMMAND INTELLIGENCE HAND-OFF
    try {
      const { parseMessage } = require('../parsers/messageParser');
      const result = await parseMessage(sender, text, msg);
      if (result?.reply) await sock.sendMessage(msg.key.remoteJid, { text: result.reply });
    } catch (err) { console.error('Parser Error:', err.message); }
  });

  return sock;
}

async function requestPairingCode(phoneNumber) {
  if (!sock) await startWhatsApp();
  return await sock.requestPairingCode(phoneNumber.replace(/\D/g, ''));
}

module.exports = { startWhatsApp, requestPairingCode, isConnected: () => !!sock?.user, getSocket: () => sock };