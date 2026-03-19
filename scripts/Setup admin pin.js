// ═══════════════════════════════════════════════════════════
// ADE-LedgerFlow™ — Admin PIN Setup Utility
// File: scripts/setup-admin-pin.js
//
// Run ONCE before first startup to set the owner PIN properly.
// Never run in production with a placeholder in the DB.
//
// Usage: node scripts/setup-admin-pin.js
// ═══════════════════════════════════════════════════════════
require('dotenv').config();
const readline = require('readline');
const bcrypt   = require('bcrypt');
const db       = require('../src/config/database');

const rl = readline.createInterface({
  input:  process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
  console.log('\n═══════════════════════════════════════════════');
  console.log(' ADE-LedgerFlow™ — Owner PIN Setup');
  console.log(' Alpha-Aliph Automated Digital Enterprise');
  console.log('═══════════════════════════════════════════════\n');

  const phone = process.env.ADMIN_PHONE?.replace(/\D/g, '');
  if (!phone) {
    console.error('❌ ADMIN_PHONE not set in .env');
    process.exit(1);
  }

  console.log(`Setting PIN for owner phone: +${phone}\n`);

  const pin1 = await ask('Enter your 6-digit PIN: ');
  const pin2 = await ask('Confirm your 6-digit PIN: ');

  if (!/^\d{6}$/.test(pin1.trim())) {
    console.error('❌ PIN must be exactly 6 digits (numbers only)');
    process.exit(1);
  }

  if (pin1.trim() !== pin2.trim()) {
    console.error('❌ PINs do not match');
    process.exit(1);
  }

  try {
    const pinHash = await bcrypt.hash(pin1.trim() + (process.env.PIN_PEPPER || ''), 12);

    const result = await db.query(`
      UPDATE system_admins
      SET pin_hash = $2, updated_at = NOW()
      WHERE phone = $1
      RETURNING phone, name, role
    `, [phone, pinHash]);

    if (result.rowCount === 0) {
      // Admin doesn't exist yet — insert them
      await db.query(`
        INSERT INTO system_admins(phone, name, role, pin_hash, status)
        VALUES($1, 'System Owner', 'OWNER', $2, 'active')
        ON CONFLICT(phone) DO UPDATE SET pin_hash=$2, updated_at=NOW()
      `, [phone, pinHash]);
    }

    console.log('\n✅ Owner PIN set successfully!');
    console.log(`   Phone: +${phone}`);
    console.log('   Role: OWNER');
    console.log('\nYou can now sign into the admin dashboard.\n');

  } catch (err) {
    console.error('❌ Failed to set PIN:', err.message);
    process.exit(1);
  } finally {
    rl.close();
    await db.close();
  }
}

main();