# Mood Psychiatry Dashboard

Личный сервис для просмотра динамики самочувствия, сна и приема лекарств перед приемом у психиатра.

## Локальный запуск

```bash
npm install
npm start
```

После запуска сайт доступен на `http://localhost:3000`.

## Deploy на Render

1. Создать GitHub-репозиторий и загрузить эти файлы.
2. В Render выбрать New Web Service.
3. Подключить репозиторий.
4. Render возьмет настройки из `render.yaml`.

## Подключение Google Sheets

Рекомендуемый вариант для приватной таблицы:

1. Создать service account в Google Cloud.
2. Создать JSON-ключ для service account.
3. Открыть Google Таблицу и выдать доступ email service account как читателю.
4. В Render добавить переменные окружения:

```text
GOOGLE_SHEET_ID=...
GOOGLE_SHEET_RANGE=A:K
GOOGLE_SERVICE_ACCOUNT_EMAIL=...
GOOGLE_PRIVATE_KEY=...
```

`GOOGLE_PRIVATE_KEY` вставляется целиком, вместе со строками `-----BEGIN PRIVATE KEY-----` и `-----END PRIVATE KEY-----`.

Упрощенный вариант для опубликованной таблицы:

```text
GOOGLE_SHEET_CSV_URL=...
```

Если переменные не заданы, сервис показывает демо-данные.

## Подключение LLM через Yandex Cloud

В Render добавь переменные окружения:

```text
YANDEX_CLOUD_FOLDER=...
YANDEX_CLOUD_API_KEY=...
YANDEX_CLOUD_MODEL=gpt-oss-120b/latest
YANDEX_CLOUD_BASE_URL=https://ai.api.cloud.yandex.net/v1
```

После этого на сайте появится рабочий блок вопросов по данным таблицы. Ключи нельзя добавлять в GitHub.
