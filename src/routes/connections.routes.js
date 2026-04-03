// ─── CONNECTION MANAGEMENT ROUTES ─────────────────────────────────────────────
const express = require('express');
const { io: ioClient } = require('socket.io-client');
const { serverSockets } = require('../socketState');
const { getCMSBackendURL } = require('../config');
const { notifyStatusToClients, getActiveClients, removeServerSocket, disconnectClientSocket } = require('../helpers/notify');

const router = express.Router();

// Xóa kết nối socket (legacy endpoint)
router.post('/remove-server', (req, res) => {
  const { url } = req.body;
  removeServerSocket(url);
  res.send({ success: true });
});

// Ngắt kết nối một client đang kết nối vào server này (theo socketId)
router.post('/api/v1/disconnect-client', async (req, res) => {
  const { socketId } = req.body;
  if (!socketId) return res.status(400).send({ success: false, message: 'Missing socketId' });

  const result = await disconnectClientSocket(socketId);
  return res.status(result.success ? 200 : 404).send(result);
});

// Khởi tạo kết nối làm "Khách" tới một server cấp trên khác
router.post('/api/v1/create-connection', (req, res) => {
  const { ip, port, mode } = req.body;
  console.log("create-connection to ", ip, port, mode);
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
  newServerSocket.on('disconnect', () => {
    console.log('removing', url);
    const idx = serverSockets.findIndex(s => s.url === url);
    if (idx !== -1) {
      serverSockets.splice(idx, 1);
    }
    notifyStatusToClients(url, connMode, 'disconnected');
  });
  newServerSocket.on('receive-log', (data) => {
    notifyStatusToClients(url, connMode, 'receive-log', data);
  });

  serverSockets.push({ url, socket: newServerSocket, mode: connMode });
  return res.status(200).send({ success: true, message: `${getCMSBackendURL()} telling ${url} to become a client`, ip, port });
});

// Xóa kết nối socket client khỏi serverSockets
router.post('/api/v1/remove-connection', (req, res) => {
  const { ip, port } = req.body;
  if (!ip || !port) return res.status(400).send({ success: false, message: 'Missing IP or Port' });

  const url = `http://${ip}:${port}`;
  const result = removeServerSocket(url);

  return res.status(result.success ? 200 : 404).send(result);
});

// Lấy danh sách connections (source of truth cho FE)
router.get('/api/v1/connections', async (req, res) => {
  // sendList = các client đang kết nối vào server này (FE, nodes cấp dưới)
  const sendList = (await getActiveClients()).map(({ mode, ...rest }) => rest);

  // receiveList = các server mà máy này kết nối tới (upstream)
  const receiveList = serverSockets.map(s => {
    const parsed = new URL(s.url);
    return {
      ip: parsed.hostname,
      port: parsed.port,
      status: s.socket.connected ? 'connected' : 'disconnected',
      server_id: s.server_id || 'PENDING',
      receivedCount: s.receivedCount || 0,
    };
  });

  res.json({ sendList, receiveList });
});

module.exports = router;
