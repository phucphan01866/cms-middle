require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const fs = require('fs');
const app = express();

const port = process.env.THIS_PORT || 5050;

app.use(cors({
    origin: true,
    credentials: true
}));

app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));

// Middleware Logger
app.use((req, res, next) => {
    const { method, originalUrl, ip, body } = req;
    const startTime = Date.now();

    res.on('finish', () => {
        const { statusCode } = res;
        const duration = Date.now() - startTime;

        console.log(`[HTTP] ${method} ${originalUrl} ${statusCode} - ${ip} - ${duration}ms`);

        // Mỗi request vào /logs tạo 1 file log mới trong thư mục logs/
        if (originalUrl.includes('/logs')) {
            const logsDir = './logs';
            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir);
            }

            const timestamp = new Date().toISOString().replace(/:/g, '-');
            const fileName = `${logsDir}/log_${timestamp}_${Math.floor(Math.random() * 1000)}.json`;
            const logData = {
                timestamp: new Date().toISOString(),
                method,
                originalUrl,
                statusCode,
                ip,
                duration,
                body
            };

            try {
                fs.writeFileSync(fileName, JSON.stringify(logData, null, 2));
            } catch (err) {
                console.error('Không thể tạo file log mới:', err);
            }
        }

        if (body && Object.keys(body).length > 0) {
            console.log(`Body: ${JSON.stringify(body, null, 2)}`);
        }
    });

    next();
});

// Hàm hỗ trợ lấy URL Backend với logic kiểm tra hợp lệ
const getCMSBackendURL = () => {
    const ip = process.env.BE_CMS_IP;
    const port = process.env.BE_CMS_PORT;
    if (!ip || !port) return null;
    return `http://${ip}:${port}`;
};

app.post('/api/v1/login', async (req, res) => {
    const CMS_BE_URL = getCMSBackendURL();

    // Nếu không có URL Backend, fallback về code cũ
    if (!CMS_BE_URL) {
        return res.status(201).send({ data: { "accessToken": "" } });
    }

    try {
        const response = await axios.post(`${CMS_BE_URL}/api/v1/login`, req.body);
        return res.status(response.status).send(response.data);
    } catch (error) {
        console.error(`Forwarding login failed (${CMS_BE_URL}), falling back to dummy response. Error:`, error.message);
        // Fallback khi lỗi 
        return res.status(201).send({ data: { "accessToken": "" } });
    }
});

app.post('/api/v1/server', async (req, res) => {
    const CMS_BE_URL = getCMSBackendURL();

    if (!CMS_BE_URL) {
        return res.status(201).send({ success: true });
    }

    try {
        const response = await axios.post(`${CMS_BE_URL}/api/v1/server`, req.body);
        return res.status(response.status).send(response.data);
    } catch (error) {
        console.error(`Forwarding server regis failed (${CMS_BE_URL}), falling back. Error:`, error.message);
        return res.status(201).send({ success: true });
    }
});

app.post('/api/v1/devices', async (req, res) => {
    const CMS_BE_URL = getCMSBackendURL();

    if (!CMS_BE_URL) {
        return res.status(201).send({ success: true });
    }

    try {
        const response = await axios.post(`${CMS_BE_URL}/api/v1/devices`, req.body);
        return res.status(response.status).send(response.data);
    } catch (error) {
        console.error(`Forwarding devices failed (${CMS_BE_URL}), falling back. Error:`, error.message);
        return res.status(201).send({ success: true });
    }
});

app.post('/api/v1/logs', (req, res) => {
    // Luôn trả về thành công cho logs, đang cấu hình in logs ra file ở trên
    return res.status(201).send({
        success: true,
    });
});

app.listen(port, () => {
    console.log(`Server đang chạy tại http://localhost:${port}`);
});
