import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import bcrypt from "bcryptjs";

const rl = readline.createInterface({ input, output });

try {
  const pin = await rl.question("Enter new 6-digit ADE admin PIN: ");

  if (!/^\d{6}$/.test(pin)) {
    throw new Error("PIN_MUST_BE_EXACTLY_6_DIGITS");
  }

  const hash = await bcrypt.hash(pin, 12);

  console.log("");
  console.log("ADE_ADMIN_PIN_HASH=" + hash);
} finally {
  rl.close();
}

