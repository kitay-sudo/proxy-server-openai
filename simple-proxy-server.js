const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
const PORT = process.env.PROXY_PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Логирование запросов
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Статус эндпоинт
app.get('/status', (req, res) => {
    res.status(200).send('OK\n');
});

// Прокси для OpenAI API
app.use('/', createProxyMiddleware({
    target: 'https://api.openai.com/v1',
    changeOrigin: true,
    pathRewrite: {
        '^/': '/'
    },
    onProxyReq: (proxyReq, req, res) => {
        console.log(`Проксируем на: ${proxyReq.path}`);
    },
    onProxyRes: (proxyRes, req, res) => {
        console.log(`Ответ: ${proxyRes.statusCode}`);
    },
    onError: (err, req, res) => {
        console.error('Ошибка прокси:', err.message);
        res.status(500).send('Ошибка прокси сервера');
    }
}));

// Обработка ошибок
app.use((err, req, res, next) => {
    console.error('Ошибка сервера:', err);
    res.status(500).send('Внутренняя ошибка сервера');
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 Прокси сервер запущен на порту ${PORT}`);
    console.log(`📡 Проксирует запросы на: https://api.openai.com/v1`);
    console.log(`🔗 Статус: http://localhost:${PORT}/status`);
});

module.exports = app; 