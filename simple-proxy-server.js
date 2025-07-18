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

// Проверка доступности OpenAI API
app.get('/check-openai', async (req, res) => {
    try {
        const https = require('https');
        
        const options = {
            hostname: 'api.openai.com',
            port: 443,
            path: '/v1/models',
            method: 'GET',
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; ProxyServer/1.0)'
            }
        };

        const request = https.request(options, (response) => {
            console.log(`Проверка OpenAI API: ${response.statusCode}`);
            res.json({
                status: 'success',
                openai_status: response.statusCode,
                message: 'OpenAI API доступен'
            });
        });

        request.on('error', (err) => {
            console.error('Ошибка проверки OpenAI:', err.message);
            res.status(502).json({
                status: 'error',
                error: err.code,
                message: 'OpenAI API недоступен',
                details: err.message
            });
        });

        request.on('timeout', () => {
            request.destroy();
            res.status(504).json({
                status: 'error',
                error: 'ETIMEDOUT',
                message: 'Таймаут при проверке OpenAI API'
            });
        });

        request.end();
    } catch (error) {
        console.error('Ошибка при проверке OpenAI:', error);
        res.status(500).json({
            status: 'error',
            message: 'Внутренняя ошибка сервера',
            details: error.message
        });
    }
});

// Прокси для OpenAI API
app.use('/', createProxyMiddleware({
    target: 'https://api.openai.com/v1',
    changeOrigin: true,
    pathRewrite: {
        '^/': '/'
    },
    timeout: 30000, // 30 секунд таймаут
    proxyTimeout: 30000,
    onProxyReq: (proxyReq, req, res) => {
        console.log(`Проксируем на: ${proxyReq.path}`);
        // Добавляем заголовки для лучшей совместимости
        proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (compatible; ProxyServer/1.0)');
    },
    onProxyRes: (proxyRes, req, res) => {
        console.log(`Ответ: ${proxyRes.statusCode}`);
    },
    onError: (err, req, res) => {
        console.error('Ошибка прокси:', err.message);
        console.error('Код ошибки:', err.code);
        
        // Более детальная обработка ошибок
        if (err.code === 'ECONNRESET') {
            console.error('Соединение сброшено. Возможные причины:');
            console.error('- Блокировка доступа к OpenAI API');
            console.error('- Проблемы с сетью');
            console.error('- Неправильная конфигурация прокси');
            res.status(502).json({
                error: 'Bad Gateway',
                message: 'Не удается подключиться к OpenAI API',
                details: 'Проверьте доступность api.openai.com'
            });
        } else if (err.code === 'ENOTFOUND') {
            res.status(502).json({
                error: 'Bad Gateway',
                message: 'Не удается найти сервер OpenAI',
                details: 'Проверьте DNS настройки'
            });
        } else if (err.code === 'ETIMEDOUT') {
            res.status(504).json({
                error: 'Gateway Timeout',
                message: 'Превышено время ожидания ответа от OpenAI',
                details: 'Попробуйте позже'
            });
        } else {
            res.status(500).json({
                error: 'Internal Server Error',
                message: 'Ошибка прокси сервера',
                details: err.message
            });
        }
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