# 📋 Информация для настройки прокси сервера

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

После создания прокси сервера, основной сервер будет работать через него без 502 ошибок.

---

# 🔧 Настройка nginx для прокси сервера

## Задача
Упростить nginx для работы с JavaScript прокси сервером.

## Решение: Минимальная конфигурация nginx

### 1. Упрощенная конфигурация nginx с ограничением по IP

Создайте файл `/etc/nginx/sites-available/simple-proxy`:

```nginx
server {
    listen 80;
    server_name your-proxy-server.com;
    
    # Ограничение доступа по IP (белый список)
    location / {
        # Разрешаем только указанные IP адреса
        allow 88.218.168.193;  # Ваш основной сервер
        allow 185.142.99.67;   # Дополнительный сервер
        deny all;              # Запрещаем всем остальным
        
        # Простой прокси на JavaScript сервер
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 2. Альтернативный вариант с отдельным файлом IP

Создайте файл `/etc/nginx/conf.d/allowed_ips.conf`:

```nginx
# Белый список IP адресов
geo $allowed_ip {
    default 0;
    88.218.168.193 1;  # Ваш основной сервер
    185.142.99.67  1;  # Дополнительный сервер
}
```

И обновите конфигурацию сервера:

```nginx
server {
    listen 80;
    server_name your-proxy-server.com;
    
    # Проверка IP адреса
    location / {
        if ($allowed_ip = 0) {
            return 403;
        }
        
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 3. Еще более простая версия (без ограничений)

```nginx
server {
    listen 80;
    server_name your-proxy-server.com;
    
    location / {
        proxy_pass http://localhost:8080;
    }
}
```

### 4. Настройка IP адресов

#### Определение ваших IP адресов:
```bash
# Узнать IP вашего основного сервера
curl ifconfig.me

# Или
curl ipinfo.io/ip

# Или
wget -qO- http://ipecho.net/plain
```

#### Обновление IP адресов в конфигурации:
```bash
# Откройте конфигурацию
sudo nano /etc/nginx/sites-available/simple-proxy

# Замените IP адреса на ваши реальные
# allow YOUR_REAL_IP_1;
# allow YOUR_REAL_IP_2;
```

### 5. Активация

```bash
# Создаем символическую ссылку
sudo ln -s /etc/nginx/sites-available/simple-proxy /etc/nginx/sites-enabled/

# Удаляем старые конфигурации
sudo rm /etc/nginx/sites-enabled/default
sudo rm /etc/nginx/sites-enabled/transparent-proxy 2>/dev/null || true
sudo rm /etc/nginx/sites-enabled/working-proxy 2>/dev/null || true

# Проверяем конфигурацию
sudo nginx -t

# Перезапускаем nginx
sudo systemctl restart nginx
```

### 6. Архитектура

```
Клиент → nginx (порт 80) → JavaScript прокси (порт 8080) → OpenAI API
```

### 7. Преимущества упрощенной конфигурации

- ✅ **Минимум кода** - только proxy_pass
- ✅ **Надежность** - меньше точек отказа
- ✅ **Простота отладки** - понятная логика
- ✅ **Производительность** - быстрая обработка

### 8. Тестирование

#### Проверка с разрешенного IP:
```bash
# Проверка nginx
curl -I http://your-proxy-server.com/status

# Тест через nginx → JavaScript прокси → OpenAI
curl -X POST http://your-proxy-server.com/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_OPENAI_API_KEY" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 100
  }'
```

#### Проверка с запрещенного IP (должен вернуть 403):
```bash
# С другого сервера или через VPN
curl -I http://your-proxy-server.com/status
# Ожидаемый ответ: HTTP/1.1 403 Forbidden
```

#### Проверка логов nginx:
```bash
# Логи доступа
sudo tail -f /var/log/nginx/access.log

# Логи ошибок
sudo tail -f /var/log/nginx/error.log
```

### 9. Обновление переменных окружения

В вашем основном сервере `.env`:
```bash
# Используем nginx как входную точку
NGINX_PROXY_URL=http://your-proxy-server.com

# Или напрямую JavaScript прокси
# NGINX_PROXY_URL=http://your-proxy-server.com:8080

USE_EXTERNAL_AI=false
```

## Готово! 🎉

Теперь nginx работает как простая точка входа, а вся логика проксирования в JavaScript сервере. 