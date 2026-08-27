const ledger = [];

function addEntry(entry = {}) {
  if (!entry || typeof entry !== "object") {
    throw new Error("Ledger entry must be an object.");
  }
  const record = {
    id: entry.id || `LEDGER-${Date.now()}-${ledger.length + 1}`,
    type: entry.type || "GENERAL",
    amount: Number(entry.amount || 0),
    item: entry.item || "",
    notes: entry.notes || "",
    createdAt: new Date().toISOString()
  };
  ledger.push(record);
  return { ...record };
}

export function getLedger() {
  return ledger.map(entry => ({ ...entry }));
}

export function clearLedger() {
  const count = ledger.length;
  ledger.length = 0;
  return { cleared: count };
}

export default {
  name: "ledger",
  description: "Financial ledger commands",
  async execute(sock, msg, args = []) {
    const [command = "list", ...rest] = args;
    switch (String(command).toLowerCase()) {
      case "add":
        return addEntry({
          type: rest[0] || "GENERAL",
          amount: rest[1] || 0,
          item: rest.slice(2).join(" ")
        });
      case "list":
        return getLedger();
      case "clear":
        return clearLedger();
      default:
        return {
          success: false,
          error: `Unknown ledger command: ${command}`,
          commands: ["add", "list", "clear"]
        };
    }
  }
};
