const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PROXY_PORT || 8080;

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Обработка OPTIONS запросов
app.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.sendStatus(200);
});

// Логирование запросов
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Статус эндпоинт
app.get('/status', (req, res) => {
    res.status(200).send('OK\n');
});

// Специальные эндпоинты для OpenAI API
app.post('/chat/completions', (req, res) => {
    const headers = req.headers;
    delete headers.host;
    
    console.log('=== Запрос chat/completions ===');
    console.log('Заголовки:', Object.keys(headers));
    console.log('Тело запроса:', JSON.stringify(req.body, null, 2));
    
    makeOpenAIRequest('POST', '/v1/chat/completions', headers, req.body, res);
});

app.get('/models', (req, res) => {
    const headers = req.headers;
    delete headers.host;
    makeOpenAIRequest('GET', '/v1/models', headers, null, res);
});

app.get('/models/:model', (req, res) => {
    const headers = req.headers;
    delete headers.host;
    makeOpenAIRequest('GET', `/v1/models/${req.params.model}`, headers, null, res);
});

// Обработка POST запроса на корневой путь (перенаправляем на chat/completions)
app.post('/', (req, res) => {
    const headers = req.headers;
    delete headers.host;
    console.log('POST запрос на корневой путь, перенаправляем на /v1/chat/completions');
    makeOpenAIRequest('POST', '/v1/chat/completions', headers, req.body, res);
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
            'Accept-Encoding': 'gzip, deflate',
            ...headers
        }
    };

    console.log(`Отправляем ${method} запрос к OpenAI: ${path}`);

    const request = https.request(options, (response) => {
        console.log(`Ответ от OpenAI: ${response.statusCode}`);
        console.log('Заголовки ответа от OpenAI:', response.headers);
        
        // Проверяем, сжат ли ответ
        const isCompressed = response.headers['content-encoding'] === 'gzip';
        
        if (isCompressed) {
            // Если ответ сжат, распаковываем его
            const zlib = require('zlib');
            const gunzip = zlib.createGunzip();
            
            let data = '';
            response.pipe(gunzip);
            
            gunzip.on('data', (chunk) => {
                data += chunk;
            });
            
            gunzip.on('end', () => {
                try {
                    // Устанавливаем правильные заголовки
                    res.setHeader('Content-Type', 'application/json');
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
                    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
                    
                    console.log('Распакованный ответ от OpenAI:', data.substring(0, 200) + '...');
                    
                    if (response.statusCode >= 200 && response.statusCode < 300) {
                        res.status(response.statusCode).send(data);
                    } else {
                        console.error('Ошибка от OpenAI:', response.statusCode, data);
                        res.status(response.statusCode).send(data);
                    }
                } catch (error) {
                    console.error('Ошибка при обработке распакованного ответа:', error);
                    res.status(500).json({
                        error: 'Internal Server Error',
                        message: 'Ошибка обработки ответа от OpenAI'
                    });
                }
            });
            
            gunzip.on('error', (error) => {
                console.error('Ошибка распаковки:', error);
                res.status(500).json({
                    error: 'Internal Server Error',
                    message: 'Ошибка распаковки ответа от OpenAI'
                });
            });
        } else {
            // Если ответ не сжат, обрабатываем как обычно
            let data = '';
            response.on('data', (chunk) => {
                data += chunk;
            });
            
            response.on('end', () => {
                try {
                    // Устанавливаем правильные заголовки
                    res.setHeader('Content-Type', 'application/json');
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
                    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
                    
                    console.log('Несжатый ответ от OpenAI:', data.substring(0, 200) + '...');
                    
                    if (response.statusCode >= 200 && response.statusCode < 300) {
                        res.status(response.statusCode).send(data);
                    } else {
                        console.error('Ошибка от OpenAI:', response.statusCode, data);
                        res.status(response.statusCode).send(data);
                    }
                } catch (error) {
                    console.error('Ошибка при обработке ответа:', error);
                    res.status(500).json({
                        error: 'Internal Server Error',
                        message: 'Ошибка обработки ответа от OpenAI'
                    });
                }
            });
        }
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

// Обработка всех остальных запросов (кроме уже обработанных выше)
app.all('*', (req, res) => {
    const path = req.path;
    const method = req.method;
    const headers = req.headers;
    
    // Удаляем заголовки хоста, чтобы избежать конфликтов
    delete headers.host;
    
    // Получаем тело запроса
    const body = req.body;
    
    // Если запрос идет на корневой путь, перенаправляем на /v1
    let openaiPath = path;
    if (path === '/' || path === '') {
        openaiPath = '/v1/';
    } else if (!path.startsWith('/v1/')) {
        openaiPath = `/v1${path}`;
    }
    
    console.log(`Оригинальный путь: ${path} -> OpenAI путь: ${openaiPath}`);
    
    // Перенаправляем запрос к OpenAI
    makeOpenAIRequest(method, openaiPath, headers, body, res);
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