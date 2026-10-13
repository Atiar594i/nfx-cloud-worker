const express = require('express');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion,
    Browsers
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

const PORT = 5055;
const SESSIONS_DIR = path.join(__dirname, 'sessions');

if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

// Map of userId -> { sock, status, phone, pairingCode }
const userSockets = new Map();
const logger = pino({ level: 'silent' });

async function initUserSocket(userId, phoneNumber = null) {
    const sessionPath = path.join(SESSIONS_DIR, `user_${userId}`);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    let version = [2, 3000, 1043857760];
    try {
        const latest = await fetchLatestBaileysVersion();
        version = latest.version;
    } catch (e) {}

    const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: state,
        browser: Browsers.ubuntu('Chrome'),
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 25000
    });

    sock.ev.on('creds.update', saveCreds);

    const userObj = {
        sock,
        status: state.creds?.registered ? 'connected' : 'pairing',
        phone: phoneNumber || state.creds?.me?.id?.split(':')[0] || null,
        pairingCode: null
    };

    userSockets.set(userId, userObj);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'open') {
            userObj.status = 'connected';
            userObj.phone = sock.user?.id?.split(':')[0] || userObj.phone;
            console.log(`[WA] 🎉 User ${userId} connected successfully! Phone: ${userObj.phone}`);
        } else if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log(`[WA] User ${userId} connection closed (code: ${statusCode}, registered: ${!!state.creds?.registered})`);

            // If registered, handle reconnect or logout
            if (state.creds?.registered) {
                if (statusCode === DisconnectReason.loggedOut) {
                    userObj.status = 'logged_out';
                    userSockets.delete(userId);
                    try { fs.rmSync(sessionPath, { recursive: true, force: true }); } catch (e) {}
                } else {
                    userObj.status = 'reconnecting';
                    setTimeout(() => initUserSocket(userId, userObj.phone), 3000);
                }
            } else {
                // Not registered yet — pairing in progress
                // Do NOT delete session files! Reconnect so socket stays alive for the pairing code
                if (statusCode !== DisconnectReason.loggedOut) {
                    setTimeout(() => {
                        if (!userSockets.has(userId) || userSockets.get(userId).status !== 'connected') {
                            initUserSocket(userId, userObj.phone);
                        }
                    }, 3000);
                }
            }
        }
    });

    // If not registered and phoneNumber provided, request pairing code
    if (!state.creds?.registered && phoneNumber) {
        const cleanPhone = String(phoneNumber).replace(/[^0-9]/g, '');
        // Allow socket to complete handshake
        await new Promise(r => setTimeout(r, 2000));
        try {
            const code = await sock.requestPairingCode(cleanPhone);
            userObj.pairingCode = code;
            userObj.phone = cleanPhone;
            console.log(`[WA] Pairing code for user ${userId} (${cleanPhone}): ${code}`);
            return code;
        } catch (err) {
            console.error(`[WA] Failed to request pairing code for user ${userId}:`, err.message);
            throw err;
        }
    }

    return null;
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ ok: true, timestamp: Date.now(), active_sessions: userSockets.size });
});

// Status endpoint
app.get('/status', (req, res) => {
    const userId = String(req.query.user_id);
    const userObj = userSockets.get(userId);
    const sessionPath = path.join(SESSIONS_DIR, `user_${userId}`);
    const hasSession = fs.existsSync(sessionPath);

    if (userObj && userObj.status === 'connected') {
        return res.json({ ok: true, connected: true, phone: userObj.phone });
    } else if (hasSession) {
        return res.json({ ok: true, connected: false, status: userObj?.status || 'saved_session', phone: userObj?.phone || null });
    } else {
        return res.json({ ok: true, connected: false, status: 'no_session' });
    }
});

// Request Pairing Code
app.post('/pair', async (req, res) => {
    const { user_id, phone } = req.body;
    if (!user_id || !phone) {
        return res.status(400).json({ ok: false, error: 'Missing user_id or phone' });
    }
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    if (cleanPhone.length < 8) {
        return res.status(400).json({ ok: false, error: 'Invalid phone number format' });
    }

    const userId = String(user_id);
    const sessionPath = path.join(SESSIONS_DIR, `user_${userId}`);

    // Clean previous socket if any
    if (userSockets.has(userId)) {
        try {
            userSockets.get(userId).sock.end(undefined);
        } catch (e) {}
        userSockets.delete(userId);
    }
    try {
        fs.rmSync(sessionPath, { recursive: true, force: true });
    } catch (e) {}

    try {
        const code = await initUserSocket(userId, cleanPhone);
        return res.json({ ok: true, code, phone: cleanPhone });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message || 'Failed to generate pairing code' });
    }
});

// Check list of numbers on WhatsApp
app.post('/check', async (req, res) => {
    const { user_id, numbers } = req.body;
    if (!user_id || !numbers || !Array.isArray(numbers)) {
        return res.status(400).json({ ok: false, error: 'Invalid parameters' });
    }

    let userObj = userSockets.get(String(user_id));
    if (!userObj) {
        const sessionPath = path.join(SESSIONS_DIR, `user_${user_id}`);
        if (fs.existsSync(sessionPath)) {
            await initUserSocket(String(user_id));
            userObj = userSockets.get(String(user_id));
            if (userObj && userObj.status !== 'connected') {
                await new Promise(r => setTimeout(r, 2500));
            }
        }
    }

    if (!userObj || userObj.status !== 'connected') {
        return res.json({ ok: false, connected: false, error: 'User WhatsApp checker not connected' });
    }

    try {
        const checkMap = {};
        for (const num of numbers) {
            const clean = String(num).replace(/[^0-9]/g, '');
            if (!clean) {
                checkMap[num] = false;
                continue;
            }
            try {
                const [result] = await userObj.sock.onWhatsApp(clean);
                checkMap[num] = !!(result && result.exists);
            } catch (e) {
                console.error(`[WA] Check error for ${num}:`, e.message);
                checkMap[num] = false;
            }
        }
        return res.json({ ok: true, connected: true, results: checkMap });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

let poolRoundRobin = 0;

// Check list of numbers using a pool of Admin WhatsApp sessions (round-robin + automatic failover)
app.post('/check_pool', async (req, res) => {
    const { session_ids, numbers } = req.body;
    if (!numbers || !Array.isArray(numbers)) {
        return res.status(400).json({ ok: false, error: 'Invalid numbers list' });
    }

    const candidateIds = Array.isArray(session_ids) && session_ids.length > 0
        ? session_ids.map(String)
        : Array.from(userSockets.keys());

    // Ensure saved sessions on disk are initialized
    for (const sid of candidateIds) {
        if (!userSockets.has(sid)) {
            const sessionPath = path.join(SESSIONS_DIR, `user_${sid}`);
            if (fs.existsSync(sessionPath)) {
                try { await initUserSocket(sid); } catch (e) {}
            }
        }
    }

    let connectedSockets = [];
    for (const sid of candidateIds) {
        const uObj = userSockets.get(sid);
        if (uObj && uObj.status === 'connected' && uObj.sock) {
            connectedSockets.push({ id: sid, obj: uObj });
        }
    }

    // Fallback: if none of candidateIds is connected, check any connected socket in userSockets
    if (connectedSockets.length === 0) {
        for (const [sid, uObj] of userSockets.entries()) {
            if (uObj && uObj.status === 'connected' && uObj.sock) {
                connectedSockets.push({ id: sid, obj: uObj });
            }
        }
    }

    if (connectedSockets.length === 0) {
        return res.json({ ok: false, connected: false, results: {} });
    }

    try {
        const checkMap = {};
        for (const num of numbers) {
            const clean = String(num).replace(/[^0-9]/g, '');
            if (!clean) {
                checkMap[num] = false;
                continue;
            }
            let checked = false;
            for (let attempt = 0; attempt < connectedSockets.length; attempt++) {
                const pickIdx = (poolRoundRobin + attempt) % connectedSockets.length;
                const chosen = connectedSockets[pickIdx];
                try {
                    const [result] = await chosen.obj.sock.onWhatsApp(clean);
                    checkMap[num] = !!(result && result.exists);
                    poolRoundRobin = (pickIdx + 1) % connectedSockets.length;
                    checked = true;
                    break;
                } catch (e) {
                    console.error(`[WA Pool] Check error on session ${chosen.id} for ${num}:`, e.message);
                }
            }
            if (!checked) {
                checkMap[num] = false;
            }
        }
        return res.json({
            ok: true,
            connected: true,
            active_pool_size: connectedSockets.length,
            results: checkMap
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message, results: {} });
    }
});

// Logout / Disconnect user
app.post('/logout', async (req, res) => {
    const { user_id } = req.body;
    const userId = String(user_id);
    const sessionPath = path.join(SESSIONS_DIR, `user_${userId}`);

    if (userSockets.has(userId)) {
        try {
            const userObj = userSockets.get(userId);
            await userObj.sock.logout();
        } catch (e) {}
        userSockets.delete(userId);
    }
    try {
        fs.rmSync(sessionPath, { recursive: true, force: true });
    } catch (e) {}
    return res.json({ ok: true, message: 'Logged out successfully' });
});

// Auto-restore saved sessions on startup
async function restoreSessions() {
    if (!fs.existsSync(SESSIONS_DIR)) return;
    try {
        const entries = fs.readdirSync(SESSIONS_DIR);
        for (const entry of entries) {
            if (entry.startsWith('user_')) {
                const userId = entry.replace('user_', '');
                try {
                    console.log(`[WA] Restoring session for user ${userId}...`);
                    await initUserSocket(userId);
                } catch (e) {
                    console.error(`[WA] Failed to restore session for user ${userId}:`, e.message);
                }
            }
        }
    } catch (e) {
        console.error('[WA] Session restore error:', e.message);
    }
}

app.listen(PORT, '127.0.0.1', async () => {
    console.log(`🚀 WhatsApp Checker Microservice listening on http://127.0.0.1:${PORT}`);
    await restoreSessions();
});
