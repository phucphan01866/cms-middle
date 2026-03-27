
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const fs = require('fs');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client'); // Added: Socket.io Client for server-to-server connection

const app = express();
const port = process.env.THIS_PORT || 5050;

// ... (existing URL helpers)
const getURL = (part1, part2) => {
  if (part1 && part2) return `http://${part1}:${part2}`;
  return null;
}

const getCMSBackendURL = () => {
  return getURL(process.env.BE_CMS_IP, process.env.BE_CMS_PORT);
}

const getForwardURL = () => {
  return getURL(process.env.FORWARD_IP, process.env.FORWARD_PORT);
}

const forward_list = [
  getCMSBackendURL(),
  getForwardURL()
].filter(Boolean);

// --- Initialize Socket Connections to Forward Targets ---
const forwardSockets = [];
forward_list.forEach(url => {
  console.log(`[SOCKET_SYSTEM] Creating persistent link to: ${url}`);
  const socket = ioClient(url, {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000
  });

  socket.on('connect', () => console.log(`[SOCKET_SYSTEM] Connected successfully to ${url}`));
  socket.on('connect_error', (err) => console.log(`[SOCKET_SYSTEM] Connection error to ${url}:`, err.message));
  socket.on('disconnect', () => console.log(`[SOCKET_SYSTEM] Disconnected from ${url}`));

  forwardSockets.push({ url, socket });
});

app.use(cors({ origin: true, credentials: true }));
// ... (rest of middlewares remain same)

app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));

// Middleware log chi tiết các request đi tới
app.use((req, res, next) => {
  const now = new Date().toISOString();
  console.log(`[${now}] ${req.method} ${req.originalUrl} - IP: ${req.ip}`);
  next();
});

// Định nghĩa các route đã khai báo riêng
const declaredRoutes = [
  '/api/v1/login',
  '/api/v1/logs',
  '/healthcheck'
];

// Middleware chung forward các POST request chưa khai báo
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
    duration: 0,
    body: req.body
  };
  try {
    const files = fs.readdirSync(logsDir);
    if (files.length >= 1000) {
      files.sort();
      const filesToDelete = files.slice(0, files.length - 999);
      filesToDelete.forEach(file => {
        try {
          fs.unlinkSync(`${logsDir}/${file}`);
        } catch (e) { }
      });
    }
    fs.writeFileSync(fileName, JSON.stringify(logData, null, 2));
  } catch { }

  // 1. Emit to local connected clients (e.g., Browser)
  io.emit("receive-log", logData);

  // 2. Emit via Socket to Forward Targets (Real-time Link)
  forwardSockets.forEach(({ url, socket }) => {
    if (socket.connected) {
      console.log(`[SOCKET_FORWARD] Pushing log to: ${url}`);
      socket.emit("forward-log", logData);
    }
  });

  if (forward_list.length === 0) return res.status(201).send({ success: true });

  // 3. Keep fallback HTTP forwarding
  for (const url of forward_list) {
    try {
      await axios.post(`${url}/api/v1/logs`, req.body);
    } catch (error) {
      // If socket failed, maybe HTTP still works or vice versa
      console.error(`Log forwarding (HTTP) error to ${url}:`, error.message);
    }
  }
  return res.status(201).send({ success: true });
});

app.get('/healthcheck', (req, res) => res.status(200).send({ status: 'OK' }));

// Socket configuration for INCOMING connections
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log('Một user/server đã kết nối:', socket.id);

  // Handle incoming forwarded logs from other servers
  socket.on('forward-log', (data) => {
    console.log('[SOCKET_INCOMING] Received forwarded log from another server');
    io.emit('receive-log', data); // Broadcast it to our local connected UI
  });

  socket.on('message', (data) => {
    console.log('Nhận tin nhắn:', data);
    io.emit('message', data);
  });

  socket.on('disconnect', () => {
    console.log('User/server đã ngắt kết nối');
  });
});

// START SERVER
httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Server & Socket running at http://0.0.0.0:${port}`);
});