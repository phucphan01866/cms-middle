// ─── NOTIFICATION & CLIENT HELPERS ────────────────────────────────────────────
const { getClientSockets, serverSockets } = require('../socketState');
const { port } = require('../config');

/**
 * Emit trạng thái kết nối external server cho tất cả FE clients.
 */
const notifyStatusToClients = (url, mode, status, data = null) => {
  const clientSockets = getClientSockets();
  const payload = { url, type: mode, status };

  let eventName = status;
  if (status === 'connected') eventName = 'external-connect';
  if (status === 'error') eventName = 'external-err-connect';
  if (status === 'disconnected') eventName = 'external-disconnected';
  if (status === 'receive-log') eventName = 'receive-log';
  if (status === 'log-sent') eventName = 'log-sent';

  // if (eventName === "receive-log") {
  //   clientSockets.emit(eventName, data);
  // }

  clientSockets.emit(eventName, { ...payload, data });
};

/**
 * Lấy danh sách các client đang kết nối vào server này.
 */
const getActiveClients = async () => {
  const clientSockets = getClientSockets();
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

/**
 * Sync danh sách clients hiện tại cho tất cả FE.
 */
const syncClientsToFrontend = async () => {
  const clientSockets = getClientSockets();
  const clients = await getActiveClients();
  clientSockets.emit('update-clients', clients);
};

/**
 * Ngắt kết nối và xóa một socket client khỏi serverSockets.
 */
const removeServerSocket = (url) => {
  const idx = serverSockets.findIndex(s => s.url === url);
  if (idx === -1) {
    console.log(`[REMOVE] Socket not found for URL: ${url}`);
    return { success: false, message: 'Socket not found' };
  }

  const entry = serverSockets[idx];
  const mode = entry.mode;

  entry.socket.removeAllListeners();
  entry.socket.disconnect();
  serverSockets.splice(idx, 1);

  console.log(`[REMOVE] Disconnected and removed socket: ${url} (mode: ${mode})`);
  notifyStatusToClients(url, mode, 'disconnected');

  return { success: true, message: `Removed ${url}` };
};

/**
 * Ngắt kết nối một client đang kết nối vào server này (theo socketId).
 */
const disconnectClientSocket = async (socketId) => {
  const clientSockets = getClientSockets();
  const sockets = await clientSockets.fetchSockets();
  const target = sockets.find(s => s.id === socketId);
  if (!target) {
    console.log(`[DISCONNECT_CLIENT] Socket not found: ${socketId}`);
    return { success: false, message: 'Client socket not found' };
  }
  target.disconnect(true);
  console.log(`[DISCONNECT_CLIENT] Kicked client: ${socketId}`);
  return { success: true, message: `Disconnected ${socketId}` };
};

module.exports = {
  notifyStatusToClients,
  getActiveClients,
  syncClientsToFrontend,
  removeServerSocket,
  disconnectClientSocket,
};
