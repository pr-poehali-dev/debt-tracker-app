# Robokassa Payment Integration

Интеграция платёжной системы Robokassa для приёма онлайн-платежей.

## Что включено

- `backend/robokassa/` — создание заказа и ссылки на оплату
- `backend/robokassa-webhook/` — обработка webhook от Robokassa
- `frontend/useRobokassa.ts` — React хук для работы с API
- `frontend/PaymentButton.tsx` — готовый компонент кнопки оплаты

## Установка

### 1. База данных

Выполни миграцию для создания таблиц заказов:

```sql
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    user_email VARCHAR(255) NOT NULL,
    user_phone VARCHAR(50),
    amount DECIMAL(10, 2) NOT NULL,
    robokassa_inv_id INTEGER UNIQUE,
    status VARCHAR(20) DEFAULT 'pending',
    payment_url TEXT,
    delivery_address TEXT,
    order_comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    product_id VARCHAR(100),
    product_name VARCHAR(255) NOT NULL,
    product_price DECIMAL(10, 2) NOT NULL,
    quantity INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_robokassa_inv_id ON orders(robokassa_inv_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
```

### 2. Секреты

Добавь секреты в проект:

| Переменная | Описание |
|------------|----------|
| `ROBOKASSA_MERCHANT_LOGIN` | Логин магазина в Robokassa |
| `ROBOKASSA_PASSWORD_1` | Пароль #1 для создания платежей |
| `ROBOKASSA_PASSWORD_2` | Пароль #2 для проверки webhook |

### 3. Backend

Скопируй папки `backend/robokassa/` и `backend/robokassa-webhook/` в свой проект и выполни sync_backend.

### 4. Frontend

Скопируй файлы из `frontend/` в свой проект и добавь `PaymentButton` в форму оплаты:

```tsx
import { PaymentButton } from "@/components/PaymentButton";

<PaymentButton
  apiUrl={func2url.robokassa}
  amount={totalAmount}
  userName={formData.name}
  userEmail={formData.email}
  userPhone={formData.phone}
  userAddress={formData.address}
  cartItems={cartItems}
  successUrl="https://your-site.com/success"
  failUrl="https://your-site.com/checkout"
  onSuccess={(orderNumber) => router.push(`/success?order=${orderNumber}`)}
  onError={(error) => toast.error(error.message)}
/>
```

### 5. Настройка Robokassa

В личном кабинете Robokassa укажи:

- **Result URL**: URL функции `robokassa-webhook` из func2url.json

## Поток оплаты

```
1. Пользователь нажимает "Оплатить"
   ↓
2. Frontend → POST /robokassa (amount, user_name, cart_items...)
   ↓
3. Backend создаёт заказ в БД, генерирует payment_url
   ↓
4. Frontend редиректит на Robokassa
   ↓
5. Пользователь оплачивает
   ↓
6. Robokassa → POST /robokassa-webhook (OutSum, InvId, SignatureValue)
   ↓
7. Backend проверяет подпись, обновляет status = 'paid'
   ↓
8. Robokassa редиректит на Success URL
```

## API

### POST /robokassa

Создание заказа и получение ссылки на оплату.

**Request:**
```json
{
  "amount": 1500.00,
  "user_name": "Иван Иванов",
  "user_email": "ivan@example.com",
  "user_phone": "+79991234567",
  "user_address": "Москва, ул. Примерная, 1",
  "cart_items": [
    {"id": "1", "name": "Товар", "price": 1500, "quantity": 1}
  ]
}
```

**Response:**
```json
{
  "payment_url": "https://auth.robokassa.ru/...",
  "order_id": 123,
  "order_number": "ORD-20241219-456789"
}
```

### POST /robokassa-webhook

Webhook от Robokassa (вызывается автоматически после оплаты).

**Response:** `OK{InvId}` при успехе

## Частые проблемы

### Failed to fetch
**Причина:** Отсутствует поле `isBase64Encoded` в ответе backend функции.
**Решение:** Убедись что все return содержат `'isBase64Encoded': False`

### CORS errors
**Причина:** `credentials: "include"` в fetch запросе.
**Решение:** Удали эту опцию из useRobokassa.ts

### Database errors
**Причина:** Таблицы orders/order_items не созданы.
**Решение:** Примени миграцию из раздела "База данных"

## После установки

**ОБЯЗАТЕЛЬНО:** Последним шагом добавь кнопку оплаты на фронтенд, чтобы пользователь сразу видел результат!

Используй компоненты из `/frontend`:
- `PaymentButton.tsx` — кнопка оплаты
- `useRobokassa.ts` — хук для работы с API

**Скажи пользователю:**

> ✅ Оплата через Robokassa настроена!

---

## Чеклист

- [ ] Миграция БД применена
- [ ] Секреты добавлены
- [ ] Backend функции задеплоены (sync_backend)
- [ ] PaymentButton добавлен в форму оплаты
- [ ] Result URL настроен в кабинете Robokassa
- [ ] Тестовый платёж проходит успешно
