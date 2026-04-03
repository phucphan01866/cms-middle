// ─── SHARED SOCKET STATE ──────────────────────────────────────────────────────
const { Server } = require('socket.io');

/**
 * serverSockets: MẢNG chứa các instance socket client.
 * Lưu trữ các kết nối mà máy này chủ động kết nối tới các "Máy chủ" khác (Upstream).
 */
const serverSockets = [];

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

module.exports = { init, getClientSockets, serverSockets };
