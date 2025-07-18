const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');

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

// Функция для выполнения запросов к OpenAI
function makeOpenAIRequest(method, path, headers, body, res) {
    const options = {
        hostname: 'api.openai.com',
        port: 443,
        path: path,
        method: method,
        timeout: 30000,
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (compatible; ProxyServer/1.0)',
            ...headers
        }
    };

    console.log(`Отправляем ${method} запрос к OpenAI: ${path}`);

    const request = https.request(options, (response) => {
        console.log(`Ответ от OpenAI: ${response.statusCode}`);
        
        let data = '';
        response.on('data', (chunk) => {
            data += chunk;
        });
        
        response.on('end', () => {
            // Передаем заголовки ответа
            Object.keys(response.headers).forEach(key => {
                res.setHeader(key, response.headers[key]);
            });
            
            res.status(response.statusCode).send(data);
        });
    });

    request.on('error', (err) => {
        console.error('Ошибка запроса к OpenAI:', err.message);
        res.status(502).json({
            error: 'Bad Gateway',
            message: 'Не удается подключиться к OpenAI API',
            details: err.message
        });
    });

    request.on('timeout', () => {
        request.destroy();
        res.status(504).json({
            error: 'Gateway Timeout',
            message: 'Превышено время ожидания ответа от OpenAI'
        });
    });

    // Отправляем тело запроса, если есть
    if (body && Object.keys(body).length > 0) {
        request.write(JSON.stringify(body));
    }
    
    request.end();
}

// Обработка всех остальных запросов
app.all('*', (req, res) => {
    const path = req.path;
    const method = req.method;
    const headers = req.headers;
    
    // Удаляем заголовки хоста, чтобы избежать конфликтов
    delete headers.host;
    
    // Получаем тело запроса
    const body = req.body;
    
    // Перенаправляем запрос к OpenAI
    makeOpenAIRequest(method, path, headers, body, res);
});

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