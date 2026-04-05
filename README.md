# Health Card — семейный дашборд диабета

[![Deploy to GitHub Pages](https://github.com/AlexZ1306/health-card/actions/workflows/pages.yml/badge.svg)](https://github.com/AlexZ1306/health-card/actions/workflows/pages.yml)

Демо: https://alexz1306.github.io/health-card/

Минималистичный дашборд для контроля глюкозы с удобной навигацией по дням/неделям, фильтрами и управлением данными.

## Требования

- Node.js 20+
- npm 10+

## Быстрый старт

```bash
npm install
npm run dev
```

Откройте `http://localhost:3000`.

## Основные команды

```bash
npm run dev     # локальная разработка
npm run build   # сборка
npm run start   # запуск production сборки
npm run lint    # линтер
```

## Управление данными

Страница управления доступна по адресу:
`/manage`

Там можно:
- загрузить `.xlsx` файлы,
- вставить данные вручную,
- импортировать все файлы из папки (локально).

## Демо на GitHub Pages

Проект настроен на публикацию как статическое демо:
- GitHub Pages использует экспорт (`output: export`).
- В демо **не работает импорт папки**, остальные функции доступны.

### Как включить GitHub Pages

1. В репозитории GitHub: Settings → Pages
2. Source: **GitHub Actions**

Далее любое обновление `main` автоматически опубликует демо.
