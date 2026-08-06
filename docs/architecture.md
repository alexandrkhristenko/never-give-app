# Архитектура

## 1. Стек

| Слой | Технология | Заметки |
|---|---|---|
| Фреймворк | Next.js **16.3** (App Router) | Не та версия, что в обучающих данных моделей. См. §8 |
| UI | React 19.2, Server Components по умолчанию | |
| Стили | Tailwind CSS 4 + [NES.css](https://nostalgic-css.github.io/NES.css/) | 8-битная эстетика |
| Шрифт | `Press_Start_2P` через `next/font/google` | Подмножества `latin`, `cyrillic` |
| Аутентификация | Supabase Auth (`@supabase/ssr`) | Google, GitHub, email+пароль |
| БД | PostgreSQL (Supabase) | |
| Доступ к БД | Drizzle ORM + `postgres-js` | `prepare: false` — pooler в transaction mode |
| Миграции | `drizzle-kit` | Каталог `drizzle/` |
| OG-картинки | `next/og` (`ImageResponse`) | Встроено во фреймворк |
| Юнит-тесты | Vitest | Только чистая логика |
| E2E | Playwright | Сквозные сценарии |
| Хостинг | Vercel | |

## 2. Карта роутов

```
/                        Лендинг. Авторизованных редиректит на /dashboard
/login                   Форма email + пароль (Client Component)
/onboarding              Первичная настройка: username, обещание, видимость
/dashboard               Личный кабинет: стрик, кнопка чек-ина
/<username>              Публичный профиль. Динамический сегмент в корне
/auth/signin             POST-роут: старт OAuth-редиректа
/auth/callback           GET-роут: обмен кода на сессию
/api/og                  GET-роут: генерация OG-картинки
```

Публичный профиль занимает **корневой** сегмент, поэтому username не может
совпадать с системным путём. Список зарезервированных имён — в
[product-spec.md §6](./product-spec.md).

## 3. Структура исходников

```
src/
  proxy.ts                  Next 16 Proxy (бывший middleware): обновление сессии
  app/
    layout.tsx              Корневой layout, подключение шрифта
    globals.css             Tailwind + NES.css
    page.tsx                Лендинг
    login/                  page.tsx (client) + actions.ts
    onboarding/             page.tsx + actions.ts + onboarding-form.tsx (client)
    dashboard/              page.tsx + actions.ts + error.tsx
    [username]/             page.tsx + not-found.tsx
    auth/signin/route.ts    Старт OAuth
    auth/callback/route.ts  Обмен кода на сессию
    api/og/route.tsx        OG-картинка
  db/
    index.ts                Подключение Drizzle (сервисное, без RLS)
    rls.ts                  Обёртки withUser / withAnon — запросы под RLS
    schema.ts               Таблицы, индексы, политики
  lib/
    dates.ts                Чистые операции с локальными датами
    streak.ts               Чистая логика стриков и заморозок
    validation.ts           Валидация username
    dal/                    Data Access Layer, server-only
      session.ts            Сессия и её проверка
      user.ts               Профиль
      promise.ts            Обещание, чек-ины, заморозки
  utils/supabase/
    client.ts               Браузерный клиент
    server.ts               Серверный клиент (cookies)
    middleware.ts           Обновление сессии для proxy.ts
```

**Принцип разделения:**

- `src/lib/dates.ts` и `src/lib/streak.ts` — **чистые**, без импортов, без
  обращения к времени и БД. Только они покрыты юнит-тестами
- `src/lib/dal/*` — единственное место, где приложение ходит в БД. Помечены
  `import 'server-only'`
- Страницы — тонкие: получить данные из DAL, отрисовать. Никаких SQL-запросов
  и бизнес-логики в компонентах

## 4. Поток аутентификации

### OAuth (Google, GitHub)

```
Лендинг: <form action="/auth/signin" method="post"> с hidden provider
  → POST /auth/signin
  → supabase.auth.signInWithOAuth({ provider, redirectTo: <origin>/auth/callback })
  → redirect на страницу провайдера
  → провайдер возвращает на /auth/callback?code=...
  → supabase.auth.exchangeCodeForSession(code)
  → redirect на /dashboard
```

### Email + пароль

```
/login (Client Component, useActionState)
  → server action login() → supabase.auth.signInWithPassword()
  → redirect на /dashboard

  → server action signup() → supabase.auth.signUp({ emailRedirectTo: <site>/auth/callback })
  → письмо с подтверждением → /auth/callback → /dashboard
```

### Сессия

`src/proxy.ts` вызывает `updateSession()` на каждый запрос (кроме статики).
Это обновляет истёкший access token и переписывает cookies. Proxy **не**
принимает решений об авторизации: согласно рекомендациям Next.js, он делает
максимум оптимистичные проверки, а настоящая защита живёт в DAL, ближе к данным.

### Проверка личности

Везде используется `supabase.auth.getUser()` — он валидирует токен на сервере
Supabase. `getSession()` не используется: его результат приходит из cookies и
не может считаться доверенным.

## 5. Доступ к данным и RLS

### Проблема

Drizzle подключается напрямую по `DATABASE_URL` под привилегированной ролью.
Такая роль обходит RLS. Если оставить как есть, единственной защитой остаётся
код приложения.

### Решение

Два соединения на уровне логики, одно на уровне пула:

| Обёртка | Роль в БД | Когда |
|---|---|---|
| `withUser(userId, fn)` | `authenticated`, claims `{ sub: userId }` | Любой запрос от имени вошедшего пользователя |
| `withAnon(fn)` | `anon`, без claims | Публичный профиль, OG-картинка |
| `db` напрямую | привилегированная | Только миграции и служебные скрипты |

Реализация — транзакция с транзакционно-локальными настройками:

```ts
await db.transaction(async (tx) => {
  await tx.execute(sql`select set_config('request.jwt.claims', ${claims}, true)`)
  await tx.execute(sql`select set_config('role', 'authenticated', true)`)
  return fn(tx)
})
```

Третий аргумент `set_config` — `is_local = true`: настройка действует только до
конца транзакции и сбрасывается автоматически. Это обязательное условие при
работе через pooler в transaction mode, где соединение возвращается в пул после
каждой транзакции.

`request.jwt.claims` формируются **на сервере из уже проверенного**
`getUser().id`, а не из сырого токена клиента. `auth.uid()` в политиках читает
именно `request.jwt.claims ->> 'sub'`.

### Data Access Layer

Согласно рекомендации Next.js по безопасности данных, весь доступ к БД
централизован в `src/lib/dal/`. Каждая функция:

- помечена `import 'server-only'`
- проверяет сессию до запроса
- возвращает минимальный DTO, а не строку таблицы целиком
- мемоизируется через `cache()` из React в пределах одного рендера

Это защищает от двух классов ошибок: случайной передачи `email` в Client
Component и рассинхронизации проверок владения между страницами.

## 6. Кэширование

Cache Components (`cacheComponents: true`) **не включены**. Действует
предыдущая модель кэширования. После мутаций используется `revalidatePath()`.

Страница `/<username>` рендерится динамически: она читает БД и должна
показывать актуальный стрик.

## 7. Что где выполняется

| Файл | Среда | Почему |
|---|---|---|
| `src/proxy.ts` | Node.js runtime | Proxy в Next 16 работает на Node |
| `src/app/api/og/route.tsx` | Node.js runtime | Загружает файл шрифта с диска |
| Страницы и server actions | Node.js runtime | Обращаются к Postgres через сокет |
| `src/app/login/page.tsx` | Браузер (`'use client'`) | Интерактивная форма |
| `src/app/onboarding/onboarding-form.tsx` | Браузер (`'use client'`) | `useActionState`, определение таймзоны |

## 8. Особенности Next.js 16, важные для этого проекта

Проверено по `node_modules/next/dist/docs/`. Эти пункты расходятся с более
ранними версиями:

1. **Middleware переименован в Proxy.** Файл — `src/proxy.ts`, экспорт —
   функция `proxy` или default. Один файл на проект
2. **`error.tsx` получает проп `retry`**, а не `reset`
3. **`ImageResponse` импортируется из `next/og`.** Отдельный пакет `@vercel/og`
   не нужен
4. **`redirect()` бросает управляющее исключение.** Вызов внутри `try/catch`
   будет перехвачен блоком `catch` и не сработает. Это реальный источник багов
5. **`params` — это `Promise`.** Обязателен `await` перед доступом к полям
6. **Появился `refresh()` из `next/cache`** для обновления роутера клиента без
   инвалидации тегов
7. **Cache Components** — опциональная модель кэширования через `use cache`,
   включается флагом `cacheComponents` в `next.config.ts`. В проекте выключена

## 9. Переменные окружения

| Переменная | Где нужна | Описание |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | клиент, сервер | URL проекта Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | клиент, сервер | Публикуемый ключ. Предпочтителен |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | клиент, сервер | Legacy-ключ, оставлен для совместимости |
| `DATABASE_URL` | сервер | Строка подключения Postgres через pooler |
| `NEXT_PUBLIC_SITE_URL` | сервер | Базовый URL для писем подтверждения и OG |
| `SUPABASE_SERVICE_ROLE_KEY` | **только тесты** | Создание тестового пользователя в E2E. Никогда не попадает в клиентский бандл |

Всё с префиксом `NEXT_PUBLIC_` уходит в браузер. `DATABASE_URL` и
`SUPABASE_SERVICE_ROLE_KEY` — никогда.

## 10. Деплой (Vercel)

1. Импортировать репозиторий в Vercel
2. Прописать переменные окружения из §9, кроме `SUPABASE_SERVICE_ROLE_KEY`
3. `NEXT_PUBLIC_SITE_URL` — продовый домен
4. В Supabase → Authentication → URL Configuration добавить
   `<домен>/auth/callback` в Redirect URLs
5. Миграции применяются командой `npm run db:migrate` из CI или локально
   против продовой БД. `db:push` в проде не используется: он не оставляет
   истории изменений

Фоновых задач нет: списание заморозок ленивое, cron не требуется.
