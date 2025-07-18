# 📋 Информация для настройки прокси сервера

## Настройка сервера

### Установка необходимых пакетов

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Node.js (стабильная версия)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Проверка версий
node --version
npm --version

# Установка nginx
sudo apt install nginx -y

# Установка PM2 для управления процессами
sudo npm install -g pm2

# Установка дополнительных утилит
sudo apt install curl wget git -y
```

### Проверка установки

```bash
# Проверка Node.js
node --version  # Должно быть v20.x.x

# Проверка npm
npm --version   # Должно быть 10.x.x

# Проверка nginx
nginx -v

# Проверка PM2
pm2 --version
```

## Порядок настройки

### 1. Сначала настройте nginx
См. подробную инструкцию: [SIMPLE_NGINX.md](./SIMPLE_NGINX.md)

**Краткое описание**: nginx работает как входная точка (порт 80) с ограничением доступа по IP и перенаправляет запросы на JavaScript прокси сервер (порт 8080).

### 2. Затем запустите JavaScript прокси сервер
Используйте код ниже для создания прокси сервера.

---

## Задача
Создать простой прокси сервер на JavaScript, который будет перенаправлять запросы на OpenAI API.

## Требования к прокси серверу

### 1. Основная функциональность
- **Порт**: 8080 (или любой свободный)
- **Цель**: https://api.openai.com/v1
- **Функция**: Простое перенаправление запросов

### 2. Необходимые эндпоинты

#### Статус сервера
```
GET /status
Ответ: 200 OK с текстом "OK"
```

#### Проксирование OpenAI
```
POST /chat/completions
GET /models
GET /models/{model}
```

### 3. Технические требования

#### Зависимости
```json
{
  "express": "^4.18.2",
  "http-proxy-middleware": "^2.0.6",
  "cors": "^2.8.5"
}
```

#### Основные функции
- Логирование всех запросов
- CORS поддержка
- Обработка ошибок
- Простое перенаправление без модификации

### 4. Конфигурация

#### Переменные окружения
```bash
PROXY_PORT=8080
TARGET_URL=https://api.openai.com/v1
```

#### Настройки прокси
- `changeOrigin: true`
- `pathRewrite: { '^/': '/' }`
- Таймауты: 60 секунд
- Логирование запросов и ответов

### 5. Тестирование

#### Проверка статуса
```bash
curl -I http://your-proxy-server:8080/status
```

#### Тест OpenAI через прокси
```bash
curl -X POST http://your-proxy-server:8080/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_OPENAI_API_KEY" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 100
  }'
```

### 6. Обновление основного сервера

После создания прокси сервера, обновите `.env`:
```bash
NGINX_PROXY_URL=http://your-proxy-server:8080
USE_EXTERNAL_AI=false
```

### 7. Логирование

Прокси сервер должен логировать:
- Время запроса
- Метод и URL
- Статус ответа
- Ошибки подключения

### 8. Обработка ошибок

- 502 Bad Gateway → Проблема с подключением к OpenAI
- 500 Internal Server Error → Ошибка прокси сервера
- 404 Not Found → Неправильный эндпоинт

## Код прокси сервера

### 1. package.json
```json
{
  "name": "simple-proxy-server",
  "version": "1.0.0",
  "description": "Простой прокси сервер для AI запросов",
  "main": "simple-proxy-server.js",
  "scripts": {
    "start": "node simple-proxy-server.js",
    "dev": "nodemon simple-proxy-server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "http-proxy-middleware": "^2.0.6",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  },
  "keywords": ["proxy", "openai", "api"],
  "author": "FZP Team",
  "license": "MIT"
}
```

### 2. simple-proxy-server.js
```javascript
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
```

### 3. Установка и запуск

```bash
# Установка зависимостей
npm install

# Запуск в продакшене
npm start

# Запуск в режиме разработки
npm run dev
```

## Готово! 🎉

После настройки nginx и запуска прокси сервера, основной сервер будет работать через них без 502 ошибок. 