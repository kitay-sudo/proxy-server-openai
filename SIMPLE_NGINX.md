# 🔧 Упрощенная конфигурация nginx

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

### 4. Архитектура

```
Клиент → nginx (порт 80) → JavaScript прокси (порт 8080) → OpenAI API
```

### 5. Преимущества упрощенной конфигурации

- ✅ **Минимум кода** - только proxy_pass
- ✅ **Надежность** - меньше точек отказа
- ✅ **Простота отладки** - понятная логика
- ✅ **Производительность** - быстрая обработка

### 6. Тестирование

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

### 7. Обновление переменных окружения

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