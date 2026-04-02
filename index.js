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

//clientSocket - các kết nối với FE
//serverSocket - các kết nối với các server truyền data vào

// log APIs example
// 1.	 POST /api/v1/logs
// Method:         POST
// URL:            /api/v1/logs
// IP (nguồn):     ::ffff:127.0.0.1

// Headers:
//   host                  "192.168.1.148"                          // Địa chỉ host/server BE
//   x-forwarded-scheme    "http"                                   // Scheme gốc (http/https)
//   x-forwarded-proto     "http"                                   // Protocol gốc
//   x-forwarded-for       "172.18.0.1"                             // IP gốc của client (thường qua proxy)
//   x-real-ip             "172.18.0.1"                             // IP thực của client (từ proxy/reverse proxy)
//   content-length        124194                                   // Kích thước body tính bằng byte
//   content-type          "application/json"                       // Định dạng dữ liệu gửi lên
//   accept                "*.*"                                    // Client chấp nhận mọi loại response
//   authorization         "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOiI2OTU3OWQwMGFjMDM5Yzg3NWFjOGEyOGQiLCJpYXQiOjE3NzM5Njk5MjYsImV4cCI6MTgwNTUyNzUyNn0.DMIwdtRkGwXKge-ZSLlspbNUJjqpK97WYgmxBUTSB6Q"
//                                                                  // JWT token xác thực (Bearer)

// Body (application/json):
//   server                object                                   // Thông tin server
//     serial              "Lenovo"                                 // Số serial phần cứng server
//     server_id           "Lenovo"                                 // ID định danh server
//   time                  1773974391                               // UNIX timestamp (giây) - thời điểm sự kiện xảy ra
//   device_index          1                                        // Chỉ số thiết bị (thứ tự camera/channel)
//   device_ip             "192.168.1.202:2000"                     // IP + port của camera/thiết bị
//   device_type           "camera"                                 // Loại thiết bị
//   device_name           "Channel 2"                              // Tên kênh / tên camera trên VMS
//   log_type              "motion"                                 // Loại log/sự kiện
//   description           "A Motion has been detected."            // Mô tả chi tiết sự kiện (tùy theo loại log_time)
//   snapshot							 // Base64 Image

// Output Json có dạng
// {"success":true}}						 // Để giữ trạng thái handshake

// 2.	 Request Type: POST /api/v1/logs
// Method:         POST
// URL:            /api/v1/logs
// IP (nguồn):     ::ffff:127.0.0.1

// Headers:
//   host                  "192.168.1.148"                          // Địa chỉ host/server BE
//   x-forwarded-scheme    "http"                                   // Scheme gốc (http/https) từ client
//   x-forwarded-proto     "http"                                   // Protocol gốc
//   x-forwarded-for       "172.18.0.1"                             // IP gốc của client (qua proxy/load balancer)
//   x-real-ip             "172.18.0.1"                             // IP thực tế của client (từ reverse proxy)
//   content-length        187945                                   // Kích thước body (byte)
//   content-type          "application/json"                       // Định dạng dữ liệu body
//   accept                "*.*"                                    // Client chấp nhận mọi loại response
//   authorization         "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOiI2OTU3OWQwMGFjMDM5Yzg3NWFjOGEyOGQiLCJpYXQiOjE3NzM5Njk5MjYsImV4cCI6MTgwNTUyNzUyNn0.DMIwdtRkGwXKge-ZSLlspbNUJjqpK97WYgmxBUTSB6Q"
//                                                                  // JWT Bearer token

// Body (application/json):
//   server                object                                   // Thông tin server ghi log
//     serial              "Lenovo"                                 // Số serial phần cứng của server
//     server_id           "Lenovo"                                 // ID định danh server
//   time                  1773974388                               // UNIX timestamp (giây) - thời điểm sự kiện
//   device_index          1                                        // Chỉ số thiết bị (thứ tự camera/channel)
//   device_ip             "192.168.1.202:2000"                     // Địa chỉ IP + port của thiết bị camera
//   device_type           "camera"                                 // Loại thiết bị
//   device_name           "Channel 2"                              // Tên kênh / tên camera trên VMS
//   log_type              "crosswire.counting.vehicle.result"      // Loại log
//   description           "785"                                    // Kết quả (ở đây là số lượng xe/phương tiện đã được ghi nhận)

// Query parameters:     {}                                         // Không có tham số query string

// Output Json có dạng
// {"success":true}}						 // Để giữ trạng thái handshake



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
  // if (mode = 'receive') {
  //   console.log("received")
  // }
  // Ánh xạ status sang event name mà FE đang lắng nghe
  let eventName = status;
  if (status === 'connected') eventName = 'external-connect';
  if (status === 'error') eventName = 'external-err-connect';
  if (status === 'disconnected') eventName = 'external-disconnected';
  if (status === 'receive-log') eventName = 'receive-log';
  if (status === 'log-sent') eventName = 'log-sent';

  if (status === 'receive-log') {
    // console.log("received to fe", data)
  }
  clientSockets.emit(eventName, { ...payload, data });
};

const getActiveClients = async () => {
  const sockets = await clientSockets.fetchSockets();
  return sockets.map(s => {
    let clientPort = port;
    if (s.handshake?.headers?.host) {
      clientPort = s.handshake.headers.host.split(':')[1] || port;
    }
    return {
      socketId: s.id,
      ip: (s.handshake.address || '').replace('::ffff:', ''),
      port: clientPort,
      status: 'connected',
      mode: 'send',
      sentCount: s.data.sentCount || 0
    };
  });
};

const syncClientsToFrontend = async () => {
  const clients = await getActiveClients();
  clientSockets.emit('update-clients', clients);
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
  if (req.body && !req.body.sender_ip) {
    req.body.sender_ip = (req.socket?.remoteAddress || req.ip || '').replace('::ffff:', '');
  }
  const logData = {
    timestamp: new Date().toISOString(),
    method: req.method,
    originalUrl: req.originalUrl,
    statusCode: res.statusCode,
    ip: req.ip,
    body: req.body,
  };
  // console.log('logData', req);
  // GHI CHÚ: Dữ liệu logData bao gồm `body` giữ nguyên vẹn cấu trúc gửi lên từ các Node/Camera.
  // Các field như `server`, `device_ip`, v.v... được gửi nguyên trạng.
  // Tại FE, hook useSocketManager dùng dữ liệu này ánh xạ mapping trực tiếp với LogData type (simplified). Không conflict xảy ra.

  // Lấy các sockets hiện tại và cập nhật biến đếm sentCount
  const sockets = await clientSockets.fetchSockets();
  sockets.forEach(s => {
    s.data.sentCount = (s.data.sentCount || 0) + 1;
  });

  // 1. Phát dữ liệu cho các Client của mình (Frontend hoặc Node cấp dưới)
  const serverId = req.body?.server?.server_id || 'UNKNOWN';
  const sourceIp = (req.ip || '').replace('::ffff:', '');
  console.log(`[DISPATCH] Log from ${serverId} (${sourceIp}) → broadcasting to ${sockets.length} client(s)`);
  sockets.forEach(s => {
    const clientIp = (s.handshake.address || '').replace('::ffff:', '');
    console.log(`  ├─ [CLIENT] ${clientIp} (socket: ${s.id}) | sentCount: ${s.data.sentCount}`);
  });
  clientSockets.emit('receive-log', logData);
  clientSockets.emit('log-dispatched', { timestamp: logData.timestamp });

  // 2. Chuyển tiếp (Forward) log lên các Server cấp trên (Upstream)
  const sendUpstreams = serverSockets.filter(s => s.socket.connected && s.mode === 'send');
  if (sendUpstreams.length > 0) {
    console.log(`[FORWARD] Forwarding log to ${sendUpstreams.length} upstream server(s):`);
  }
  serverSockets.forEach(({ url, socket, mode }) => {
    if (socket.connected && mode === 'send') {
      console.log(`  ├─ [UPSTREAM] ${url} (mode: ${mode}, connected: ${socket.connected})`);
      socket.emit('forward-log', logData);
    } else if (mode === 'send') {
      console.log(`  ├─ [UPSTREAM_SKIP] ${url} (mode: ${mode}, connected: ${socket.connected}) — not connected`);
    }
  });

  return res.status(201).send({ success: true });
});


// Khởi tạo kết nối làm "Khách" tới một server cấp trên khác
app.post('/api/v1/create-connection', (req, res) => {

  const { ip, port, mode } = req.body;
  console.log("create-connection to ", ip, port, mode)
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
  newServerSocket.on('receive-log', (data) => {
    // console.log("received", data)
    notifyStatusToClients(url, connMode, 'receive-log', data)
  });

  serverSockets.push({ url, socket: newServerSocket, mode: connMode });
  return res.status(200).send({ success: true, message: `${getCMSBackendURL()} telling ${url} to become a client`, ip, port });
});

// ─── SECTION 6: SOCKET SERVER EVENTS (Đón khách) ─────────────────────────────
clientSockets.on('connection', (socket) => {
  console.log('[NODE_CONNECTED] New client/node connected. ID:', socket.id);

  // Khởi tạo sentCount cho socket này
  socket.data = { sentCount: 0 };

  // Sync client list to all connected frontends
  syncClientsToFrontend();

  socket.on('forward-log', (data) => {
    // Nhận log từ một máy khác (máy đó coi mình là server) -> Phát lại cho FE của mình
    console.log(`[RECEIVE] Log received from node ${socket.id} — broadcasting to clients`);
    clientSockets.emit('receive-log', data);
    clientSockets.emit('log-dispatched', { timestamp: data.timestamp });
  });

  socket.on('message', (data) => {
    console.log(`[MESSAGE] Received message from client ${socket.id} — broadcasting`);
    clientSockets.emit('message', data);
  });

  socket.on('disconnect', () => {
    console.log('[NODE_DISCONNECTED] ID:', socket.id);
    syncClientsToFrontend();
  });
});

// ─── SECTION 7: SERVER STARTUP ───────────────────────────────────────────────
httpServer.listen(port, '0.0.0.0', () => {
  console.log(`\n🚀 MIDDLE SERVER RUNNING AT: http://0.0.0.0:${port}`);
  console.log(`📡 CLIENT SOCKET SERVER READY (PORT ${port})\n`);
});