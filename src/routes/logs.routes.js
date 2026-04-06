// ─── LOG ROUTES ───────────────────────────────────────────────────────────────
const express = require('express');
const axios = require('axios');
const { getClientSockets, connections } = require('../socketState');
const { notifyStatusToClients } = require('../helpers/notify');

const router = express.Router();

// ─── Nhận log từ nguồn gốc (Camera, VMS, etc.) ──────────────────────────────
/**
 * @route POST /api/v1/logs
 * @description Receives logs from sources, broadcasts to FE clients, and forwards to registered target servers.
 * @body {object} logData.required - The log data to be processed.
 * @returns {object} 200 - { success: true }
 */
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

  // Lấy các sockets FE hiện tại và cập nhật biến đếm sentCount
  const sockets = await clientSockets.fetchSockets();
  sockets.forEach(s => {
    s.data.sentCount = (s.data.sentCount || 0) + 1;
  });

  // 1. Phát dữ liệu cho các Client của mình (Frontend) qua Socket.IO
  const serverId = req.body?.server?.server_id || 'UNKNOWN';
  const sourceIp = (req.ip || '').replace('::ffff:', '');
  console.log(`[DISPATCH] Log from ${serverId} (${sourceIp}) → broadcasting to ${sockets.length} client(s)`);
  sockets.forEach(s => {
    const clientIp = (s.handshake.address || '').replace('::ffff:', '');
    console.log(`  ├─ [CLIENT] ${clientIp} (socket: ${s.id}) | sentCount: ${s.data.sentCount}`);
  });
  clientSockets.emit('receive-log', logData);
  clientSockets.emit('log-dispatched', { timestamp: logData.timestamp });

  // Track receivedCount và server_id trên connection entry tương ứng
  const senderIp = (req.ip || '').replace('::ffff:', '');
  connections.forEach(entry => {
    if (entry.ip === senderIp) {
      entry.receivedCount = (entry.receivedCount || 0) + 1;
      if ((!entry.server_id || entry.server_id === 'PENDING') && req.body?.server?.server_id) {
        entry.server_id = req.body.server.server_id + '-' + (req.body.server.serial || '');
      }
    }
  });

  // 2. Forward log tới các target server đã đăng ký (mode === 'send') qua HTTP POST
  const sendTargets = connections.filter(c => c.mode === 'send');
  if (sendTargets.length > 0) {
    console.log(`[FORWARD] Forwarding log to ${sendTargets.length} target server(s) via HTTP POST:`);
  }
  for (const conn of sendTargets) {
    try {
      console.log(`  ├─ [TARGET] ${conn.url} (mode: ${conn.mode})`);
      await axios.post(`${conn.url}/api/v1/forward-logs`, logData, { timeout: 5000 });
      conn.sentCount = (conn.sentCount || 0) + 1;
      if (conn.status !== 'connected') {
        conn.status = 'connected';
        notifyStatusToClients(conn.url, conn.mode, 'connected');
      }
    } catch (err) {
      console.error(`  ├─ [FORWARD_FAIL] ${conn.url}: ${err.message}`);
      if (conn.status !== 'error') {
        conn.status = 'error';
        notifyStatusToClients(conn.url, conn.mode, 'error');
      }
    }
  }

  return res.status(200).send({ success: true });
});

// ─── Nhận log từ server khác (thay thế socket event 'forward-log') ───────────
/**
 * @route POST /api/v1/forward-logs
 * @description Receives forwarded logs from another server and broadcasts them to local FE clients.
 * @body {object} logData.required - The forwarded log data.
 * @returns {object} 200 - { success: true }
 */
router.post('/api/v1/forward-logs', async (req, res) => {
  const clientSockets = getClientSockets();

  console.log(`[RECEIVE_FORWARD] Log received via HTTP POST from ${req.ip}`);

  // Phát lại cho FE clients
  clientSockets.emit('receive-log', req.body);
  clientSockets.emit('log-dispatched', { timestamp: req.body?.timestamp || new Date().toISOString() });

  return res.status(200).send({ success: true });
});

module.exports = router;
