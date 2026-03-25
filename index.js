
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const fs = require('fs');

const app = express();
const port = process.env.THIS_PORT || 5050;

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));

// Helper to get backend URL
const getCMSBackendURL = () => {
  const ip = process.env.BE_CMS_IP;
  const port = process.env.BE_CMS_PORT;
  return ip && port ? `http://${ip}:${port}` : null;
};

// Generic forwarder
const forward = (path, fallback) => {
  app.post(path, async (req, res) => {
    const CMS_BE_URL = getCMSBackendURL();
    if (!CMS_BE_URL) return res.status(201).send(fallback);
    try {
      const response = await axios.post(`${CMS_BE_URL}${path}`, req.body);
      return res.status(response.status).send(response.data);
    } catch (error) {
      return res.status(201).send(fallback);
    }
  });
};


// Định nghĩa các route đã khai báo riêng
const declaredRoutes = [
  '/api/v1/login',
  '/api/v1/server',
  '/api/v1/devices',
  '/api/v1/logs',
  '/healthcheck'
];

// Route login riêng (vì có fallback đặc biệt)
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
  } catch {}

  const CMS_BE_URL = getCMSBackendURL();
  if (!CMS_BE_URL) return res.status(201).send({ success: true });
  try {
    const response = await axios.post(`${CMS_BE_URL}/api/v1/logs`, req.body);
    return res.status(response.status).send(response.data);
  } catch {
    return res.status(201).send({ success: true });
  }
});

app.get('/healthcheck', (req, res) => res.status(200).send({ status: 'OK' }));

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
