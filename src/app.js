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
  const startedAt = Date.now();
  const timestamp = new Date().toISOString();

  let responseBody;

  const originalSend = res.send.bind(res);
  const originalJson = res.json.bind(res);

  res.send = (body) => {
    responseBody = body;
    return originalSend(body);
  };

  res.json = (body) => {
    responseBody = body;
    return originalJson(body);
  };

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    const contentLength = res.getHeader('content-length');

    const serialize = (body) => {
      if (body === undefined) return undefined;
      if (Buffer.isBuffer(body)) return `<Buffer length=${body.length}>`;
      if (typeof body === 'string') return body;
      try {
        return JSON.stringify(body);
      } catch {
        return String(body);
      }
    };

    const maxLen = 2000;
    let responseText = serialize(responseBody);
    if (typeof responseText === 'string' && responseText.length > maxLen) {
      responseText = `${responseText.slice(0, maxLen)}...<truncated>`;
    }

    const lengthPart = contentLength ? ` ${contentLength}b` : '';
    const bodyPart = responseText === undefined ? '' : ` | response=${responseText}`;

    console.log(
      `[${timestamp}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs}ms)${lengthPart}${bodyPart}`
    );
  });

  next();
});

// // Auto-forward logic cho các route không khai báo trong file này
// app.use(async (req, res, next) => {
//   if (req.method !== 'POST' || declaredRoutes.includes(req.path)) return next();
//   const CMS_BE_URL = getCMSBackendURL();
//   if (!CMS_BE_URL) return res.status(201).send({ success: true });
//   try {
//     const response = await axios.post(`${CMS_BE_URL}${req.originalUrl}`, req.body);
//     return res.status(response.status).send(response.data);
//   } catch {
//     return res.status(201).send({ success: true });
//   }
// });

// ─── Mount Routes ────────────────────────────────────────────────────────────
app.use(healthRoutes);
app.use(authRoutes);
app.use(logsRoutes);
app.use(connectionsRoutes);

module.exports = app;
