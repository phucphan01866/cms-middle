
require('dotenv').config();

// ─── Imports ────────────────────────────────────────────────────────────────
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const fs = require('fs');
const os = require('os');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

// ─── App & Config ────────────────────────────────────────────────────────────
const app = express();
const port = process.env.THIS_PORT || 5050;

// ─── URL Helpers ─────────────────────────────────────────────────────────────
const getURL = (host, p) => (host && p ? `http://${host}:${p}` : null);
const getCMSBackendURL = () => getURL(process.env.BE_CMS_IP, process.env.BE_CMS_PORT);
const getForwardURL = () => getURL(process.env.FORWARD_IP, process.env.FORWARD_PORT);

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));

// Request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - IP: ${req.ip}`);
  next();
});

// Sửa mảng này:
const declaredRoutes = ['/api/v1/login', '/api/v1/logs', '/healthcheck', '/create-connection'];

// Auto-forward undeclared POST requests to CMS backend
app.use(async (req, res, next) => {
  if (req.method !== 'POST') return next();
  if (declaredRoutes.includes(req.path)) return next();
  const CMS_BE_URL = getCMSBackendURL();
  if (!CMS_BE_URL) return res.status(201).send({ success: true });
  try {
    const response = await axios.post(`${CMS_BE_URL}${req.originalUrl}`, req.body);
    return res.status(response.status).send(response.data);
  } catch {
    return res.status(201).send({ success: true });
  }
});

// ─── Routes ──────────────────────────────────────────────────────────────────
app.get('/healthcheck', (req, res) => res.status(200).send({ status: 'OK' }));

app.get('/server-information', (req, res) => {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) addresses.push(iface.address);
    }
  }

  const sendDic = [
    { ip: process.env.FORWARD_IP, port: process.env.FORWARD_PORT, mode: 'send', status: 'connecting' },
  ];

  res.status(200).send({
    ip: addresses[0] || '127.0.0.1',
    port,
    all_ips: addresses,
    sendDic: [],
    receiveDic: [],
  });
});

app.post('/api/v1/login', async (req, res) => {
  const CMS_BE_URL = getCMSBackendURL();
  if (!CMS_BE_URL) return res.status(201).send({ data: { accessToken: 'placeholder' } });
  try {
    const response = await axios.post(`${CMS_BE_URL}/api/v1/login`, req.body);
    return res.status(response.status).send(response.data);
  } catch {
    return res.status(201).send({ data: { accessToken: 'placeholder' } });
  }
});

app.post('/api/v1/logs', async (req, res) => {
  // ── Persist log to disk (max 1000 files) ──
  const logsDir = './logs';
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const fileName = `${logsDir}/log_${timestamp}_${Math.floor(Math.random() * 1000)}.json`;
  const logData = {
    timestamp: new Date().toISOString(),
    method: req.method,
    originalUrl: req.originalUrl,
    statusCode: res.statusCode,
    ip: req.ip,
    body: req.body,
  };

  // try {
  //   const files = fs.readdirSync(logsDir);
  //   if (files.length >= 1000) {
  //     files.sort();
  //     files.slice(0, files.length - 999).forEach(f => {
  //       try { fs.unlinkSync(`${logsDir}/${f}`); } catch { }
  //     });
  //   }
  //   fs.writeFileSync(fileName, JSON.stringify(logData, null, 2));
  // } catch { }

  // ── Broadcast to FE (internal) ──
  internalSocket.emit('receive-log', logData);

  // ── Forward to upstream servers (external) ──
  externalSockets.forEach(({ url, socket }) => {
    if (socket.connected) {
      console.log(`[EXTERNAL] Pushing log to: ${url}`);
      socket.emit('forward-log', logData);
    }
  });

  if (externalUrls.length === 0) return res.status(201).send({ success: true });

  // ── Fallback: HTTP forwarding (external) ──
  for (const url of externalUrls) {
    try {
      await axios.post(`${url}/api/v1/logs`, req.body);
    } catch (err) {
      console.error(`[EXTERNAL] HTTP forward error to ${url}:`, err.message);
    }
  }

  return res.status(201).send({ success: true });
});

app.post('/create-connection', (req, res) => {
  const { ip, port } = req.body;

  const url = `http://${ip}:${port}`

  if (!ip || !port) {
    return res.status(400).send({ success: false, message: 'Missing ip or port' });
  }

  // Return early if already connected
  const existing = externalSockets.find(s => s.url === url);
  if (existing) {
    console.log("existing")
    return res.status(200).send({
      success: true,
      message: `Already connected to ${url}`,
      connected: existing.socket.connected,
    });
  }

  // Create new outbound external socket connection
  const newExternalSocket = ioClient(url, {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
  });
  console.log("newExternalSocket created")
  newExternalSocket.on('connect', () => {
    notifyExternalStatus(url, 'send', 'external-connect')
  });
  newExternalSocket.on('connect_error', () => {
    notifyExternalStatus(url, 'send', 'external-connect-error')
  });
  newExternalSocket.on('disconnect', () => {
    notifyExternalStatus(url, 'send', 'external-disconnected')
  });
  newExternalSocket.on('forward-log', () => notifyExternalStatus(url, 'send', 'log'));

  externalSockets.push({ url, socket: newExternalSocket });
  console.log(`[EXTERNAL] Creating new connection to: ${url}`);
  return res.status(200).send({ success: true, message: `Connecting to ${url}...` });
});

// ─── Internal Socket (FE ↔ BE) ──────────────────────────────────────────────
const httpServer = createServer(app);
const internalSocket = new Server(httpServer, {
  cors: { origin: '*' },
});

internalSocket.on('connection', (socket) => {
  console.log('[INTERNAL] FE client connected:', socket.id);

  socket.on('forward-log', (data) => {
    console.log('[INTERNAL] Received forwarded log — broadcasting to FE');
    internalSocket.emit('receive-log', data);
  });

  socket.on('message', (data) => {
    console.log('[INTERNAL] Message received:', data);
    internalSocket.emit('message', data);
  });

  socket.on('disconnect', () => {
    console.log('[INTERNAL] FE client disconnected:', socket.id);
  });
});

// ─── External Socket Notification Helper (server-to-server events → FE) ──────
const notifyExternalStatus = (url, type, status, data = null) => {
  const payload = { url, type, status };
  console.log('[EXTERNAL] status:', status);
  switch (status) {
    case 'connected': internalSocket.emit('connected', payload); break;
    case 'error_disconnected': internalSocket.emit('error_disconnected', payload); break;
    case 'disconnected': internalSocket.emit('disconnected', payload); break;
    case 'log': internalSocket.emit('receive-log', { ...payload, data }); break;
    case 'external-connect': internalSocket.emit('external-connect', payload); break;
    case 'external-err-connect': internalSocket.emit('external-err-connect', payload); break;
    case 'external-disconnect': internalSocket.emit('external-disconnect', payload); break;
    case 'receive-log': internalSocket.emit('receive-log', { ...payload, data }); break;
    default: break;
  }
};

// ─── External Socket Clients (server-to-server, startup) ────────────────────
const externalUrls = [getForwardURL()].filter(Boolean);
const externalSockets = [];

// externalUrls.forEach(url => {
//   console.log(`[EXTERNAL] Creating persistent link to: ${url}`);
//   const externalSocket = ioClient(url, {
//     reconnection: true,
//     reconnectionAttempts: Infinity,
//     reconnectionDelay: 2000,
//   });

//   externalSocket.on('connect', () => notifyExternalStatus(url, 'send', 'external-connect'));
//   externalSocket.on('connect_error', () => notifyExternalStatus(url, 'send', 'external-err-connect'));
//   externalSocket.on('disconnect', () => notifyExternalStatus(url, 'send', 'external-disconnect'));

//   externalSockets.push({ url, socket: externalSocket });
// });


// ─── Start Server ─────────────────────────────────────────────────────────────
httpServer.listen(port, '0.0.0.0', () => {
  console.log(`[SERVER] Running at http://0.0.0.0:${port}`);
});