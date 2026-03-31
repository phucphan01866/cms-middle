require('dotenv').config();

// ─── SECTION 1: IMPORTS & CONFIGURATION ──────────────────────────────────────
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const fs = require('fs');
const os = require('os');
const { createServer } = require('http');
const { Server } = require('socket.io'); // Socket Server (Đón khách)
const { io: ioClient } = require('socket.io-client'); // Socket Client (Làm khách)

const app = express();
const httpServer = createServer(app);
const port = process.env.THIS_PORT || 5050;

// ─── SECTION 2: SOCKET STATE MANAGEMENT ──────────────────────────────────────
/**
 * clientSockets: INSTANCE của Socket.io Server.
 * Quản lý các kết nối từ "Khách" (Frontend, Nodes cấp dưới) tìm đến máy này.
 */
const clientSockets = new Server(httpServer, {
  cors: { origin: '*' },
});

/**
 * serverSockets: MẢNG chứa các instance socket client.
 * Lưu trữ các kết nối mà máy này chủ động kết nối tới các "Máy chủ" khác (Upstream).
 */
const serverSockets = [];

// ─── SECTION 3: URL & NOTIFICATION HELPERS ───────────────────────────────────
const getURL = (host, p) => (host && p ? `http://${host}:${p}` : null);
const getCMSBackendURL = () => getURL(process.env.BE_CMS_IP, process.env.BE_CMS_PORT);
const getForwardURL = () => getURL(process.env.FORWARD_IP, process.env.FORWARD_PORT);

const notifyStatusToClients = (url, mode, status, data = null) => {
  const payload = { url, type: mode, status };

  // Ánh xạ status sang event name mà FE đang lắng nghe
  let eventName = status;
  if (status === 'connected') eventName = 'external-connect';
  if (status === 'error') eventName = 'external-err-connect';
  if (status === 'disconnected') eventName = 'external-disconnected';
  if (status === 'receive-log') eventName = 'receive-log';

  clientSockets.emit(eventName, { ...payload, data });
};

// ─── SECTION 4: MIDDLEWARE ───────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));

// Request Logger
app.use((req, res, next) => {
  // console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Auto-forward logic cho các route không khai báo trong file này
const declaredRoutes = ['/api/v1/login', '/api/v1/logs', '/healthcheck', '/api/v1/create-connection', '/server-information'];
app.use(async (req, res, next) => {
  if (req.method !== 'POST' || declaredRoutes.includes(req.path)) return next();
  const CMS_BE_URL = getCMSBackendURL();
  if (!CMS_BE_URL) return res.status(201).send({ success: true });
  try {
    const response = await axios.post(`${CMS_BE_URL}${req.originalUrl}`, req.body);
    return res.status(response.status).send(response.data);
  } catch {
    return res.status(201).send({ success: true });
  }
});

// ─── SECTION 5: HTTP ROUTES ──────────────────────────────────────────────────
app.get('/healthcheck', (req, res) => res.status(200).send({ status: 'OK' }));

app.get('/server-information', (req, res) => {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) addresses.push(iface.address);
    }
  }
  res.status(200).send({
    ip: addresses[0] || '127.0.0.1',
    port,
    all_ips: addresses,
    serverSockets: serverSockets.map(s => ({ url: s.url, connected: s.socket.connected }))
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
  const logData = {
    timestamp: new Date().toISOString(),
    method: req.method,
    originalUrl: req.originalUrl,
    statusCode: res.statusCode,
    ip: req.ip,
    body: req.body,
  };

  // 1. Phát dữ liệu cho các Client của mình (Frontend hoặc Node cấp dưới)
  clientSockets.emit('receive-log', logData);

  // 2. Chuyển tiếp (Forward) log lên các Server cấp trên (Upstream)
  serverSockets.forEach(({ url, socket }) => {
    if (socket.connected) {
      console.log(`[FORWARD] Sending log to server: ${url}`);
      socket.emit('forward-log', logData);
    }
  });

  return res.status(201).send({ success: true });
});


// Khởi tạo kết nối làm "Khách" tới một server cấp trên khác
app.post('/api/v1/create-connection', (req, res) => {
  const { ip, port, mode } = req.body;
  if (!ip || !port) return res.status(400).send({ success: false, message: 'Missing IP or Port' });

  const url = `http://${ip}:${port}`;
  const existing = serverSockets.find(s => s.url === url);
  if (existing) {
    return res.status(200).send({ success: true, message: 'Already configured', connected: existing.socket.connected });
  }

  const newServerSocket = ioClient(url, {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
  });

  const connMode = mode || 'send';

  newServerSocket.on('connect', () => notifyStatusToClients(url, connMode, 'connected'));
  newServerSocket.on('connect_error', () => notifyStatusToClients(url, connMode, 'error'));
  newServerSocket.on('disconnect', () => notifyStatusToClients(url, connMode, 'disconnected'));
  newServerSocket.on('receive-log', (data) => notifyStatusToClients(url, connMode, 'receive-log', data));

  serverSockets.push({ url, socket: newServerSocket, mode: connMode });
  return res.status(200).send({ success: true, message: `Connecting to server ${url}...` });
});

// ─── SECTION 6: SOCKET SERVER EVENTS (Đón khách) ─────────────────────────────
clientSockets.on('connection', (socket) => {
  console.log('[NODE_CONNECTED] New client/node connected. ID:', socket.id);

  socket.on('forward-log', (data) => {
    // Nhận log từ một máy khác (máy đó coi mình là server) -> Phát lại cho FE của mình
    console.log(`[RECEIVE] Log received from node ${socket.id} — broadcasting to clients`);
    clientSockets.emit('receive-log', data);
  });

  socket.on('message', (data) => {
    console.log(`[MESSAGE] Received message from client ${socket.id} — broadcasting`);
    clientSockets.emit('message', data);
  });

  socket.on('disconnect', () => {
    console.log('[NODE_DISCONNECTED] ID:', socket.id);
  });
});

// ─── SECTION 7: SERVER STARTUP ───────────────────────────────────────────────
httpServer.listen(port, '0.0.0.0', () => {
  console.log(`\n🚀 MIDDLE SERVER RUNNING AT: http://0.0.0.0:${port}`);
  console.log(`📡 CLIENT SOCKET SERVER READY (PORT ${port})\n`);
});