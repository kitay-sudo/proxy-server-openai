const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const winston = require('winston');
const fs = require('fs');
const path = require('path');

// Создаем папку для логов, если её нет
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// Настройка логирования
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'proxy-server' },
    transports: [
        // Логи ошибок в отдельный файл
        new winston.transports.File({ 
            filename: path.join(logsDir, 'error.log'), 
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        // Все логи в общий файл
        new winston.transports.File({ 
            filename: path.join(logsDir, 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    ]
});

// Добавляем логирование в консоль для разработки
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

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

// Логирование запросов (только для отладки)
if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
        logger.info(`${req.method} ${req.url}`, {
            method: req.method,
            url: req.url,
            ip: req.ip
        });
        next();
    });
}

// Статус эндпоинт
app.get('/status', (req, res) => {
    res.status(200).send('OK\n');
});

// Специальные эндпоинты для OpenAI API
app.post('/chat/completions', (req, res) => {
    const headers = req.headers;
    delete headers.host;
    
    // Логируем только основную информацию
    logger.info('Chat запрос', {
        model: req.body?.model,
        messageCount: req.body?.messages?.length
    });
    
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
            logger.error('Ошибка проверки OpenAI', {
                error: err.message,
                code: err.code,
                stack: err.stack
            });
            res.status(502).json({
                status: 'error',
                error: err.code,
                message: 'OpenAI API недоступен',
                details: err.message
            });
        });

        request.on('timeout', () => {
            request.destroy();
            logger.error('Таймаут при проверке OpenAI API');
            res.status(504).json({
                status: 'error',
                error: 'ETIMEDOUT',
                message: 'Таймаут при проверке OpenAI API'
            });
        });

        request.end();
            } catch (error) {
            logger.error('Ошибка при проверке OpenAI', {
                error: error.message,
                stack: error.stack
            });
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
            'Accept-Encoding': 'identity', // Отключаем сжатие
            ...headers
        }
    };

    // Логируем только для отладки
    if (process.env.NODE_ENV === 'development') {
        logger.info(`OpenAI запрос: ${method} ${path}`);
    }

    const request = https.request(options, (response) => {
        // Логируем только статус ответа
        logger.info(`OpenAI ответ: ${response.statusCode}`);
        
        // Проверяем тип сжатия
        const contentEncoding = response.headers['content-encoding'];
        
        if (contentEncoding === 'br') {
            // Brotli сжатие
            const zlib = require('zlib');
            const brotli = zlib.createBrotliDecompress();
            
            let data = '';
            response.pipe(brotli);
            
            brotli.on('data', (chunk) => {
                data += chunk;
            });
            
            brotli.on('end', () => {
                try {
                    // Устанавливаем правильные заголовки
                    res.setHeader('Content-Type', 'application/json');
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
                    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
                    
                    // Логируем только для отладки
                    if (process.env.NODE_ENV === 'development') {
                        logger.info(`Brotli ответ: ${data.length} символов`);
                    }
                    
                    if (response.statusCode >= 200 && response.statusCode < 300) {
                        // Проверяем, что это валидный JSON
                        try {
                            JSON.parse(data);
                            res.status(response.statusCode).send(data);
                        } catch (jsonError) {
                            logger.error('Невалидный JSON от OpenAI', {
                                error: jsonError.message,
                                responseLength: data.length
                            });
                            res.status(500).json({
                                error: 'Invalid JSON Response',
                                message: 'OpenAI вернул невалидный JSON',
                                details: jsonError.message
                            });
                        }
                    } else {
                        logger.error('Ошибка от OpenAI', {
                            statusCode: response.statusCode
                        });
                        res.status(response.statusCode).send(data);
                    }
                } catch (error) {
                    logger.error('Ошибка при обработке распакованного ответа', {
                        error: error.message,
                        stack: error.stack
                    });
                    res.status(500).json({
                        error: 'Internal Server Error',
                        message: 'Ошибка обработки ответа от OpenAI'
                    });
                }
            });
            
            brotli.on('error', (error) => {
                logger.error('Ошибка распаковки Brotli', {
                    error: error.message,
                    stack: error.stack
                });
                res.status(500).json({
                    error: 'Internal Server Error',
                    message: 'Ошибка распаковки Brotli ответа от OpenAI'
                });
            });
        } else {
            // Обычная обработка без сжатия
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
                    
                    if (process.env.NODE_ENV === 'development') {
                        logger.info(`Обычный ответ: ${data.length} символов`);
                    }
                    
                    if (response.statusCode >= 200 && response.statusCode < 300) {
                        // Проверяем, что это валидный JSON
                        try {
                            JSON.parse(data);
                            res.status(response.statusCode).send(data);
                        } catch (jsonError) {
                            logger.error('Невалидный JSON от OpenAI', {
                                error: jsonError.message,
                                responseLength: data.length
                            });
                            res.status(500).json({
                                error: 'Invalid JSON Response',
                                message: 'OpenAI вернул невалидный JSON',
                                details: jsonError.message
                            });
                        }
                    } else {
                        logger.error('Ошибка от OpenAI', {
                            statusCode: response.statusCode
                        });
                        res.status(response.statusCode).send(data);
                    }
                } catch (error) {
                    logger.error('Ошибка при обработке ответа', {
                        error: error.message,
                        stack: error.stack
                    });
                    res.status(500).json({
                        error: 'Internal Server Error',
                        message: 'Ошибка обработки ответа от OpenAI'
                    });
                }
            });
        }
    });

    request.on('error', (err) => {
        logger.error('Ошибка запроса к OpenAI', {
            error: err.message,
            code: err.code,
            stack: err.stack
        });
        res.status(502).json({
            error: 'Bad Gateway',
            message: 'Не удается подключиться к OpenAI API',
            details: err.message
        });
    });

    request.on('timeout', () => {
        request.destroy();
        logger.error('Таймаут запроса к OpenAI');
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
    
    logger.info(`Перенаправление запроса`, {
        originalPath: path,
        openaiPath: openaiPath
    });
    
    // Перенаправляем запрос к OpenAI
    makeOpenAIRequest(method, openaiPath, headers, body, res);
});

// Обработка ошибок
app.use((err, req, res, next) => {
    logger.error('Ошибка сервера', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method
    });
    res.status(500).send('Внутренняя ошибка сервера');
});

// Запуск сервера
app.listen(PORT, () => {
    logger.info('Прокси сервер запущен', {
        port: PORT,
        target: 'https://api.openai.com/v1',
        statusUrl: `http://localhost:${PORT}/status`
    });
    console.log(`🚀 Прокси сервер запущен на порту ${PORT}`);
    console.log(`📡 Проксирует запросы на: https://api.openai.com/v1`);
    console.log(`🔗 Статус: http://localhost:${PORT}/status`);
    console.log(`📝 Логи сохраняются в папку: ${logsDir}`);
});

module.exports = app; 