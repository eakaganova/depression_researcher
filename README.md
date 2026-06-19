# Mood Psychiatry Dashboard

Личный сервис для просмотра динамики самочувствия, сна и приема лекарств перед приемом у психиатра.

## Локальный запуск

```bash
npm install
npm start
```

После запуска сайт доступен на `http://localhost:3000`.

## Deploy

Проект должен запускаться как Node.js Web Service командой `npm start`, а не как статический сайт.

## Подключение Google Sheets

Рекомендуемый вариант для приватной таблицы:

1. Создать service account в Google Cloud.
2. Создать JSON-ключ для service account.
3. Открыть Google Таблицу и выдать доступ email service account как читателю.
4. В сервисе деплоя добавить переменные окружения:

```text
GOOGLE_SHEET_ID=...
GOOGLE_SHEET_RANGE=НазваниеЛиста!A:S
GOOGLE_SERVICE_ACCOUNT_EMAIL=...
GOOGLE_PRIVATE_KEY=...
APP_TIME_ZONE=Europe/Moscow
```

Текущая таблица занимает столбцы `A:S`. Значение `A:Q` обрезает столбцы «Литий» и «Эутирокс».

`GOOGLE_PRIVATE_KEY` вставляется целиком, вместе со строками `-----BEGIN PRIVATE KEY-----` и `-----END PRIVATE KEY-----`.

Упрощенный вариант для опубликованной таблицы:

```text
GOOGLE_SHEET_CSV_URL=...
```

Если одновременно задан `GOOGLE_SHEET_CSV_URL`, он имеет приоритет над Google Sheets API. Если ни один источник не настроен полностью, сервис показывает демо-данные.

## Подключение LLM через Yandex Cloud

В сервисе деплоя добавь переменные окружения:

```text
YANDEX_CLOUD_FOLDER=...
YANDEX_CLOUD_API_KEY=...
YANDEX_CLOUD_MODEL=gpt-oss-120b/latest
YANDEX_CLOUD_BASE_URL=https://ai.api.cloud.yandex.net/v1
```

После этого на сайте появится рабочий блок вопросов по данным таблицы. Ключи нельзя добавлять в GitHub.
