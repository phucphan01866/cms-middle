// ─── SOCKET SERVER EVENTS (BE↔FE only) ───────────────────────────────────────
const { getClientSockets } = require('./socketState');
const { syncClientsToFrontend } = require('./helpers/notify');

/**
 * Sets up Socket.IO event listeners for the client server.
 * Handles 'connection', 'message', and 'disconnect' events.
 */
const setupSocketEvents = () => {
  const clientSockets = getClientSockets();

  clientSockets.on('connection', (socket) => {
    console.log('[NODE_CONNECTED] New client/node connected. ID:', socket.id);

    // Khởi tạo sentCount cho socket này
    socket.data = { sentCount: 0 };

    // Sync client list to all connected frontends
    syncClientsToFrontend();

    socket.on('message', (data) => {
      console.log(`[MESSAGE] Received message from client ${socket.id} — broadcasting`);
      clientSockets.emit('message', data);
    });

    socket.on('disconnect', () => {
      console.log("socket: ", clientSockets)
      syncClientsToFrontend();
    });
  });
};

module.exports = setupSocketEvents;
