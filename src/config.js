// ─── CONFIG & URL HELPERS ─────────────────────────────────────────────────────
const port = process.env.THIS_PORT || 5050;

const getURL = (host, p) => (host && p ? `http://${host}:${p}` : null);
const getCMSBackendURL = () => getURL(process.env.BE_CMS_IP, process.env.BE_CMS_PORT);
const getForwardURL = () => getURL(process.env.FORWARD_IP, process.env.FORWARD_PORT);

const declaredRoutes = [
  '/api/v1/login',
  '/api/v1/logs',
  '/api/v1/forward-logs',
  '/healthcheck',
  '/api/v1/create-connection',
  '/api/v1/remove-connection',
  '/api/v1/connections',
  '/server-information',
];

module.exports = { port, getURL, getCMSBackendURL, getForwardURL, declaredRoutes };
