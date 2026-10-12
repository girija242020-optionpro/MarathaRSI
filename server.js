require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const axios = require('axios');
const totp = require('otplib');
const { v4: uuidv4 } = require('uuid');

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.DHAN_API_KEY;
const USER_ID = process.env.DHAN_USER_ID;
const TOTP_SECRET = process.env.DHAN_TOTP_SECRET;

// Dhan Instrument IDs (verify these against current Dhan documentation).
const INSTRUMENTS = [
    { exchange: "NSE", instrumentId: 1000, name: "NIFTY" },
    { exchange: "BSE", instrumentId: 5000, name: "SENSEX" }
];

let accessToken = null;
let wsClient = null;
let reconnectTimer = null;

// --- AUTHENTICATION LOGIC ---
async function authenticateDhan() {
    try {
        if (!API_KEY || !USER_ID || !TOTP_SECRET) {
            throw new Error("Missing DHAN_API_KEY, DHAN_USER_ID, or DHAN_TOTP_SECRET environment variable.");
        }

        console.log("Authenticating with Dhan via TOTP...");
        totp.authenticator.options = { step: 30, window: 1 };
        const otp = totp.authenticator.generate(TOTP_SECRET);

        const response = await axios.post('https://api.dhan.co/v1/login/verify', {
            userId: USER_ID,
            apiKey: API_KEY,
            otp
        }, {
            headers: {
                'Content-Type': 'application/json',
                'access-token': API_KEY
            },
            timeout: 15000
        });

        accessToken = response.data?.accessToken || null;
        if (!accessToken) {
            console.error("Dhan authentication response did not contain accessToken:", response.data);
            return false;
        }

        console.log("Authentication successful.");
        return true;
    } catch (error) {
        console.error("Dhan authentication failed:", error.response?.data || error.message);
        return false;
    }
}

// --- WEBSOCKET CONNECTION TO DHAN ---
async function connectToDhan() {
    const success = await authenticateDhan();
    if (!success) {
        scheduleReconnect(10000);
        return;
    }

    try {
        // This is the endpoint from the supplied script. Confirm it and the message
        // protocol against current Dhan documentation before relying on live data.
        const wsUrl = 'wss://ws.dhan.co/socket.io/?EIO=4&transport=websocket';
        wsClient = new WebSocket(wsUrl);

        wsClient.on('open', () => {
            console.log("Connected to Dhan WebSocket endpoint.");
            subscribeToInstruments();
        });

        wsClient.on('message', handleDhanData);

        wsClient.on('error', (error) => {
            console.error("Dhan WebSocket error:", error.message);
        });

        wsClient.on('close', () => {
            console.log("Dhan WebSocket closed. Reconnecting...");
            scheduleReconnect(5000);
        });
    } catch (error) {
        console.error("Dhan WebSocket connection error:", error.message);
        scheduleReconnect(10000);
    }
}

function scheduleReconnect(delayMs) {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectToDhan, delayMs);
}

function subscribeToInstruments() {
    if (!wsClient || wsClient.readyState !== WebSocket.OPEN) return;

    const message = {
        type: "subscribe",
        data: INSTRUMENTS.map(inst => ({
            exchangeSegment: inst.exchange,
            instrumentId: inst.instrumentId,
            depth: 20
        }))
    };

    wsClient.send(JSON.stringify(message));
    console.log(`Subscription request sent for ${INSTRUMENTS.length} instruments.`);
}

function handleDhanData(rawData) {
    try {
        const text = rawData.toString();
        // Socket.IO/Engine.IO frames are not necessarily plain JSON. Ignore
        // handshake/ping frames; decode only the event shape supported here.
        if (!text.startsWith('42')) return;

        const eventText = text.slice(2);
        const parsed = JSON.parse(eventText);
        if (!Array.isArray(parsed)) return;

        const payload = parsed.length > 1 ? parsed[1] : parsed[0];
        broadcastToClients(payload);
    } catch (error) {
        console.error("Dhan data parse error:", error.message);
    }
}

// --- EXPRESS SERVER FOR FRONTEND WEBSOCKETS ---
const app = express();
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const pwaClients = new Set();

app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
        server: 'universal-dhan-backend',
        timestamp: Date.now(),
        dhanSocket: wsClient?.readyState === WebSocket.OPEN ? 'connected' : 'disconnected',
        clients: pwaClients.size
    });
});

wss.on('connection', (ws) => {
    console.log("New PWA client connected.");
    pwaClients.add(ws);

    ws.on('close', () => pwaClients.delete(ws));
    ws.on('error', () => pwaClients.delete(ws));

    ws.send(JSON.stringify({
        type: 'status',
        timestamp: Date.now(),
        source: 'universal-dhan-backend',
        data: { connected: true, dhanSocket: wsClient?.readyState === WebSocket.OPEN }
    }));
});

function broadcastToClients(dhanPayload) {
    const universalMessage = {
        timestamp: Date.now(),
        source: 'dhan',
        data: dhanPayload
    };

    const serialized = JSON.stringify(universalMessage);
    for (const client of pwaClients) {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(serialized);
            } catch (error) {
                console.error("Client broadcast error:", error.message);
            }
        }
    }
}

server.listen(PORT, () => {
    console.log(`Universal Backend listening on port ${PORT}.`);
    connectToDhan();
});

function shutdown() {
    console.log("Shutting down...");
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (wsClient) wsClient.close();
    for (const client of pwaClients) client.close();
    wss.close();
    server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
