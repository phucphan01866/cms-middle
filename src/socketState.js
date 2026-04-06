// ─── SHARED SOCKET STATE ──────────────────────────────────────────────────────
 const { Server } = require('socket.io');

/**
 * Global array to store metadata for registered external connections.
 * Structure: { url, ip, port, mode, status, server_id, receivedCount, sentCount }
 */
const connections = [];

/**
 * Global variable to hold the Socket.IO server instance.
 */
let clientSockets = null;

/**
 * Initializes the Socket.IO server on the given HTTP server.
 * @param {object} httpServer - The Node.js HTTP server instance.
 */
const init = (httpServer) => {
  clientSockets = new Server(httpServer, {
    cors: { origin: '*' },
  });
};

/**
 * Getter for the client socket server instance.
 * @returns {object} The Socket.IO server instance.
 */
const getClientSockets = () => clientSockets;

module.exports = { init, getClientSockets, connections };
