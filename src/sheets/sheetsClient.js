// ═══════════════════════════════════════════════════════════
// LedgerFlow — Google Sheets Client
// File: src/sheets/sheetsClient.js
// Writes every transaction to the client's Google Sheet
// ═══════════════════════════════════════════════════════════
require('dotenv').config();
const path = require('path');
const fs   = require('fs');

let googleAuth = null;
let sheetsApi  = null;
let initialized = false;

// ─────────────────────────────────────────────────────────────
// Initialize Google Sheets API
// Lazy-loaded so server starts even without credentials.json
// ─────────────────────────────────────────────────────────────
async function init() {
  if (initialized) return sheetsApi !== null;

  try {
    const { google } = require('googleapis');
    const credsPath  = path.join(__dirname, '../../credentials.json');

    if (!fs.existsSync(credsPath)) {
      console.warn('⚠️  credentials.json not found — Google Sheets disabled');
      console.warn('    Place credentials.json in project root to enable Sheets');
      initialized = true;
      return false;
    }

    const creds = JSON.parse(fs.readFileSync(credsPath));
    googleAuth  = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const authClient = await googleAuth.getClient();
    sheetsApi = google.sheets({ version: 'v4', auth: authClient });
    initialized = true;
    console.log('✅ Google Sheets API ready');
    return true;
  } catch (err) {
    console.error('❌ Sheets init failed:', err.message);
    initialized = true;
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Append a transaction row to the JOURNAL tab
// ─────────────────────────────────────────────────────────────
async function appendTransaction(client, tx) {
  if (!client.sheet_id) return;
  if (!await init())   return;
  if (!sheetsApi)      return;

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos' });
  const timeStr = now.toLocaleTimeString('en-NG', { hour12: true, timeZone: 'Africa/Lagos' });

  const row = [
    dateStr,                    // A: DATE
    timeStr,                    // B: TIME
    tx.type,                    // C: TYPE
    tx.amount || 0,             // D: AMOUNT
    tx.item || tx.person || '', // E: ITEM / PERSON
    tx.quantity || '',          // F: QTY (STOCK only)
    '',                         // G: RUNNING BALANCE (formula handles this)
    tx.notes || '',             // H: NOTES
    tx.id,                      // I: TX ID (hidden — for audit)
  ];

  try {
    const result = await sheetsApi.spreadsheets.values.append({
      spreadsheetId: client.sheet_id,
      range: 'JOURNAL!A:I',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: [row] },
    });

    const updatedRange = result.data.updates?.updatedRange || '';
    console.log(`📊 Sheets: wrote to ${updatedRange} (client: ${client.phone})`);
    return result;
  } catch (err) {
    // Don't throw — sheets failure should never crash the bot
    console.error(`❌ Sheets write failed for ${client.phone}:`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// Create the master template sheet for a new client
// Called during client onboarding
// ─────────────────────────────────────────────────────────────
async function createClientSheet(businessName) {
  if (!await init()) return null;
  if (!sheetsApi)    return null;

  try {
    const { google } = require('googleapis');
    const authClient = await googleAuth.getClient();
    const driveApi   = google.drive({ version: 'v3', auth: authClient });

    // Create new spreadsheet
    const sheet = await sheetsApi.spreadsheets.create({
      resource: {
        properties: { title: `LedgerFlow — ${businessName}` },
        sheets: [
          { properties: { title: 'JOURNAL',    sheetId: 0 } },
          { properties: { title: 'LEDGER',     sheetId: 1 } },
          { properties: { title: 'CATEGORIES', sheetId: 2 } },
          { properties: { title: 'STOCK',      sheetId: 3 } },
          { properties: { title: 'DASHBOARD',  sheetId: 4 } },
        ],
      },
    });

    const sheetId = sheet.data.spreadsheetId;

    // Set up JOURNAL headers
    await sheetsApi.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: 'JOURNAL!A1:I1',
      valueInputOption: 'RAW',
      resource: {
        values: [['DATE','TIME','TYPE','AMOUNT','ITEM/PERSON','QTY','RUNNING_BALANCE','NOTES','TX_ID']],
      },
    });

    // Set up DASHBOARD formulas
    await sheetsApi.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: 'DASHBOARD!A1:B6',
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [
          ['LedgerFlow Dashboard', `=TODAY()`],
          ['Total Sales',     `=SUMIF(JOURNAL!C:C,"SALE",JOURNAL!D:D)`],
          ['Total Expenses',  `=SUMIF(JOURNAL!C:C,"EXPENSE",JOURNAL!D:D)`],
          ['Net Profit',      `=B2-B3`],
          ['Outstanding Credit', `=SUMIF(JOURNAL!C:C,"CREDIT",JOURNAL!D:D)-SUMIF(JOURNAL!C:C,"PAYMENT",JOURNAL!D:D)`],
          ['Total Capital',   `=SUMIF(JOURNAL!C:C,"CAPITAL",JOURNAL!D:D)`],
        ],
      },
    });

    // Make spreadsheet accessible (share with anyone with link — optional)
    // await driveApi.permissions.create({
    //   fileId: sheetId,
    //   resource: { role: 'reader', type: 'anyone' },
    // });

    console.log(`✅ New client sheet created: ${sheetId}`);
    return sheetId;
  } catch (err) {
    console.error('❌ Sheet creation failed:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Get today's summary from sheet (used in reports)
// ─────────────────────────────────────────────────────────────
async function getTodayFromSheet(sheetId) {
  if (!await init()) return null;
  if (!sheetsApi)    return null;

  try {
    const result = await sheetsApi.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'DASHBOARD!A1:B6',
    });
    return result.data.values;
  } catch (err) {
    console.error('❌ Sheets read failed:', err.message);
    return null;
  }
}

module.exports = {
  init,
  appendTransaction,
  createClientSheet,
  getTodayFromSheet,
};
