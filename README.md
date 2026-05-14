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

Пока сервис работает на демо-данных. Реальные ключи для Google Sheets и LLM добавляются в Render Environment Variables.
