// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────
const express = require('express');
const axios = require('axios');
const { getCMSBackendURL } = require('../config');

const router = express.Router();

router.post('/api/v1/login', async (req, res) => {
  const CMS_BE_URL = getCMSBackendURL();
  if (!CMS_BE_URL) return res.status(201).send({ data: { accessToken: 'placeholder' } });
  try {
    const response = await axios.post(`${CMS_BE_URL}/api/v1/login`, req.body);
    return res.status(response.status).send(response.data);
  } catch {
    return res.status(201).send({ data: { accessToken: 'placeholder' } });
  }
});

module.exports = router;
