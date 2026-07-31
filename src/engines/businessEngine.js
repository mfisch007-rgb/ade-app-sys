// ADE — Business Logic Engine
// File: src/engines/businessEngine.js

import db from "../config/database.js";

async function processSale(user_id, cmd) {
  const item   = cmd.target;
  const amount = parseFloat(cmd.value);
  if (isNaN(amount) || amount <= 0) return '❌ Usage: SALE ITEM AMOUNT';

  await db.query(
    `INSERT INTO transactions (user_id, type, item, amount) VALUES ($1, 'SALE', $2, $3)`,
    [user_id, item, amount]
  );

  const product = await db.getOne(
    `SELECT p.product_id, ps.quantity, p.low_stock_alert
     FROM products p JOIN product_stock ps ON p.product_id = ps.product_id
     WHERE p.user_id = $1 AND UPPER(p.name) = $2`,
    [user_id, item]
  );

  if (product) {
    const newQty = parseFloat(product.quantity) - 1;
    await db.query(
      `UPDATE product_stock SET quantity = $1, updated_at = NOW() WHERE product_id = $2`,
      [newQty, product.product_id]
    );
    if (newQty <= (product.low_stock_alert || 5)) {
      await db.query(
        `INSERT INTO notifications (user_id, channel, message, status)
         VALUES ($1, 'whatsapp', $2, 'pending')`,
        [user_id, `⚠️ Low stock: *${item}* has only ${newQty} units left.`]
      );
    }
  }

  return `✅ *Sale Recorded*\n\nItem: ${item}\nAmount: ₦${amount.toLocaleString()}\n\nType DAILY REPORT to see today's summary.`;
}

async function processExpense(user_id, cmd) {
  const item   = cmd.target;
  const amount = parseFloat(cmd.value);
  if (isNaN(amount) || amount <= 0) return '❌ Usage: EXPENSE ITEM AMOUNT';

  await db.query(
    `INSERT INTO transactions (user_id, type, item, amount) VALUES ($1, 'EXPENSE', $2, $3)`,
    [user_id, item, amount]
  );

  return `✅ *Expense Recorded*\n\nItem: ${item}\nAmount: ₦${amount.toLocaleString()}`;
}

async function processDebt(user_id, cmd) {
  const name   = cmd.target;
  const amount = parseFloat(cmd.value);
  if (isNaN(amount) || amount <= 0) return '❌ Usage: DEBT NAME AMOUNT';

  await db.query(
    `INSERT INTO customers (user_id, name) VALUES ($1, $2) ON CONFLICT (user_id, name) DO NOTHING`,
    [user_id, name]
  );

  const customer = await db.getOne(
    'SELECT customer_id FROM customers WHERE user_id = $1 AND name = $2',
    [user_id, name]
  );

  await db.query(
    `INSERT INTO transactions (user_id, type, item, amount) VALUES ($1, 'DEBT', $2, $3)`,
    [user_id, name, amount]
  );

  const ledger = await db.getOne(
    'SELECT * FROM customer_ledgers WHERE customer_id = $1',
    [customer.customer_id]
  );

  if (ledger) {
    await db.query(
      `UPDATE customer_ledgers SET balance = balance + $1, updated_at = NOW()
       WHERE customer_id = $2`,
      [amount, customer.customer_id]
    );
  } else {
    await db.query(
      `INSERT INTO customer_ledgers (customer_id, user_id, balance) VALUES ($1, $2, $3)`,
      [customer.customer_id, user_id, amount]
    );
  }

  return `✅ *Debt Recorded*\n\nCustomer: ${name}\nAmount Owed: ₦${amount.toLocaleString()}\n\nType DEBT LIST to see all debts.`;
}

async function processPayment(user_id, cmd) {
  const name   = cmd.target;
  const amount = parseFloat(cmd.value);
  if (isNaN(amount) || amount <= 0) return '❌ Usage: PAID NAME AMOUNT';

  const customer = await db.getOne(
    'SELECT customer_id FROM customers WHERE user_id = $1 AND name = $2',
    [user_id, name]
  );

  if (!customer) return `❌ Customer "${name}" not found. Add them with: ADD CUSTOMER ${name}`;

  await db.query(
    `UPDATE customer_ledgers SET balance = balance - $1, updated_at = NOW()
     WHERE customer_id = $2`,
    [amount, customer.customer_id]
  );

  await db.query(
    `INSERT INTO transactions (user_id, type, item, amount) VALUES ($1, 'PAID', $2, $3)`,
    [user_id, name, amount]
  );

  const ledger = await db.getOne(
    'SELECT balance FROM customer_ledgers WHERE customer_id = $1',
    [customer.customer_id]
  );

  return `✅ *Payment Received*\n\nCustomer: ${name}\nPaid: ₦${amount.toLocaleString()}\nRemaining Debt: ₦${parseFloat(ledger.balance).toLocaleString()}`;
}

async function processStock(user_id, cmd) {
  const item     = cmd.target;
  const quantity = parseFloat(cmd.value);
  const cost     = parseFloat(cmd.extra1);
  if (isNaN(quantity) || isNaN(cost)) return '❌ Usage: STOCK ITEM QUANTITY COST';

  let product = await db.getOne(
    `SELECT * FROM products WHERE user_id = $1 AND UPPER(name) = $2`,
    [user_id, item]
  );

  if (!product) {
    product = await db.insert(
      `INSERT INTO products (user_id, name, cost_price) VALUES ($1, $2, $3)`,
      [user_id, item, cost]
    );
    await db.query(
      `INSERT INTO product_stock (product_id, user_id, quantity) VALUES ($1, $2, $3)`,
      [product.product_id, user_id, quantity]
    );
  } else {
    await db.query(
      `UPDATE product_stock SET quantity = quantity + $1, updated_at = NOW()
       WHERE product_id = $2`,
      [quantity, product.product_id]
    );
  }

  await db.query(
    `INSERT INTO transactions (user_id, type, item, quantity, amount) VALUES ($1, 'BUY', $2, $3, $4)`,
    [user_id, item, quantity, cost]
  );

  return `✅ *Stock Updated*\n\nItem: ${item}\nQty Added: ${quantity}\nCost: ₦${cost.toLocaleString()}`;
}

async function processWithdraw(user_id, cmd) {
  const amount = parseFloat(cmd.target);
  if (isNaN(amount) || amount <= 0) return '❌ Usage: WITHDRAW AMOUNT';

  await db.query(
    `INSERT INTO transactions (user_id, type, amount) VALUES ($1, 'WITHDRAW', $2)`,
    [user_id, amount]
  );

  return `✅ *Withdrawal Recorded*\n\nAmount: ₦${amount.toLocaleString()}`;
}

async function processTransfer(user_id, cmd) {
  const bank   = cmd.target;
  const amount = parseFloat(cmd.value);
  if (isNaN(amount) || amount <= 0) return '❌ Usage: TRANSFER BANK AMOUNT';

  await db.query(
    `INSERT INTO transactions (user_id, type, item, amount) VALUES ($1, 'TRANSFER', $2, $3)`,
    [user_id, bank, amount]
  );

  return `✅ *Transfer Recorded*\n\nBank: ${bank}\nAmount: ₦${amount.toLocaleString()}`;
}

async function processContribution(user_id, cmd) {
  const type   = cmd.target?.toUpperCase();
  const amount = parseFloat(cmd.value);
  if (!['DAILY','WEEKLY','MONTHLY'].includes(type)) return '❌ Usage: CONTRIB DAILY/WEEKLY/MONTHLY AMOUNT';
  if (isNaN(amount) || amount <= 0) return '❌ Invalid amount';

  await db.query(
    `INSERT INTO contributions (user_id, type, amount) VALUES ($1, $2, $3)`,
    [user_id, type, amount]
  );

  return `✅ *Contribution Recorded*\n\nType: ${type}\nAmount: ₦${amount.toLocaleString()}`;
}

async function processDrugStock(user_id, cmd) {
  const name = cmd.target;
  const qty  = parseFloat(cmd.value);
  const cost = parseFloat(cmd.extra1);
  if (isNaN(qty) || isNaN(cost)) return '❌ Usage: DRUGSTOCK DRUGNAME QUANTITY COST';

  const drug = await db.getOne(
    `SELECT * FROM drugs WHERE user_id = $1 AND UPPER(name) = $2`, [user_id, name]
  );

  if (!drug) {
    await db.query(
      `INSERT INTO drugs (user_id, name, quantity, cost) VALUES ($1, $2, $3, $4)`,
      [user_id, name, qty, cost]
    );
  } else {
    await db.query(
      `UPDATE drugs SET quantity = quantity + $1 WHERE drug_id = $2`,
      [qty, drug.drug_id]
    );
  }

  return `✅ *Drug Stock Updated*\n\nDrug: ${name}\nQty Added: ${qty}\nCost: ₦${cost.toLocaleString()}`;
}

async function processDrugSale(user_id, cmd) {
  const name   = cmd.target;
  const qty    = parseFloat(cmd.value);
  const amount = parseFloat(cmd.extra1);
  if (isNaN(qty) || isNaN(amount)) return '❌ Usage: DRUGSALE DRUGNAME QUANTITY AMOUNT';

  const drug = await db.getOne(
    `SELECT * FROM drugs WHERE user_id = $1 AND UPPER(name) = $2`, [user_id, name]
  );

  if (!drug) return `❌ Drug "${name}" not found. Add it first with: DRUGSTOCK ${name} QTY COST`;

  await db.query(
    `UPDATE drugs SET quantity = quantity - $1 WHERE drug_id = $2`, [qty, drug.drug_id]
  );

  await db.query(
    `INSERT INTO drug_sales (user_id, drug_id, quantity, amount) VALUES ($1, $2, $3, $4)`,
    [user_id, drug.drug_id, qty, amount]
  );

  return `✅ *Drug Sale Recorded*\n\nDrug: ${name}\nQty: ${qty}\nAmount: ₦${amount.toLocaleString()}`;
}

const commandMap = {
  SALE:      processSale,
  EXPENSE:   processExpense,
  DEBT:      processDebt,
  PAID:      processPayment,
  STOCK:     processStock,
  BUY:       processStock,
  WITHDRAW:  processWithdraw,
  TRANSFER:  processTransfer,
  CONTRIB:   processContribution,
  DRUGSTOCK: processDrugStock,
  DRUGSALE:  processDrugSale,
};

export { 
  commandMap,
  processSale, processExpense, processDebt,
  processPayment, processStock, processWithdraw,
  processTransfer, processContribution,
  processDrugStock, processDrugSale
 };
