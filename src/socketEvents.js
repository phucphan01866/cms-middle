// ─── SOCKET SERVER EVENTS (Đón khách) ────────────────────────────────────────
const { getClientSockets } = require('./socketState');
const { syncClientsToFrontend } = require('./helpers/notify');

const setupSocketEvents = () => {
  const clientSockets = getClientSockets();

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
};

module.exports = setupSocketEvents;
