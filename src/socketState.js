// ─── SHARED SOCKET STATE ──────────────────────────────────────────────────────
const { Server } = require('socket.io');

/**
 * connections: MẢNG chứa metadata các server đã đăng ký kết nối.
 * Mỗi entry: { url, ip, port, mode, status, server_id, receivedCount, sentCount }
 * Không chứa socket instance — forward qua HTTP POST.
 */
const connections = [];

/**
 * clientSockets: INSTANCE của Socket.io Server.
 * Quản lý các kết nối từ "Khách" (Frontend, Nodes cấp dưới) tìm đến máy này.
 * Khởi tạo qua init() vì cần httpServer.
 */
let clientSockets = null;

const init = (httpServer) => {
  clientSockets = new Server(httpServer, {
    cors: { origin: '*' },
  });
};

const getClientSockets = () => clientSockets;

module.exports = { init, getClientSockets, connections };
