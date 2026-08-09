# Архитектура

## 1. Стек

| Слой | Технология | Заметки |
|---|---|---|
| Фреймворк | Next.js **16.3** (App Router) | Не та версия, что в обучающих данных моделей. См. §8 |
| UI | React 19.2, Server Components по умолчанию | |
| Стили | Tailwind CSS 4 + [NES.css](https://nostalgic-css.github.io/NES.css/) | 8-битная эстетика |
| Шрифт | `Press_Start_2P` через `next/font/google` | Подмножество `latin` |
| Аутентификация | Supabase Auth (`@supabase/ssr`) | Почта с паролем работает. Google и GitHub реализованы, но **не включены** в проекте Supabase — см. §4 |
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
/login                   Вход и регистрация по почте. Страница серверная,
                         форма внутри — клиентская (login-form.tsx)
/onboarding              Первичная настройка: username, обещание, видимость
/dashboard               Личный кабинет: стрик, кнопка чек-ина
/settings                Обещание, видимость, таймзона, удаление аккаунта
/<username>              Публичный профиль. Динамический сегмент в корне
/<username>/opengraph-image   OG-картинка профиля, 1200×630 PNG
/auth/signin             POST-роут: старт OAuth-редиректа
/auth/callback           GET-роут: обмен кода на сессию либо разбор отказа
/robots.txt              Единственный статический маршрут в проекте
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
    login/                  page.tsx (server) + login-form.tsx (client) +
                            actions.ts
    onboarding/             page.tsx + actions.ts + onboarding-form.tsx (client)
    dashboard/              page.tsx + actions.ts + error.tsx + loading.tsx
    settings/               page.tsx + actions.ts + promise-form.tsx +
                            timezone-form.tsx + delete-account.tsx (client)
    [username]/             page.tsx + not-found.tsx + opengraph-image.tsx
    robots.ts               robots.txt. Sitemap намеренно не объявлен
    auth/signin/route.ts    Старт OAuth
    auth/callback/route.ts  Обмен кода на сессию либо разбор отказа
  components/
    layout/, share/, streak/, ui/   Презентационные компоненты
  db/
    index.ts                Подключение Drizzle (сервисное, без RLS)
    rls.ts                  Обёртки withUser / withAnon — запросы под RLS
    schema.ts               Таблицы, индексы, ограничения. Политик здесь нет —
                            они в рукописных миграциях, см. data-model.md
  lib/
    dates.ts                Чистые операции с локальными датами
    streak.ts               Чистая логика стриков и заморозок
    validation.ts           Валидация username, длины обещания и таймзоны
    log.ts                  Структурный логгер, по строке JSON на событие
    rate-limit.ts           Обёртка над private.rate_limit_hit
    site-url.ts             Собственный адрес приложения и его источник
    theme.ts                Чтение cookie темы
    auth-errors.ts          Код отказа входа → предложение для человека
    view/chain.ts           Окно цепочки и состояния клеток
    dal/                    Data Access Layer, server-only
      session.ts            Сессия и её проверка
      user.ts               Профиль
      promise.ts            Обещание, чек-ины, заморозки
  utils/supabase/
    client.ts               Браузерный клиент
    server.ts               Серверный клиент (cookies)
    middleware.ts           Обновление сессии для proxy.ts
    credentials.ts          Адрес и ключ проекта, и заданы ли они вообще
    report.ts               Однократная запись о ненастроенности
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

**Провайдеры не включены в проекте Supabase**, поэтому поток ниже доходит до
`authorize` и обрывается там: Supabase отвечает
`400 {"msg":"Unsupported provider: provider is not enabled"}`, и человек видит
страницу с JSON вне приложения. Кодом это не чинится — `signInWithOAuth`
возвращает исправный URL, отказывает уже эндпоинт Supabase. Нужны client id и
secret в Authentication → Providers, см. [debt.md](./debt.md) B10.

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
/login (Server Component) + login-form.tsx (Client Component, useActionState)
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
| Страницы и server actions | Node.js runtime | Обращаются к Postgres через сокет |
| `src/app/login/page.tsx` | Node.js runtime (Server Component) | Читает cookie темы, остального не нужно |
| `src/app/login/login-form.tsx` | Браузер (`'use client'`) | Интерактивная форма |
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
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | клиент, сервер | Legacy-ключ. Годится, если первого нет |
| `DATABASE_URL` | сервер | Строка подключения Postgres через pooler, режим Transaction, порт 6543 |
| `POSTGRES_URL` | сервер | То же. Под этим именем строку кладёт интеграция Supabase; принимается, `DATABASE_URL` предпочтительнее |
| `NEXT_PUBLIC_SITE_URL` | сервер | Базовый URL для писем подтверждения и OG. **Необязательна на Vercel** — см. ниже |
| `VERCEL_PROJECT_PRODUCTION_URL` | сервер | Кладёт Vercel. Используется, когда `NEXT_PUBLIC_SITE_URL` не задан |

`SUPABASE_SERVICE_ROLE_KEY` в списке **нет намеренно.** Он не нужен ни
приложению, ни тестам: E2E заводит аккаунт через `DATABASE_URL`. Всё, что читает
серверный рантайм приложения, не должно уметь обходить RLS.

`POSTGRES_URL_NON_POOLING` намеренно не принимается — это прямое подключение,
из Vercel по IPv4 недостижимое.

Всё с префиксом `NEXT_PUBLIC_` уходит в браузер и вшивается **в момент
сборки**, а не читается при запуске: добавить переменную в окружение
недостаточно, нужна новая сборка, и без кэша. `DATABASE_URL` в браузер не
уходит никогда.

Про две строки с ключами таблица до недавнего времени врала, и это стоило
разбора на проде. «Предпочтителен» описывало намерение, а весь код читал только
`ANON_KEY`, поэтому окружение, настроенное строго по документации, не могло
никого пустить. Теперь принимаются оба имени, `PUBLISHABLE_KEY` первым.

Про `NEXT_PUBLIC_SITE_URL` таблица тоже врала, и это тоже стоило разбора на
проде. Адрес брался как `NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'`, то
есть незаданная переменная выдавала прод за localhost — и `og:image` уходил в
мир как `http://localhost:3000/<ник>/opengraph-image`. Каждая площадка шла за
картинкой к себе и не находила ничего: карточка пустая всюду, а в рендерере
верная.

Хуже, чем незаданная переменная: Vercel сам кладёт в окружение
`VERCEL_PROJECT_PRODUCTION_URL`, и Next по умолчанию берёт его. Явный
`metadataBase` перекрывал это значение localhost'ом — рабочая настройка
заменялась нерабочей.

Теперь порядок такой: `NEXT_PUBLIC_SITE_URL`, затем
`VERCEL_PROJECT_PRODUCTION_URL`, и только потом localhost (`src/lib/site-url.ts`).
На Vercel переменную можно не задавать вовсе; задавать её нужно, когда домен —
не продовый хост Vercel. Не `VERCEL_URL`: тот уникален для каждого
развёртывания, а этот же адрес должен лежать в Redirect URLs проекта Supabase,
и тогда каждый preview требовал бы своей записи.

## 10. Деплой (Vercel)

1. Импортировать репозиторий в Vercel
2. Прописать переменные окружения из §9, кроме `SUPABASE_SERVICE_ROLE_KEY`
3. `NEXT_PUBLIC_SITE_URL` — только если домен не совпадает с продовым хостом
   Vercel; иначе адрес берётся из `VERCEL_PROJECT_PRODUCTION_URL` сам
4. В Supabase → Authentication → URL Configuration добавить
   `<домен>/auth/callback` в Redirect URLs
5. Миграции применяются командой `npm run db:migrate` из CI или локально
   против продовой БД. `db:push` в проде не используется: он не оставляет
   истории изменений

Фоновых задач нет: списание заморозок ленивое, cron не требуется.
