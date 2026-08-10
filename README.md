# never-give.app

8-битный трекер публичной ответственности. Пообещал публично — отмечайся
каждый день — не давай стрику сгореть.

Публичная страница профиля превращает обещание в социальное обязательство:
её можно расшарить, и она отдаёт OG-картинку с текущим стриком.

## Документация

| Документ | О чём |
|---|---|
| [docs/product-spec.md](docs/product-spec.md) | Что делает продукт. Правила стрика и заморозок — нормативные |
| [docs/architecture.md](docs/architecture.md) | Стек, роуты, аутентификация, RLS, особенности Next.js 16 |
| [docs/data-model.md](docs/data-model.md) | Таблицы, инварианты, политики RLS |
| [docs/debt.md](docs/debt.md) | Реестр долга: что закрыто, что заблокировано, что решено не чинить |
| [docs/handover.md](docs/handover.md) | Что осталось сделать руками |
| [docs/known-issues.md](docs/known-issues.md) | История дефектов MVP и осознанный техдолг |
| [docs/superpowers/plans/](docs/superpowers/plans/) | Планы реализации. Актуальный — [дальнейшие шаги](docs/superpowers/plans/2026-08-10-next-steps.md) |
| [docs/pr-description-auth-and-docs.md](docs/pr-description-auth-and-docs.md) | Описание текущего PR |

## Стек

Next.js 16.3 (App Router) · React 19.2 · Tailwind CSS 4 · NES.css ·
Supabase Auth · PostgreSQL · Drizzle ORM · Vitest · Playwright · Vercel

## Требования

- Node.js 22+
- Проект в [Supabase](https://supabase.com)

## Локальный запуск

### 1. Зависимости

```bash
npm install
```

### 2. Переменные окружения

Создайте `.env.local` в корне:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@<host>:6543/postgres
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Ключи — в Supabase Dashboard → Project Settings → API.
`DATABASE_URL` — там же, Connection Pooling, режим **Transaction**, порт `6543`.

`NEXT_PUBLIC_SITE_URL` локально нужен, на Vercel — нет: там адрес берётся из
`VERCEL_PROJECT_PRODUCTION_URL`. Задавайте его в проде только под свой домен.

`.env.local` в `.gitignore`. Никогда не коммитьте его.

### 3. Схема БД

```bash
npm run db:migrate
```

### 4. Провайдеры входа

В Supabase Dashboard → Authentication:

- **Providers** — включите Google и GitHub, пропишите их client id и secret
- **URL Configuration** → Redirect URLs — добавьте `http://localhost:3000/auth/callback`

Если провайдеров не включить, кнопки «Sign in with Google» и «Sign in with
GitHub» на лендинге уводят на страницу Supabase с ответом
`400 provider is not enabled` — вне приложения. Код входа при этом исправен:
отказ приходит от эндпоинта Supabase, а не от нас. Вход по email работает
независимо от этого.

### 5. Запуск

```bash
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000).

## Скрипты

| Команда | Что делает |
|---|---|
| `npm run dev` | Дев-сервер |
| `npm run build` | Продовая сборка |
| `npm start` | Запуск собранного приложения |
| `npm run lint` | ESLint |
| `npm test` | Юнит-тесты (Vitest), один прогон |
| `npm run test:watch` | Юнит-тесты в watch-режиме |
| `npm run test:e2e` | E2E-тесты (Playwright) |
| `npm run test:db` | Тесты против настоящей базы (Vitest, отдельный конфиг) |
| `npm run db:prune-test-users` | Сметает аккаунты от прерванного прогона E2E |
| `npm run db:generate` | Сгенерировать миграцию из `src/db/schema.ts` |
| `npm run db:migrate` | Применить миграции |
| `npm run db:studio` | Drizzle Studio |

`db:push` намеренно не используется: он меняет схему без миграции и не
оставляет истории.

## Тесты

**Юнит-тесты** покрывают чистую логику — расчёт стриков, заморозки, операции
с локальными датами, валидацию username. Компоненты и async Server Components
юнит-тестами не покрываются: это прямая рекомендация документации Next.js.

**E2E** покрывают сквозные сценарии в реальном браузере против продовой
сборки: `npm run test:e2e`.

**Тесты БД** (`npm run test:db`) прогоняют функции DAL против настоящей базы —
списание заморозок, правило «всё или нет», колоночные гранты, политики на
`streak_freezes`, ограничитель частоты. Это то, чего юнит-тесты чистых функций
не достают.

Оба набора заводят тестовый аккаунт **через `DATABASE_URL`**, напрямую в
`auth.users`. `SUPABASE_SERVICE_ROLE_KEY` не нужен и не должен появляться в
`.env.local`: всё, что читает серверный рантайм приложения, не должно уметь
обходить RLS. Обоснование и цена этого решения — [docs/debt.md](docs/debt.md) B1.

Оба набора пишут в базу из `TEST_DATABASE_URL`, а если её нет — из
`DATABASE_URL`. Второе означает продовую базу, и набор говорит об этом строкой
`[tests] writing to …` в начале прогона. Переключение на отдельную базу — одна
переменная в `.env.local`, а не правка шести файлов: решение принимает
`db/connection.ts`.

Удаления в наборах привязаны к своему `id` или к домену `@never-give.test`;
`npm run db:prune-test-users` сметает то, что осталось от прерванного прогона
(по умолчанию только показывает, удаляет с `--delete`).

## Деплой

Vercel. Порядок — в [docs/architecture.md §10](docs/architecture.md).

## Работа с ИИ-агентами

Файл `AGENTS.md` содержит блок, который **автоматически перезаписывает**
`next dev`. Он предупреждает, что эта версия Next.js отличается от той, что
знают модели, и требует читать документацию из `node_modules/next/dist/docs/`.
Удалять блок бесполезно — он будет создан заново. Коммитьте его вместе с
изменениями, чтобы дерево оставалось чистым.
