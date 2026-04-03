// ─── EXPRESS APP & MIDDLEWARE ─────────────────────────────────────────────────
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const { getCMSBackendURL, declaredRoutes } = require('./config');

// Route imports
const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const logsRoutes = require('./routes/logs.routes');
const connectionsRoutes = require('./routes/connections.routes');

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));

// Request Logger
app.use((req, res, next) => {
  // console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Auto-forward logic cho các route không khai báo trong file này
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

// ─── Mount Routes ────────────────────────────────────────────────────────────
app.use(healthRoutes);
app.use(authRoutes);
app.use(logsRoutes);
app.use(connectionsRoutes);

module.exports = app;
