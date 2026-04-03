// ─── LOG ROUTES ───────────────────────────────────────────────────────────────
const express = require('express');
const { getClientSockets, serverSockets } = require('../socketState');

const router = express.Router();

// log APIs example
// 1.	 POST /api/v1/logs
// Method:         POST
// URL:            /api/v1/logs
// IP (nguồn):     ::ffff:127.0.0.1

// Headers:
//   host                  "192.168.1.148"                          // Địa chỉ host/server BE
//   content-type          "application/json"                       // Định dạng dữ liệu gửi lên
//   authorization         "Bearer ..."                             // JWT token xác thực

// Body (application/json):
//   server                object                                   // Thông tin server
//     serial              "Lenovo"                                 // Số serial phần cứng server
//     server_id           "Lenovo"                                 // ID định danh server
//   time                  1773974391                               // UNIX timestamp (giây)
//   device_index          1                                        // Chỉ số thiết bị
//   device_ip             "192.168.1.202:2000"                     // IP + port của camera
//   device_type           "camera"                                 // Loại thiết bị
//   device_name           "Channel 2"                              // Tên kênh / tên camera
//   log_type              "motion"                                 // Loại log/sự kiện
//   description           "A Motion has been detected."            // Mô tả chi tiết
//   snapshot              ""                                       // Base64 Image

// Output: {"success":true}

router.post('/api/v1/logs', async (req, res) => {
  const clientSockets = getClientSockets();

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

  // Track receivedCount và server_id trên serverSocket entry tương ứng
  const senderIp = (req.ip || '').replace('::ffff:', '');
  serverSockets.forEach(entry => {
    const entryIp = new URL(entry.url).hostname;
    if (entryIp === senderIp) {
      entry.receivedCount = (entry.receivedCount || 0) + 1;
      if (!entry.server_id && req.body?.server?.server_id) {
        entry.server_id = req.body.server.server_id + '-' + (req.body.server.serial || '');
      }
    }
  });

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

module.exports = router;
