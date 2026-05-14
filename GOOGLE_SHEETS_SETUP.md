# Google Sheets setup

## Вариант 1: приватная таблица через service account

1. Открой Google Cloud Console.
2. Создай проект или выбери существующий.
3. Включи Google Sheets API.
4. Создай service account.
5. Создай JSON-ключ для service account.
6. Скопируй email service account из JSON.
7. Открой свою Google Таблицу.
8. Нажми Share и добавь этот email с правом Viewer.
9. В Render добавь Environment Variables:

```text
GOOGLE_SHEET_ID=часть URL между /d/ и /edit
GOOGLE_SHEET_RANGE=A:K
GOOGLE_SERVICE_ACCOUNT_EMAIL=client_email из JSON
GOOGLE_PRIVATE_KEY=private_key из JSON
```

После сохранения переменных запусти Manual Deploy.

## Вариант 2: опубликованная CSV-ссылка

Этот вариант проще, но таблица становится доступнее по ссылке.

1. В Google Sheets выбери File -> Share -> Publish to web.
2. Выбери нужный лист.
3. Формат: CSV.
4. Скопируй ссылку.
5. В Render добавь:

```text
GOOGLE_SHEET_CSV_URL=ссылка CSV
```

Если задана `GOOGLE_SHEET_CSV_URL`, приложение использует ее вместо service account.

## LLM-вопросы по таблице

Для блока вопросов на сайте добавь в Render:

```text
YANDEX_CLOUD_FOLDER=...
YANDEX_CLOUD_API_KEY=...
YANDEX_CLOUD_MODEL=gpt-oss-120b/latest
YANDEX_CLOUD_BASE_URL=https://ai.api.cloud.yandex.net/v1
```

API-ключ хранится только в Render Environment Variables. В GitHub его добавлять нельзя.
