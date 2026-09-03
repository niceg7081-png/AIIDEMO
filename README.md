# NovaDent Pro

Готовий зразок AI-адміністратора стоматології: публічний сайт для клієнтів та окремий захищений портал власника. Записи із сайту автоматично потрапляють до таблиці порталу, а за наявності облікових даних — також до Airtable.

## Run on Windows

1. Для локального запуску застосунок автоматично читає `mem.env`. Для продакшену скопіюйте `.env.example` у `.env`.
2. Укажіть власний `ADMIN_PASSWORD` і `OPENAI_API_KEY` у `.env`; значення з `.env` мають пріоритет над `mem.env`.
3. Додайте `OPENAI_API_KEY`, щоб увімкнути живого AI-помічника.
4. Необов’язково: додайте Airtable credentials для синхронізації CRM.
5. In PowerShell from this folder:
   `npm.cmd install`
   `npm.cmd start`
6. Сайт для клієнтів: http://localhost:3000
7. Портал власника: http://localhost:3000/owner

Портал власника має захищений вхід за значенням `ADMIN_PASSWORD`, показує записи в таблиці, дозволяє змінювати їхні статуси та автоматично оновлює дані кожні 15 секунд.

## Telegram і WhatsApp

Після додавання ключів у Render кожна нова заявка з сайту надходить власнику в Telegram та WhatsApp.

- Telegram webhook: `https://YOUR-RENDER-URL/api/webhooks/telegram`
- WhatsApp webhook: `https://YOUR-RENDER-URL/api/webhooks/whatsapp`
- Перевірка WhatsApp використовує значення `WHATSAPP_VERIFY_TOKEN`.

Бот у кожному каналі приймає текст українською або російською та відповідає українською. Усі ключі зберігайте лише в Environment у Render, не в GitHub.

Якщо ключі OpenAI/Airtable порожні, застосунок усе одно працює локально та зберігає записи в `data.json`.

## Публікація на Render

Проєкт уже має `render.yaml`. Створіть безкоштовний акаунт на Render, завантажте цей проєкт у приватний GitHub-репозиторій та оберіть **New → Blueprint**. У Render укажіть значення `ADMIN_PASSWORD`, `OPENAI_API_KEY`, `AIRTABLE_TOKEN` і `AIRTABLE_BASE_ID` — ці секрети не потрібно та не можна додавати у GitHub. Після розгортання клієнтський сайт буде доступний за адресою Render, а портал власника — за адресою `/owner`.

Never put secrets in frontend files or commit `.env` to Git.
