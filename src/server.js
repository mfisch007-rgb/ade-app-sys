import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { startWhatsApp } from './whatsapp/whatsappClient.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Basic health check for Back4app
app.get('/', (req, res) => {
    res.send('LedgerFlow Engine is running.');
});

app.listen(PORT, async () => {
    console.log(`🌍 Server listening on port ${PORT}`);
    try {
        await startWhatsApp();
    } catch (err) {
        console.error('Failed to start WhatsApp Client:', err.message);
    }
});