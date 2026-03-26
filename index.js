
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const fs = require('fs');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const port = process.env.THIS_PORT || 5050;

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

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));

// Middleware log chi tiết các request đi tới
app.use((req, res, next) => {
  const now = new Date().toISOString();
  console.log(`[${now}] ${req.method} ${req.originalUrl} - IP: ${req.ip}`);
  // if (req.method === 'POST' && Object.keys(req.body).length > 0) {
  //   console.log('Request Body:', JSON.stringify(req.body, null, 2));
  // }
  next();
});

// Helpers have been moved to the top

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
    fs.writeFileSync(fileName, JSON.stringify(logData, null, 2));
  } catch { }
  io.emit("receive-log", logData);
  if (forward_list.length === 0) return res.status(201).send({ success: true });

  for (const url of forward_list) {
    try {
      await axios.post(`${url}/api/v1/logs`, req.body);
    } catch (error) {
      console.error(`Log forwarding error to ${url}:`, error.message);
    }
  }
  return res.status(201).send({ success: true });
});

app.get('/healthcheck', (req, res) => res.status(200).send({ status: 'OK' }));

// app.listen(port, () => {
//   console.log(`Server running at http://localhost:${port}`);
// });


// Socket config
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Cho phép FE kết nối
    methods: ["GET", "POST"]
  }
});
io.on('connection', (socket) => {
  console.log('Một user đã kết nối:', socket.id);
  socket.on('message', (data) => {
    console.log('Nhận tin nhắn:', data);
    // Gửi lại cho tất cả mọi người
    io.emit('message', data);
  });
  socket.on('disconnect', () => {
    console.log('User đã ngắt kết nối');
  });
});
// THAY ĐỔI: Sử dụng httpServer.listen và lắng nghe trên 0.0.0.0 để thiết bị khác có thể kết nối
httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Server & Socket running at http://0.0.0.0:${port}`);
});