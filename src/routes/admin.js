import express from 'express';
import db from '../config/database.js';
import { activateSubscription } from '../engines/subscriptionEngine.js';
import { generateApiKey } from '../engines/securityEngine.js';

const router = express.Router();

function requireAdmin(req, res, next) {
    const key = req.headers['x-admin-key'];
    if (!key || key !== process.env.JWT_SECRET) {
        return res.status(401).json({ error: 'Unauthorized — provide valid x-admin-key header' });
    }
    next();
}

function verifySecurityPin(req, res, next) {
    const pin = req.headers['x-security-pin'];
    if (!pin || pin !== (process.env.ADMIN_SECURITY_PIN || 'ADE_PIN_2026')) {
        return res.status(403).json({ error: 'FORBIDDEN: Invalid or missing X-Security-PIN header.' });
    }
    next();
}

router.use(requireAdmin);

router.get('/stats', async (req, res) => {
    try {
        const stats = await db.getOne(`
            SELECT
                COUNT(*) FILTER (WHERE status='active') AS active,
                COUNT(*) FILTER (WHERE status='trial') AS trial,
                COUNT(*) FILTER (WHERE status='expired') AS expired,
                COUNT(*) FILTER (WHERE last_activity_at > NOW()-INTERVAL '24 hours') AS active_today,
                COALESCE(SUM(total_transactions),0) AS total_transactions
            FROM clients
        `);
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/clients', async (req, res) => {
    try {
        const clients = await db.getMany(`
            SELECT id, phone, business_name, owner_name, plan, status, total_transactions, created_at
            FROM clients ORDER BY created_at DESC LIMIT 100
        `);
        res.json({ count: clients.length, clients });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/fraud-alerts', async (req, res) => {
    try {
        const alerts = await db.getMany(`
            SELECT fa.*, c.phone, c.business_name
            FROM fraud_alerts fa
            LEFT JOIN clients c ON fa.client_id=c.id
            WHERE fa.resolved=false
            ORDER BY fa.created_at DESC LIMIT 50
        `);
        res.json({ count: alerts.length, alerts });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/clients', verifySecurityPin, async (req, res) => {
    try {
        const { phone, business_name, owner_name, plan = 'trial' } = req.body;
        if (!phone) return res.status(400).json({ error: 'phone required' });

        const clean = phone.replace(/\D/g, '');
        const client = await db.insert(`
            INSERT INTO clients(phone, business_name, owner_name, plan, status)
            VALUES($1, $2, $3, $4, 'trial') RETURNING *
        `, [clean, business_name, owner_name, plan]);

        res.json({ success: true, client });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/clients/:phone/activate', verifySecurityPin, async (req, res) => {
    try {
        const client = await activateSubscription(
            req.params.phone,
            req.body.plan || 'MICRO',
            parseInt(req.body.months || 1)
        );
        res.json({ success: true, client });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/clients/:phone/apikey', verifySecurityPin, async (req, res) => {
    try {
        const client = await db.getOne(`SELECT * FROM clients WHERE phone=$1`, [req.params.phone]);
        if (!client) return res.status(404).json({ error: 'Client not found' });

        const key = await generateApiKey(client.id);
        res.json({ success: true, api_key: key });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;