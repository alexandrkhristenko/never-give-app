# Дальнейшие шаги — план имплементации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть четыре вещи, которые остались работой, а не доступом: гонку определения таймзоны, ответ 200 на приватных маршрутах без сессии, запись тестов в продовую базу и возможность вернуть рамку-картинку NES.css незамеченной.

**Architecture:** Ничего нового не вводится. Таймзона запоминается в cookie на первой же странице, которую человек видит, поэтому к моменту отправки онбординга она известна независимо от гидратации. Приватные маршруты получают **оптимистичный** редирект в proxy — решение об авторизации остаётся в DAL, как и записано в architecture §4; proxy лишь избавляет от отрисовки того, что всё равно будет отброшено. Наборы тестов получают единственное место, где решается, в какую базу они пишут. Рамки закрываются подметающим тестом вместо двух точечных.

**Tech Stack:** Next.js 16.3 (App Router, Proxy), React 19.2, TypeScript, Vitest, Playwright, Supabase Auth, Postgres.

## Global Constraints

- Документация проекта — на русском; комментарии в коде и тексты интерфейса — на английском, как в остальном репозитории.
- Сообщения коммитов заканчиваются `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Ветка `feature/mvp-completion`. `.idea/workspace.xml` не коммитить.
- Базовая линия, которая должна остаться зелёной после каждой задачи: `npx tsc --noEmit` без вывода, `npx eslint` — **0 ошибок и 0 предупреждений**, `npm test` — 113 и выше, `npm run test:db` — 45 и выше, `npm run test:e2e` — 42 и выше, `npm run build` проходит.
- `npm run db:push` запускать нельзя — скрипт заменён на отказ.
- `SUPABASE_SERVICE_ROLE_KEY` не должен появиться в `.env.local`.
- В логи не попадают адреса почты, текст обещаний, имена и токены: `LogFields` принимает только скаляры.
- Next 16: `searchParams` и `params` — это `Promise`; `redirect()` бросает управляющее исключение и не может стоять внутри `try/catch`.
- **Наборы `test:db` и `test:e2e` сейчас пишут в продовую базу.** Пока Задача 3 не закрыта, каждый прогон — операция над продовыми данными; удаления должны оставаться привязанными к своему `id` или к домену `@never-give.test`.

## Состояние на 2026-08-10

Что уже сделано и проверено — чтобы план не переоткрывал закрытое.

| Область | Состояние |
|---|---|
| Прод | Живёт на `https://www.never-give.app`, apex редиректит 308. Миграции накатаны, база отвечает |
| CI | Зелёный на `main` |
| Ветка | 12 коммитов впереди `main`, **не отправлена**: у агента нет права записи (403) |
| Вход по почте | Работает |
| Google и GitHub | Реализованы, **не включены** в Supabase — `authorize` отвечает `400 provider is not enabled` |
| Отказы входа | Больше не молчат: `/auth/callback` разбирает `error`, лендинг показывает сообщение из своей таблицы |
| Цепочка | Растёт слева направо, окно цепляется за первую отметку |
| OG-карточка | Проверена на живом домене тремя краулерными UA, просмотрена глазами |
| Рамки полей и кнопок | Видны в обеих темах, картинка NES.css снята, два теста стерегут |
| Таймзона | Отсутствие определения больше не молчит (`onboarding.timezone_absent`), но **сама гонка осталась** — Задача 1 |

---

## File Structure

**Создаётся:**

- `src/components/system/remember-timezone.tsx` — клиентский компонент без разметки: кладёт зону браузера в cookie. Единственная его обязанность.
- `db/connection.ts` — одно место, где решается, в какую базу пишут наборы тестов.

**Изменяется:**

- `src/lib/validation.ts` — `pickTimezone`, выбор первого разрешимого кандидата.
- `src/lib/validation.test.ts` — тесты на него.
- `src/app/layout.tsx` — монтирует `RememberTimezone`.
- `src/app/onboarding/actions.ts` — читает cookie как второго кандидата.
- `src/utils/supabase/middleware.ts` — оптимистичный редирект с приватных маршрутов.
- `db/settings.test.ts`, `db/freezes.test.ts`, `db/onboarding.test.ts`, `db/rate-limit.test.ts`, `db/username.test.ts` — берут строку подключения из `db/connection.ts`.
- `e2e/fixtures.ts` — оттуда же.
- `e2e/a11y.spec.ts` — подметающий тест на рамки-картинки.
- `e2e/auth-failure.spec.ts` — проверка, что приватный маршрут отвечает редиректом.
- `docs/architecture.md`, `docs/debt.md`, `docs/handover.md`, `README.md` — по итогам.

---

### Task 1: таймзона перестаёт зависеть от гидратации

`resolveTimezone` научился отличать «браузер молчал» от «браузер сказал UTC», и молчание пишется в лог. Но сама причина молчания на месте: скрытое поле заполняет эффект React, поэтому отправка, опередившая гидратацию, зоны не несёт. Воспроизведено на проде задержкой JS-чанков на двадцать секунд — аккаунт создаётся в `UTC`, хотя браузер сообщает `America/New_York`.

Cookie решает это не «ещё одним слоем», а тем, что переносит определение **на страницу раньше**. К онбордингу нельзя попасть, не пройдя вход, поэтому к моменту отправки формы cookie уже стоит — гидратация лендинга и формы входа случилась минуты назад.

**Files:**
- Create: `src/components/system/remember-timezone.tsx`
- Modify: `src/lib/validation.ts` (рядом с `resolveTimezone`)
- Modify: `src/lib/validation.test.ts`
- Modify: `src/app/layout.tsx:37-45` (тело документа)
- Modify: `src/app/onboarding/actions.ts:109-124`
- Test: `e2e/onboarding-timezone.spec.ts` (создаётся)

**Interfaces:**
- Consumes: `resolveTimezone(raw): { timezone: string; detected: boolean }` из `@/lib/validation`; `cookies()` из `next/headers`; `logWarn` из `@/lib/log`.
- Produces: `pickTimezone(candidates: readonly (string | null | undefined)[]): { timezone: string; detected: boolean }`; cookie с именем `tz`.

- [ ] **Step 1: Написать падающий тест на выбор кандидата**

Дописать в `src/lib/validation.test.ts`:

```ts
describe('pickTimezone', () => {
  it('prefers what the form submitted', () => {
    expect(pickTimezone(['America/New_York', 'Europe/Berlin'])).toEqual({
      timezone: 'America/New_York',
      detected: true,
    })
  })

  // The case the cookie exists for: the form beat hydration and sent nothing.
  it('falls back to the remembered zone', () => {
    expect(pickTimezone([undefined, 'Europe/Berlin'])).toEqual({
      timezone: 'Europe/Berlin',
      detected: true,
    })
    expect(pickTimezone(['', 'Europe/Berlin'])).toEqual({
      timezone: 'Europe/Berlin',
      detected: true,
    })
  })

  // A cookie is client-writable, so an unresolvable one must not shadow a
  // later candidate — and must not be stored.
  it('skips a candidate no runtime can resolve', () => {
    expect(pickTimezone(['Not/AZone', 'Europe/Berlin'])).toEqual({
      timezone: 'Europe/Berlin',
      detected: true,
    })
  })

  it('reports undetected when nothing usable arrived', () => {
    expect(pickTimezone([undefined, null, ''])).toEqual({
      timezone: 'UTC',
      detected: false,
    })
  })

  it('treats a reported UTC as a real answer and stops there', () => {
    expect(pickTimezone(['UTC', 'Europe/Berlin'])).toEqual({
      timezone: 'UTC',
      detected: true,
    })
  })
})
```

Добавить `pickTimezone` в импорт из `./validation`.

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `npx vitest run src/lib/validation.test.ts`
Expected: FAIL — `pickTimezone is not a function` (или ошибка импорта).

- [ ] **Step 3: Реализовать `pickTimezone`**

Дописать в `src/lib/validation.ts` сразу под `resolveTimezone`:

```ts
/**
 * The first candidate any runtime can resolve, in the order given.
 *
 * Two sources, and the order matters. The form field is what this browser says
 * right now; the cookie is what it said on an earlier page. The field wins when
 * it has anything to say, because a person can move between zones and the
 * cookie will be a year stale.
 *
 * The cookie is written by client script, so it is attacker-controllable for
 * whoever owns the browser — which is why it goes through `resolveTimezone`
 * like everything else, and why an unresolvable value falls through instead of
 * shadowing the next candidate. The worst a forged cookie achieves is a wrong
 * day boundary in its own account.
 */
export function pickTimezone(
  candidates: readonly (string | null | undefined)[],
): { timezone: string; detected: boolean } {
  for (const candidate of candidates) {
    const resolved = resolveTimezone(candidate)
    if (resolved.detected) return resolved
  }
  return { timezone: 'UTC', detected: false }
}
```

- [ ] **Step 4: Прогнать и убедиться, что проходит**

Run: `npx vitest run src/lib/validation.test.ts`
Expected: PASS — 23 теста в файле.

- [ ] **Step 5: Создать компонент, который запоминает зону**

`src/components/system/remember-timezone.tsx`:

```tsx
'use client'

import { useEffect } from 'react'

/**
 * Writes the browser's timezone into a cookie, so the server has it even when a
 * form is submitted before React has hydrated.
 *
 * Renders nothing. It exists because the onboarding form filled a hidden field
 * from an effect, and a submit that beat hydration therefore carried no zone at
 * all — reproduced on production with the JS chunks held back, creating an
 * account in UTC for a browser in America/New_York. See docs/debt.md D4.
 *
 * Mounted in the root layout rather than in the form: this only helps if it
 * runs on an *earlier* page than the one that submits. Reaching onboarding
 * requires signing in first, so by then this has run on the landing page and on
 * the login form, minutes earlier. Putting it next to the form would reproduce
 * the very race it removes.
 *
 * `max-age` is a year and the value is a zone name — not a secret, not an
 * identifier, and no use to anybody who reads it. `SameSite=Lax` rather than
 * `Strict`: a server action is a same-site POST, but `Strict` also withholds
 * the cookie on the first navigation in from an OAuth provider, which is
 * exactly when onboarding happens.
 */
export default function RememberTimezone() {
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!zone) return

    document.cookie = `tz=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`
  }, [])

  return null
}
```

- [ ] **Step 6: Смонтировать в корневом layout**

В `src/app/layout.tsx` добавить импорт:

```tsx
import RememberTimezone from '@/components/system/remember-timezone'
```

и внутри `<body>`, перед `{children}`:

```tsx
      <body className="flex min-h-full flex-col bg-bg text-ink">
        <RememberTimezone />
        {children}
      </body>
```

- [ ] **Step 7: Прочитать cookie в онбординге**

В `src/app/onboarding/actions.ts` заменить блок с `resolveTimezone`:

```ts
  const zone = resolveTimezone(formData.get('timezone')?.toString())
  if (!zone.detected) {
    logWarn('onboarding.timezone_absent', { userId: session.id })
  }
```

на:

```ts
  // Two chances at the zone. The field is what the browser says now; the cookie
  // is what it said on an earlier page, and it is there precisely for a submit
  // that beat hydration. See `pickTimezone` and docs/debt.md D4.
  const remembered = (await cookies()).get('tz')?.value
  const zone = pickTimezone([formData.get('timezone')?.toString(), remembered])
  if (!zone.detected) {
    // Now means both sources failed: no script ran at all, or a forged cookie.
    // Still not a reason to refuse a signup — settings can correct it.
    logWarn('onboarding.timezone_absent', { userId: session.id })
  }
```

Заменить импорт `resolveTimezone` на `pickTimezone` в списке из `@/lib/validation` и добавить:

```ts
import { cookies } from 'next/headers'
```

- [ ] **Step 8: Написать E2E, воспроизводящий гонку**

`e2e/onboarding-timezone.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { hasDatabaseAccess, missingDatabaseReason, test as seeded } from './fixtures'

test.skip(!hasDatabaseAccess, missingDatabaseReason)

/*
 * The defect: the hidden timezone field is filled by an effect, so a submit
 * that beats hydration used to carry nothing and the account was created in
 * UTC. Reproduced on production by holding the JS chunks back twenty seconds.
 *
 * The delay is what makes this a test rather than a hope: without it the effect
 * always wins on a fast machine and the assertion passes for the wrong reason.
 */
seeded('a submit that beats hydration still records the real zone', async ({
  page,
  user,
}) => {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/onboarding/)

  // The landing page and the login form have hydrated by now, so the cookie is
  // already written — which is the whole point of writing it there.
  const cookies = await page.context().cookies()
  expect(cookies.map((c) => c.name)).toContain('tz')

  await page.context().route(/\.js(\?|$)/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 20_000))
    await route.continue()
  })
  await page.goto('/onboarding', { waitUntil: 'domcontentloaded' })

  // Proof the race is real and this run is inside it.
  await expect(page.locator('input[name="timezone"]')).toHaveValue('')

  await page.getByLabel('Choose a username').fill(user.username)
  await page.getByLabel('Your Main Promise').fill('Beat hydration')
  await page.getByRole('button', { name: /start game/i }).click()
  await page.waitForURL(/dashboard/)

  await page.context().unroute(/\.js(\?|$)/)
  await page.goto('/settings')
  await expect(page.locator('#timezone')).toHaveValue(
    test.info().project.use.timezoneId ?? 'UTC',
  )
})
```

Прогон должен идти в известной зоне. Добавить в `playwright.config.ts`, в `use`:

```ts
    // A named zone rather than the machine's: the timezone test asserts against
    // it, and CI runs in UTC where a UTC result proves nothing.
    timezoneId: 'America/New_York',
```

- [ ] **Step 9: Прогнать новый набор и убедиться, что он красный до Step 5–7**

Порядок здесь обратный обычному: код уже написан. Проверить зубы иначе — временно вернуть в `onboarding/actions.ts` старую строку `resolveTimezone(formData.get('timezone')?.toString())`, прогнать, увидеть падение на `#timezone`, вернуть `pickTimezone`.

Run: `npm run test:e2e -- e2e/onboarding-timezone.spec.ts`
Expected: со старой строкой — FAIL: `#timezone` равен `UTC` вместо `America/New_York`. С новой — PASS.

- [ ] **Step 10: Полная проверка и коммит**

Run: `npx tsc --noEmit && npx eslint && npm test && npm run build && npm run test:e2e`

```bash
git add src/components/system/remember-timezone.tsx src/lib/validation.ts \
  src/lib/validation.test.ts src/app/layout.tsx src/app/onboarding/actions.ts \
  e2e/onboarding-timezone.spec.ts playwright.config.ts
git commit -F - <<'EOF'
fix: таймзона перестала зависеть от того, успела ли гидратация

D4 закрыт наполовину: отсутствие определённой зоны перестало быть невидимым,
но сама причина осталась. Скрытое поле заполняет эффект React, поэтому
отправка, опередившая гидратацию, зоны не несёт — воспроизведено на проде
задержкой JS-чанков на двадцать секунд.

Cookie переносит определение на страницу раньше, а не добавляет ещё один слой
проверок. К онбордингу нельзя попасть, не пройдя вход, значит к моменту
отправки формы гидратация лендинга и формы входа случилась минуты назад.
Компонент смонтирован в корневом layout именно поэтому: рядом с формой он
воспроизвёл бы ту же гонку, которую убирает.

Cookie пишется клиентом, то есть подделываема владельцем браузера. Она проходит
через resolveTimezone, как и всё остальное, и неразрешимое значение не
затеняет следующего кандидата. Худшее, чего добьётся подделка, — неверная
граница суток в своём же аккаунте.

Поле формы остаётся первым кандидатом: человек может переехать, а cookie живёт
год.

E2E воспроизводит гонку задержкой чанков и утверждает, что поле до гидратации
пусто, — без этого на быстрой машине эффект всегда успевает, и проверка
проходит по неверной причине.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: приватные маршруты отвечают редиректом, а не 200 со скелетом

`/dashboard`, `/settings` и `/onboarding` без сессии отдают **200** и телом — скелет из `loading.tsx`: заголовок панели и ничего больше. Затем в тот же поток приходит переход, и браузер уходит на `/login`. Проверено запросом без единой cookie.

Данные не утекают — DAL редиректит раньше, чем что-либо прочитает. Чинится не защита, а честность ответа и лишняя отрисовка того, что будет отброшено.

Это **не** перенос авторизации в proxy. Architecture §4 фиксирует, что proxy решений об авторизации не принимает, и это остаётся так: редирект оптимистичный, по факту отсутствия пользователя, а решение о доступе к строкам по-прежнему за DAL и RLS. Именно такую оптимистичную проверку рекомендует документация Next. `updateSession` уже вызывает `getUser()` и **выбрасывает результат** — то есть проверка бесплатна, платит только тот, кто её выкинул.

**Files:**
- Modify: `src/utils/supabase/middleware.ts:6-40`
- Modify: `docs/architecture.md` §4 «Сессия», `docs/debt.md` C2
- Test: `e2e/auth-failure.spec.ts`

**Interfaces:**
- Consumes: `NextResponse`, `NextRequest` из `next/server`.
- Produces: ничего для последующих задач.

- [ ] **Step 1: Написать падающий тест**

Дописать в `e2e/auth-failure.spec.ts`:

```ts
/*
 * These used to answer 200 with the loading skeleton — the panel title and
 * nothing else — because in Next 16 a dynamic route streams its status before
 * the server component can decide to redirect. No data leaked: the DAL
 * redirects before it reads anything. What leaked was honesty.
 */
for (const path of ['/dashboard', '/settings', '/onboarding']) {
  test(`${path} sends a signed-out visitor away instead of answering 200`, async ({
    page,
  }) => {
    await page.context().clearCookies()

    const response = await page.request.get(path, { maxRedirects: 0 })

    expect(response.status(), `${path} status`).toBe(307)
    expect(new URL(response.headers()['location'], 'http://localhost:3000').pathname).toBe('/login')
  })
}
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `npm run test:e2e -- e2e/auth-failure.spec.ts --grep "sends a signed-out"`
Expected: FAIL — `status` равен 200 для всех трёх.

- [ ] **Step 3: Добавить оптимистичный редирект**

В `src/utils/supabase/middleware.ts` заменить:

```ts
  await supabase.auth.getUser()

  return supabaseResponse
}
```

на:

```ts
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Optimistic, not authorisation. The DAL and RLS still decide who sees which
  // rows — this only spares the framework from streaming a page that is about
  // to be thrown away, and spares the caller a 200 that means "no". Next's own
  // guidance puts exactly this much in middleware and no more.
  //
  // The call above was already being made and its result discarded, so the
  // check costs nothing that was not already spent.
  if (!user && isPrivate(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'

    const redirect = NextResponse.redirect(url)
    // The refreshed session cookies have to survive the redirect, or the next
    // request arrives with the stale pair this function exists to replace.
    supabaseResponse.cookies
      .getAll()
      .forEach((cookie) => redirect.cookies.set(cookie))

    return redirect
  }

  return supabaseResponse
}

/**
 * Routes that are meaningless without a session.
 *
 * Prefix matching with an explicit boundary: `startsWith('/settings')` alone
 * would also claim a future `/settingsomething`, and a username is a root
 * segment here — `/dashboardguy` is a profile somebody could register.
 */
const PRIVATE_PREFIXES = ['/dashboard', '/settings', '/onboarding'] as const

function isPrivate(pathname: string): boolean {
  return PRIVATE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}
```

- [ ] **Step 4: Прогнать и убедиться, что проходит, и что вход не сломан**

Run: `npm run test:e2e`
Expected: PASS — 45 и выше. Особенно важны `e2e/streak.spec.ts` (проходит онбординг и чек-ин с настоящей сессией) и `e2e/auth-failure.spec.ts`.

- [ ] **Step 5: Проверить, что зарезервированные имена не пострадали**

Run: `npm test -- validation`
Expected: PASS. `/dashboardguy` не должен считаться приватным — это профиль, и тест на границу префикса выше именно об этом.

Дополнительно вручную:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/dashboardguy
```
Expected: 200 (страница «не найдено»), а не редирект на `/login`.

- [ ] **Step 6: Привести документы к новому поведению**

В `docs/architecture.md` §4 «Сессия» дописать:

```markdown
С тех пор proxy делает **одну** оптимистичную проверку: если пользователя нет, а
путь начинается с `/dashboard`, `/settings` или `/onboarding`, он отвечает
редиректом на `/login`. Это не перенос авторизации — решение о доступе к строкам
остаётся за DAL и RLS. Смысл в честности ответа: до этого такой запрос получал
200 и скелет из `loading.tsx`, потому что в Next 16 статус динамического
маршрута уходит раньше, чем серверный компонент успевает передумать.

Вызов `getUser()` здесь был и раньше, а его результат выбрасывался, поэтому
проверка не добавила ни одного обращения к Supabase.
```

В `docs/debt.md` C2 заменить утверждение про `/dashboard` на: закрыто для приватных маршрутов оптимистичным редиректом, остаётся для публичного профиля, где «не найдено» решается уже после чтения базы.

- [ ] **Step 7: Коммит**

```bash
git add src/utils/supabase/middleware.ts e2e/auth-failure.spec.ts \
  docs/architecture.md docs/debt.md
git commit -F - <<'EOF'
fix: приватный маршрут без сессии отвечал 200 со скелетом

/dashboard, /settings и /onboarding отдавали 200 и телом — скелет из
loading.tsx, заголовок панели и больше ничего. Затем в тот же поток приходил
переход, и браузер уходил на /login. Проверено запросом без единой cookie.

Данные не утекали: DAL редиректит раньше, чем что-либо прочитает. Неверным был
ответ — 200 означает «вот оно», а это было «нет».

Это не перенос авторизации в proxy: решение о доступе к строкам остаётся за DAL
и RLS, а здесь стоит оптимистичная проверка по факту отсутствия пользователя —
ровно та, которую документация Next и рекомендует держать в middleware. Вызов
getUser() тут уже был, и его результат выбрасывался, так что проверка не
добавила ни одного обращения к Supabase.

Границы префиксов заданы явно: username живёт в корневом сегменте, поэтому
/dashboardguy — это профиль, который кто-то мог зарегистрировать, а не приватный
маршрут.

Обновлённые cookies переносятся в редирект: иначе следующий запрос пришёл бы с
той самой устаревшей парой, которую эта функция и обновляет.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: наборы тестов перестают по умолчанию писать в продовую базу

Шесть файлов независимо читают `process.env.DATABASE_URL`. Это та же база, которой пользуется прод: достаточно сравнить ref в строке подключения с `NEXT_PUBLIC_SUPABASE_URL`, и это подтверждено поведением — засеянный напрямую профиль немедленно отдался с прода.

Отдельный проект Supabase завести не в силах агента, но **место, где это решается, завести можно** — и оно же делает риск видимым при каждом прогоне. После этой задачи переключение на отдельную базу становится одной переменной, а не правкой шести файлов.

**Files:**
- Create: `db/connection.ts`
- Modify: `db/settings.test.ts:23`, `db/freezes.test.ts:23`, `db/onboarding.test.ts:20`, `db/rate-limit.test.ts:15`, `db/username.test.ts:17`
- Modify: `e2e/fixtures.ts:27-32`
- Modify: `README.md` §Тесты, `docs/handover.md` §5, `docs/debt.md` раздел B

**Interfaces:**
- Produces: `testDatabaseUrl(): string`, `describeTestDatabase(): string`, `hasTestDatabase: boolean`, `missingTestDatabaseReason: string`.

- [ ] **Step 1: Создать `db/connection.ts`**

```ts
/**
 * The one place that decides which database the suites write to.
 *
 * Six files used to read `process.env.DATABASE_URL` independently, and that is
 * the production database: the connection string carries the same project ref
 * as `NEXT_PUBLIC_SUPABASE_URL`, confirmed by behaviour — a profile seeded
 * directly was served by production immediately. So every `test:db` and
 * `test:e2e` run is an operation on production data.
 *
 * `TEST_DATABASE_URL` is preferred when set, which makes moving to a separate
 * Supabase project one variable rather than an edit in six files. Until such a
 * project exists the fallback stands, because a suite that cannot run is worth
 * less than one that runs somewhere it should not — but it says so out loud
 * once per run, so nobody discovers it from a deleted row.
 */

const TEST_URL = process.env.TEST_DATABASE_URL
const FALLBACK_URL = process.env.DATABASE_URL

export const hasTestDatabase = Boolean(TEST_URL || FALLBACK_URL)

export const missingTestDatabaseReason =
  'Neither TEST_DATABASE_URL nor DATABASE_URL is set. One of them belongs in .env.local, next to the Supabase keys.'

export function testDatabaseUrl(): string {
  const url = TEST_URL || FALLBACK_URL
  if (!url) throw new Error(missingTestDatabaseReason)
  return url
}

/** Which database, without printing credentials. */
export function describeTestDatabase(): string {
  if (TEST_URL) return 'TEST_DATABASE_URL (a database of its own)'
  return 'DATABASE_URL — the production database. Seeded rows and deletions land in production.'
}

/** Announced once per process, so the choice is never silent. */
let announced = false
export function announceTestDatabase(): void {
  if (announced || !hasTestDatabase) return
  announced = true
  console.warn(`[tests] writing to ${describeTestDatabase()}`)
}
```

- [ ] **Step 2: Перевести пять файлов набора БД**

В каждом из `db/settings.test.ts`, `db/freezes.test.ts`, `db/onboarding.test.ts`, `db/rate-limit.test.ts`, `db/username.test.ts` заменить строку вида

```ts
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 })
```

на

```ts
announceTestDatabase()
const sql = postgres(testDatabaseUrl(), { prepare: false, max: 1 })
```

сохранив исходное значение `max` (в `db/rate-limit.test.ts` оно `5` — оно там нужно, набор проверяет двенадцать одновременных вызовов). Добавить в каждый:

```ts
import { announceTestDatabase, testDatabaseUrl } from './connection'
```

- [ ] **Step 3: Перевести фикстуру E2E**

В `e2e/fixtures.ts` заменить:

```ts
const CONNECTION = process.env.DATABASE_URL

export const hasDatabaseAccess = Boolean(CONNECTION)

export const missingDatabaseReason =
  'DATABASE_URL is not set. It belongs in .env.local, next to the Supabase keys.'
```

на:

```ts
import {
  announceTestDatabase,
  hasTestDatabase,
  missingTestDatabaseReason,
  testDatabaseUrl,
} from '../db/connection'

export const hasDatabaseAccess = hasTestDatabase
export const missingDatabaseReason = missingTestDatabaseReason
```

и в `sql()` заменить построение клиента:

```ts
function sql() {
  if (!hasTestDatabase) throw new Error(missingTestDatabaseReason)
  announceTestDatabase()
  client ??= postgres(testDatabaseUrl(), { prepare: false, max: 1 })
  return client
}
```

- [ ] **Step 4: Проверить, что оба набора зелёные и говорят, куда пишут**

Run: `npm run test:db 2>&1 | head -5`
Expected: строка `[tests] writing to DATABASE_URL — the production database…`, затем 45 passed.

Run: `TEST_DATABASE_URL="$DATABASE_URL" npm run test:db 2>&1 | head -3`
Expected: строка `[tests] writing to TEST_DATABASE_URL (a database of its own)`, затем 45 passed. Это проверяет ветку предпочтения, не требуя второй базы.

Run: `npm run test:e2e`
Expected: 45 и выше.

- [ ] **Step 5: Записать в документах**

В `README.md` §Тесты заменить абзац про продовую базу на:

```markdown
Оба набора пишут в базу из `TEST_DATABASE_URL`, а если её нет — из
`DATABASE_URL`. Второе означает продовую базу, и набор говорит об этом строкой
`[tests] writing to …` в начале прогона. Отдельный проект Supabase под тесты
убрал бы этот класс целиком; пока его нет, переключение — одна переменная в
`.env.local`.
```

В `docs/handover.md` §5 и `docs/debt.md` (раздел B, абзац про риск) отметить, что место переключения появилось, а сам отдельный проект по-прежнему за владельцем.

- [ ] **Step 6: Коммит**

```bash
git add db/connection.ts db/*.test.ts e2e/fixtures.ts README.md \
  docs/handover.md docs/debt.md
git commit -F - <<'EOF'
test: одно место решает, в какую базу пишут наборы

Шесть файлов независимо читали process.env.DATABASE_URL, а это та же база,
которой пользуется прод: ref в строке подключения совпадает с
NEXT_PUBLIC_SUPABASE_URL, и это подтверждено поведением — засеянный напрямую
профиль немедленно отдался с прода. То есть каждый прогон test:db и test:e2e
был операцией над продовыми данными, и нигде об этом не говорилось.

Отдельный проект Supabase агенту не завести, но место, где это решается,
завести можно. TEST_DATABASE_URL предпочитается, когда задана, — значит переезд
становится одной переменной вместо правки шести файлов. Пока отдельной базы нет,
запасной путь остаётся: набор, который не может запуститься, хуже набора,
который пишет не туда. Но молчать он перестал — строка в начале прогона
называет базу, чтобы о выборе не узнавали по удалённой строке.

Ветка предпочтения проверена прогоном с TEST_DATABASE_URL, равной DATABASE_URL:
для проверки самого предпочтения вторая база не нужна.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 4: рамку-картинку нельзя вернуть незамеченной

Два теста стерегут поля и кнопки поимённо. Их хватило бы, если бы список компонентов NES.css был закрыт, — но он не закрыт: `.nes-progress`, `.nes-balloon`, `.nes-dialog`, `.nes-table.is-bordered` несут ту же вшитую рамку и появятся в интерфейсе, как только понадобятся. Дефект D5 прожил всё время существования тёмной темы именно потому, что искали не там.

Подметающий тест утверждает не про компонент, а про правило: **в этом интерфейсе рамка не рисуется картинкой**. Тогда следующий компонент NES.css попадётся в тот же день, когда его добавят.

**Files:**
- Modify: `e2e/a11y.spec.ts`
- Modify: `docs/superpowers/specs/2026-08-06-frontend-design.md` §2.2 (правило уже записано — дополнить ссылкой на подметающий тест)

**Interfaces:**
- Consumes: `settled(page)` из того же файла.
- Produces: ничего.

- [ ] **Step 1: Написать подметающий тест**

Дописать в `e2e/a11y.spec.ts`:

```ts
/*
 * The rule, rather than the two components that broke it.
 *
 * `.nes-input` and `.nes-btn` are covered by name above, and that was enough
 * only because the list of NES.css components in use happened to be short.
 * `.nes-progress`, `.nes-balloon`, `.nes-dialog` and `.nes-table.is-bordered`
 * carry the same baked `border-image-source`, and each will arrive the day
 * somebody needs it. D5 survived for as long as the dark theme existed because
 * the search was aimed at a component instead of at the rule.
 *
 * The rule: in this interface a border is not painted by an image. A border
 * image cannot read a custom property, so anything carrying one is showing a
 * colour that no theme chose — which is exactly how a field ended up black on
 * black while its computed `border-color` reported the right answer.
 */
test('no element paints its border with an image', async ({ page }) => {
  for (const theme of ['dark', 'light'] as const) {
    await page.context().clearCookies()
    await page.context().addCookies([
      { name: 'theme', value: theme, url: 'http://localhost:3000' },
    ])

    for (const path of ['/', '/login', '/nobody-has-this-name']) {
      await page.goto(path)
      await settled(page)

      const offenders = await page.evaluate(() =>
        [...document.querySelectorAll('*')]
          .filter((el) => {
            const style = getComputedStyle(el)
            return (
              style.borderImageSource !== 'none' &&
              parseFloat(style.borderTopWidth) > 0
            )
          })
          .map(
            (el) =>
              `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`,
          ),
      )

      expect(offenders, `${theme} ${path}`).toEqual([])
    }
  }
})
```

- [ ] **Step 2: Убедиться, что тест зелёный сейчас и краснеет без фикса**

Run: `npm run test:e2e -- e2e/a11y.spec.ts --grep "paints its border"`
Expected: PASS.

Затем временно убрать `border-image-source: none` из блока `.nes-btn` в `src/app/nes-theme.css`, пересобрать (`npm run build`) и прогнать снова.
Expected: FAIL со списком вида `["button.nes-btn", "a.nes-btn"]`. Вернуть строку и пересобрать.

- [ ] **Step 3: Дописать правило в спеку фронтенда**

В `docs/superpowers/specs/2026-08-06-frontend-design.md` §2.2, в абзаце про ловушку, к предложению про `e2e/a11y.spec.ts` добавить:

```markdown
Проверок там три: две поимённые на поля и кнопки, и одна подметающая — она
утверждает, что **ни один** элемент ни на одной странице не рисует рамку
картинкой. Поимённых недостаточно: `.nes-progress`, `.nes-balloon`,
`.nes-dialog` и `.nes-table.is-bordered` несут ту же вшитую рамку и появятся,
как только понадобятся.
```

- [ ] **Step 4: Полная проверка и коммит**

```bash
git add e2e/a11y.spec.ts docs/superpowers/specs/2026-08-06-frontend-design.md
git commit -F - <<'EOF'
test: правило вместо двух компонентов — рамка не рисуется картинкой

Поля и кнопки стерегут два поимённых теста, и их хватало только потому, что
список используемых компонентов NES.css оказался короток. Он не закрыт:
.nes-progress, .nes-balloon, .nes-dialog и .nes-table.is-bordered несут ту же
вшитую рамку и появятся в тот день, когда понадобятся.

D5 прожил всё время существования тёмной темы именно потому, что искали
компонент, а не правило. Подметающий тест утверждает правило: в этом интерфейсе
рамка не рисуется картинкой. Картинка не умеет читать пользовательское
свойство, значит любой элемент с ней показывает цвет, которого не выбирала ни
одна тема — ровно так поле оказалось чёрным по чёрному, пока вычисленный
border-color отвечал верно.

Проверено снятием фикса у кнопок: тест перечисляет button.nes-btn и a.nes-btn.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Не задачи: требует доступов, которых у исполнителя нет

Порядок — по цене отказа.

1. **Отправить ветку и открыть PR.** Двенадцать коммитов ждут. У агента нет права записи: токен `gh` принадлежит `dev-pin-solutions` с доступом только на чтение, SSH-ключ недоступен. Тело PR готово в `docs/pr-description-auth-and-docs.md`.
2. **Включить Google и GitHub** в Supabase → Authentication → Providers. `authorize` отвечает `400 provider is not enabled`, и две из трёх кнопок входа уводят человека на страницу с JSON вне приложения. Единственный незакрытый пункт готовности MVP, который остаётся требованием ([debt.md](../../debt.md) B10).
3. **Добавить `https://www.never-give.app/auth/callback`** в Authentication → URL Configuration → Redirect URLs.
4. **Прогнать профиль через отладчики Facebook, X и Telegram** — после пункта 1, иначе они закэшируют старую карточку. Теги, PNG 1200×630 и три краулерных UA уже проверены на живом домене.
5. **Завершить свой онбординг.** В базе один аккаунт `auth.users` без профиля; онбординг на проде проверен и работает ([handover.md](../../handover.md) §9). После этого сверить зону в `/settings` с тем, что сообщает устройство.
6. **DSN Sentry** ([debt.md](../../debt.md) B9). Работа после получения — замена функции `emit`.
7. **Отдельный проект Supabase под тесты.** Задача 3 готовит переключатель; сам проект — за владельцем.
8. **Скринридер и живые устройства.** Разметка утверждает, что цепочка читается одной строкой, и `e2e/a11y.spec.ts` это проверяет; как это звучит, знает только тот, кто слушал.

## Не задачи: решение владельца

**Кнопки Google и GitHub, если провайдеров включать не планируется.** Кнопка, ведущая наружу с ошибкой, хуже отсутствующей — тот же довод, по которому из D3 убрали подсказку с несуществующим доменом. Убрать их — правка на десять минут; но это снимает две трети обещанных спекой способов входа (§2), поэтому решение продуктовое. Третий путь — научить приложение знать, какие провайдеры настроены, то есть завести ещё одну переменную окружения; при живом плане включить провайдеров это лишняя механика.

## Не задачи: решено не чинить

Формулировки и условия, при которых решение изменится — [debt.md](../../debt.md) C. Здесь только перечень: CSP без nonce (C1); 200 вместо 404 на публичном профиле, которого нет (C2 — приватные маршруты закрывает Задача 2); публичный профиль до ленивого списания (C3); сдвиг истории при смене таймзоны (C4); одно обещание на пользователя (C5); зарезервированные поля схемы (C6); умеренные уязвимости в dev-зависимостях (C7).

---

## Self-Review

**Покрытие.** Четыре задачи закрывают всё, что осталось работой: гонку гидратации (Задача 1 — вторая половина D4), 200 на приватных маршрутах (Задача 2 — часть C2), запись тестов в прод (Задача 3 — подготовка к тому, что заблокировано), возвращаемость D5 (Задача 4). Остальное — доступы и одно продуктовое решение, и всё это перечислено явно, а не пропущено.

**Заглушек нет.** Каждый шаг несёт готовый код, точный текст замены или команду с ожидаемым выводом.

**Согласованность имён.** `pickTimezone` объявлена в Задаче 1 шаг 3 и используется в шаге 7 под тем же именем и с той же сигнатурой; она вызывает `resolveTimezone`, существующую в `src/lib/validation.ts`. `testDatabaseUrl`, `announceTestDatabase`, `hasTestDatabase`, `missingTestDatabaseReason` объявлены в Задаче 3 шаг 1 и используются в шагах 2–3. `isPrivate` и `PRIVATE_PREFIXES` — локальные для `middleware.ts`, объявлены в том же шаге, где применены. `settled(page)` уже существует в `e2e/a11y.spec.ts`.

**Одно отступление от TDD, названное вслух.** В Задаче 1 тест E2E появляется после кода: гонку нельзя воспроизвести до того, как есть чему её проигрывать. Зубы проверяются обратной подстановкой старой строки — шаг 9 описывает это явно.

**Риск, который стоит держать в голове.** Задача 2 меняет поведение на пути входа. Если `PRIVATE_PREFIXES` захватит лишнее, пострадают публичные профили: username живёт в корневом сегменте, поэтому границы префиксов проверяются отдельным шагом (шаг 5), а не считаются очевидными.
