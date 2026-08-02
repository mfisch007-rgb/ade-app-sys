export default class NexusLedgerEngine {
    constructor(bus = null) {
        this.bus = bus;
        this.ledgers = new Map();
    }

    initializeWallet(tenantId, initialBalance = 0) {
        const account = {
            tenantId,
            balance: initialBalance,
            transactions: [],
            status: "ACTIVE",
            createdAt: Date.now()
        };
        this.ledgers.set(tenantId, account);
        return account;
    }

    recordTransaction(tenantId, type, amount, reference = "") {
        const account = this.ledgers.get(tenantId) || this.initializeWallet(tenantId);
        if (type === "CREDIT") {
            account.balance += amount;
        } else if (type === "DEBIT") {
            if (account.balance < amount) {
                throw new Error("INSUFFICIENT_FUNDS");
            }
            account.balance -= amount;
        } else {
            throw new Error("INVALID_TRANSACTION_TYPE");
        }

        const tx = {
            txId: "TX-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
            type,
            amount,
            balanceAfter: account.balance,
            reference,
            timestamp: Date.now()
        };
        account.transactions.push(tx);

        if (this.bus) {
            this.bus.publish("ledger.transaction.recorded", { tenantId, tx });
        }
        return tx;
    }

    getBalance(tenantId) {
        const account = this.ledgers.get(tenantId);
        return account ? account.balance : 0;
    }

    verifyInvariant(tenantId) {
        const account = this.ledgers.get(tenantId);
        if (!account) return true;
        let computed = 0;
        for (const tx of account.transactions) {
            if (tx.type === "CREDIT") computed += tx.amount;
            if (tx.type === "DEBIT") computed -= tx.amount;
        }
        return computed === account.balance;
    }
}
