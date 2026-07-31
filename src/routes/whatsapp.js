// ═══════════════════════════════════════════════════════════
// LedgerFlow — WhatsApp & Payment Routes
// ═══════════════════════════════════════════════════════════
import express from "express";
const router = express.Router();
import { requestPairingCode, isConnected, getSocket  } from "../whatsapp/whatsappClient.js";
import { verifyGatewayWebhook  } from "../engines/securityEngine.js";
import { activateSubscription  } from "../engines/subscriptionEngine.js";

// PAIRING ROUTE
router.post('/pair', async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ error: 'Phone number required' });
        if (isConnected()) return res.json({ success: true, message: 'Already connected' });

        const code = await requestPairingCode(phone);
        res.json({ success: true, code });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// STATUS ROUTE (For UptimeRobot)
router.get('/status', (req, res) => {
    const sock = getSocket();
    res.json({
        status: 'online',
        connected: isConnected(),
        bot_number: sock?.user?.id?.split(':')[0] || null
    });
});

// PAYSTACK WEBHOOK
router.post('/paystack', async (req, res) => {
    try {
        const secret = process.env.PAYSTACK_SECRET_KEY;
        const signature = req.headers['x-paystack-signature'];
        const rawBody = JSON.stringify(req.body);

        if (verifyGatewayWebhook(rawBody, signature, secret)) {
            const { event, data } = req.body;
            if (event === 'charge.success') {
                const phone = data.metadata?.phone || data.customer?.phone;
                await activateSubscription(phone.replace(/\D/g,''), data.metadata?.plan || 'MICRO', 1);
            }
        }
        res.status(200).json({ received: true });
    } catch (err) { res.status(200).json({ received: true }); }
});

export default router;
