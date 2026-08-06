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
| [docs/known-issues.md](docs/known-issues.md) | Дефекты и осознанный техдолг |
| [docs/superpowers/plans/](docs/superpowers/plans/) | Планы реализации |

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

`.env.local` в `.gitignore`. Никогда не коммитьте его.

### 3. Схема БД

```bash
npm run db:migrate
```

### 4. Провайдеры входа

В Supabase Dashboard → Authentication:

- **Providers** — включите Google и GitHub, пропишите их client id и secret
- **URL Configuration** → Redirect URLs — добавьте `http://localhost:3000/auth/callback`

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
| `npm run db:generate` | Сгенерировать миграцию из `src/db/schema.ts` |
| `npm run db:migrate` | Применить миграции |
| `npm run db:studio` | Drizzle Studio |

`db:push` намеренно не используется: он меняет схему без миграции и не
оставляет истории.

## Тесты

**Юнит-тесты** покрывают чистую логику — расчёт стриков, заморозки, операции
с локальными датами, валидацию username. Компоненты и async Server Components
юнит-тестами не покрываются: это прямая рекомендация документации Next.js.

**E2E** покрывают сквозные сценарии в реальном браузере. Требуют
дополнительной переменной в `.env.test.local`:

```bash
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

Ключ используется только для создания и удаления тестового пользователя.
В клиентский бандл он не попадает и в `.env.local` ему делать нечего.

## Деплой

Vercel. Порядок — в [docs/architecture.md §10](docs/architecture.md).

## Работа с ИИ-агентами

Файл `AGENTS.md` содержит блок, который **автоматически перезаписывает**
`next dev`. Он предупреждает, что эта версия Next.js отличается от той, что
знают модели, и требует читать документацию из `node_modules/next/dist/docs/`.
Удалять блок бесполезно — он будет создан заново. Коммитьте его вместе с
изменениями, чтобы дерево оставалось чистым.
