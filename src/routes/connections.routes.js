// ─── CONNECTION MANAGEMENT ROUTES ─────────────────────────────────────────────
const express = require('express');
const axios = require('axios');
const { connections } = require('../socketState');
const { notifyStatusToClients, getActiveClients, removeConnection, disconnectClientSocket } = require('../helpers/notify');

const router = express.Router();

// Ngắt kết nối một client đang kết nối vào server này (theo socketId)
router.post('/api/v1/disconnect-client', async (req, res) => {
  const { socketId } = req.body;
  if (!socketId) return res.status(400).send({ success: false, message: 'Missing socketId' });

  const result = await disconnectClientSocket(socketId);
  return res.status(result.success ? 200 : 404).send(result);
});

// Đăng ký một target server để forward logs (chỉ lưu metadata, không tạo socket)
router.post('/api/v1/create-connection', async (req, res) => {
  const { ip, port, mode } = req.body;
  console.log("create-connection to ", ip, port, mode);
  if (!ip || !port) return res.status(400).send({ success: false, message: 'Missing IP or Port' });

  const url = `http://${ip}:${port}`;
  const existing = connections.find(c => c.url === url);
  if (existing) {
    return res.status(200).send({ success: true, message: 'Already configured', status: existing.status });
  }

  const connMode = mode || 'send';
  let status = 'registered';

  // Kiểm tra target server có online không bằng healthcheck
  try {
    await axios.get(`${url}/healthcheck`, { timeout: 3000 });
    status = 'connected';
  } catch {
    status = 'unreachable';
  }

  connections.push({ url, ip, port, mode: connMode, status, server_id: 'PENDING', receivedCount: 0, sentCount: 0 });
  notifyStatusToClients(url, connMode, status === 'connected' ? 'connected' : 'error');

  return res.status(200).send({ success: true, message: `Registered ${url} (status: ${status})`, ip, port, status });
});

// Xóa connection khỏi danh sách
router.post('/api/v1/remove-connection', (req, res) => {
  const { ip, port } = req.body;
  if (!ip || !port) return res.status(400).send({ success: false, message: 'Missing IP or Port' });

  const url = `http://${ip}:${port}`;
  const result = removeConnection(url);

  return res.status(result.success ? 200 : 404).send(result);
});

// Lấy danh sách connections (source of truth cho FE)
router.get('/api/v1/connections', async (req, res) => {
  // sendList = các client đang kết nối vào server này (FE, nodes cấp dưới)
  const sendList = (await getActiveClients()).map(({ mode, ...rest }) => rest);

  // receiveList = các server đã đăng ký (metadata)
  const receiveList = connections.map(c => ({
    ip: c.ip,
    port: c.port,
    status: c.status,
    server_id: c.server_id || 'PENDING',
    receivedCount: c.receivedCount || 0,
  }));

  res.json({ sendList, receiveList });
});

module.exports = router;
