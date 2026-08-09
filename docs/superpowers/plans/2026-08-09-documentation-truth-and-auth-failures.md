# Правда в документации и молчащие отказы аутентификации — план имплементации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть два незаписанных дефекта на пути входа — отказы Supabase, которые приложение молча проглатывает, — и привести пять документов к тому, что код и прод делают на самом деле.

**Architecture:** Отказы аутентификации сводятся к короткому whitelist-коду в query-параметре; единственная поверхность, которая их показывает, — лендинг, потому что именно там стоят все три кнопки входа. Текст сообщения берётся из таблицы в репозитории, а не из параметра, — иначе URL становится способом напечатать произвольный текст на нашей странице. Документы правятся по одному файлу за задачу: ревьюер должен иметь возможность отклонить правку одного и принять правку другого.

**Tech Stack:** Next.js 16.3 (App Router, Route Handlers), React 19.2, TypeScript, Vitest, Playwright, Supabase Auth (`@supabase/ssr`).

## Global Constraints

- Документация проекта — **на русском**. Код, комментарии в коде, тексты в интерфейсе и сообщения коммитов кода — по сложившемуся в репозитории образцу: комментарии и UI на английском, сообщение коммита на русском.
- Сообщения коммитов заканчиваются строкой `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Ветка `feature/mvp-completion`. Не коммитить `.idea/workspace.xml`.
- После каждой задачи должно оставаться зелёным: `npx tsc --noEmit` (без ошибок), `npx eslint` (0 errors; 4 warnings — предсуществующие), `npm test` (105 юнитов и выше), `npm run test:e2e` (36 и выше), `npm run build`.
- `npm run db:push` запускать нельзя — скрипт заменён на отказ, команда снесла бы политики RLS.
- `SUPABASE_SERVICE_ROLE_KEY` не должен появиться в `.env.local`.
- В логи не попадают адреса почты, текст обещаний, имена и токены. Тип `LogFields` принимает только скаляры (`src/lib/log.ts`).
- Next 16: `searchParams` и `params` — это `Promise`, обязателен `await`. `redirect()` бросает управляющее исключение и не может стоять внутри `try/catch`.
- Наборы `test:db` и `test:e2e` пишут в **продовую** базу. Не добавлять в них удалений, не привязанных к своему `id` или к домену `@never-give.test`.

---

## Что установлено проверкой, а не прочитано в документах

Основание для задач ниже. Каждый пункт проверен против кода, базы или живого прода 2026-08-09.

| Утверждение документа | Что на самом деле | Куда пошло |
|---|---|---|
| product-spec §2: вход тремя способами | Google и GitHub **не включены** в Supabase: `authorize` отвечает `400 {"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}`. Человек уходит на голый JSON вне приложения | Owner-действие №1 + Задача 1 |
| `/auth/callback` обменивает код на сессию | Результат `exchangeCodeForSession` отбрасывается, параметры `error`/`error_description` не читаются вовсе. Любой отказ ведёт на `/dashboard` → `/login` без слова объяснения | Задача 1 |
| `/auth/signin` при отказе шлёт `/?error=Could not authenticate` | `Home()` не принимает `searchParams` и не читает `error`. Сообщение складывается в URL и выбрасывается. `error` из `signInWithOAuth` не используется (предупреждение линтера) | Задача 2 |
| product-spec §3.3, §7: приватный и несуществующий профиль отдают 404 | Отдают **200** с содержимым «не найдено». Проверено на проде: `/nosuchuser000` → 200. Это осознанное следствие потоковой отдачи Next 16, записанное в debt.md C2, но спека остаётся нормативной и ей противоречит | Задача 3 |
| product-spec §5: `private` не предлагается в MVP, поле зарезервировано под будущий экран настроек | Экран настроек существует, `private` в нём выбирается. Проверено обходом: выбор `private` перестаёт отдавать публичную страницу | Задача 3 |
| product-spec §6: список зарезервированных имён (13 значений) | В коде 14: добавлен `_next`, без которого профиль мог занять путь ассетов фреймворка | Задача 3 |
| product-spec §7: чек-лист готовности MVP, все пункты не отмечены | Восемь из десяти выполнены; пункт про три способа входа выполнен на треть, пункт про 404 не выполнен и не будет | Задача 3 |
| data-model: `promises.title` — `varchar(255)` | `varchar(80)`: `src/db/schema.ts:49`. Ограничение продиктовано шириной 320px в пиксельном шрифте | Задача 4 |
| data-model: «Временные метки — `timestamp` с `defaultNow()`» | `timestamptz`, миграция 0004 | Задача 4 |
| data-model: «`DELETE` не разрешён нигде: MVP не удаляет данные» | Грантов на `DELETE` действительно нет, но удаление аккаунта существует — через `private.delete_own_account()` (`security definer`, цель из проверенного JWT). Данные удаляются каскадом от `auth.users` | Задача 4 |
| data-model: политики и гранты — в `drizzle/0001_rls_policies.sql` | Их меняют ещё 0002, 0003, 0006 и 0007. Грант UPDATE на `promises` сужен до `(title, visibility)`; появилась схема `private` со счётчиком частоты | Задача 4 |
| data-model: `avatar_level` «отображается на дашборде и в профиле» | Подпись `Lvl` убрана, стадия аватара выводится из длины стрика (known-issues 1.14) | Задача 4 |
| architecture §9: таблица переменных окружения | Таблица **разорвана**: абзац вставлен между строками, и три последние строки (`DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) перестали быть строками таблицы | Задача 5 |
| architecture §2: карта роутов | Нет `/settings`, `/<username>/opengraph-image`, `/robots.txt` | Задача 5 |
| architecture §3: дерево исходников; `schema.ts` — «таблицы, индексы, политики» | Политик в `schema.ts` нет, они в рукописных миграциях — это прямо противоречит data-model. Отсутствуют `settings/`, `components/`, `lib/log.ts`, `lib/rate-limit.ts`, `lib/site-url.ts`, `lib/theme.ts`, `lib/view/chain.ts`, `utils/supabase/credentials.ts`, `utils/supabase/report.ts` | Задача 5 |
| `src/utils/supabase/report.ts`: «middleware runs in the edge runtime» | `src/proxy.ts` не объявляет `runtime`, в Next 16 Proxy работает на Node — это же сказано в architecture §7 и §8.1. Две строки в логе объясняются отдельными копиями модуля в разных бандлах, а не разными рантаймами | Задача 5 |
| README §Тесты: E2E требуют `SUPABASE_SERVICE_ROLE_KEY` в `.env.test.local` | Ключ **не нужен**: аккаунт заводится через `DATABASE_URL` (debt.md B1, handover §1, `e2e/fixtures.ts`). README прямо противоречит handover | Задача 6 |
| README §Скрипты, §Документация | Нет `test:db`, `db:prune-test-users`; нет ссылок на `debt.md` и `handover.md` | Задача 6 |
| debt.md A5 и known-issues 2.6: Sentry — «это раздел B» | В разделе B нет строки про Sentry. Ссылка висит в пустоту | Задача 7 |
| pr-description.md: «76 unit tests» | 105. Документ описывает влитый PR #1 и является историческим | Задача 7 |

Проверено и **подтверждено** (правки не нужны): `src/proxy.ts` существует, `cacheComponents` не включён, грантов на `DELETE` нет, механика заморозок и правила стрика соответствуют product-spec §4 (45 тестов БД), OG-картинка отдаётся как PNG 1200×630 фирменным шрифтом, RLS включена.

---

## File Structure

**Создаётся:**

- `src/lib/auth-errors.ts` — таблица «код отказа → текст для человека» и функция сопоставления. Единственное место, где отказ аутентификации превращается в слова. Отвечает только за это: маршруты выбирают код, страница показывает текст.
- `src/lib/auth-errors.test.ts` — юнит-тесты сопоставления, включая случай подставленного в URL мусора.

**Изменяется:**

- `src/app/auth/callback/route.ts` — перестаёт отбрасывать результат обмена и параметры отказа.
- `src/app/auth/signin/route.ts` — перестаёт отбрасывать `error`, пишет его в лог, отдаёт код вместо фразы.
- `src/app/page.tsx` — принимает `searchParams`, показывает сообщение.
- `e2e/auth-failure.spec.ts` — новый набор: отказ доходит до человека и не даёт напечатать на странице произвольный текст.
- `docs/product-spec.md`, `docs/data-model.md`, `docs/architecture.md`, `README.md`, `docs/known-issues.md`, `docs/debt.md`, `docs/pr-description.md` — по одной задаче на файл или группу.

---

### Task 1: `/auth/callback` перестаёт проглатывать отказы

Сейчас маршрут вызывает `exchangeCodeForSession(code)` и выбрасывает результат, а параметры `error`/`error_description`, которыми Supabase сообщает об отказе, не читает вовсе. Любой сбой — просроченная ссылка подтверждения, отказ провайдера, несовпадение PKCE — заканчивается редиректом на `/dashboard`, откуда `requireSessionUser()` уводит на `/login`. Человек оказывается у формы входа без единого слова о том, что произошло.

**Files:**
- Create: `src/lib/auth-errors.ts`
- Create: `src/lib/auth-errors.test.ts`
- Modify: `src/app/auth/callback/route.ts` (весь файл, сейчас 15 строк)

**Interfaces:**
- Consumes: `logError(event: string, error: unknown, fields?: LogFields): void` из `@/lib/log`.
- Produces: `type AuthErrorCode = 'denied' | 'expired' | 'failed'`; `function authErrorMessage(raw: string | string[] | undefined): string | null`. Задача 2 показывает результат `authErrorMessage`, Задача 2 же полагается на то, что маршруты кладут в `?error=` только значения `AuthErrorCode`.

- [ ] **Step 1: Написать падающий тест на сопоставление кода и текста**

Создать `src/lib/auth-errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { authErrorMessage } from './auth-errors'

describe('authErrorMessage', () => {
  it('names each refusal the routes can produce', () => {
    expect(authErrorMessage('denied')).toBe('Sign-in was cancelled.')
    expect(authErrorMessage('expired')).toBe(
      'That link has expired. Request a new one.',
    )
    expect(authErrorMessage('failed')).toBe(
      'Sign-in could not be completed. Please try again.',
    )
  })

  it('says nothing when there is nothing to say', () => {
    expect(authErrorMessage(undefined)).toBeNull()
    expect(authErrorMessage('')).toBeNull()
  })

  // A query parameter is written by whoever sends the link, so it must never
  // reach the page. An unrecognised value falls back to our own sentence.
  it('never echoes what it was given', () => {
    const injected = '<script>alert(1)</script>'
    expect(authErrorMessage(injected)).toBe(
      'Sign-in could not be completed. Please try again.',
    )
    expect(authErrorMessage('Could not authenticate')).toBe(
      'Sign-in could not be completed. Please try again.',
    )
  })

  // Next hands a repeated parameter over as an array.
  it('ignores a repeated parameter instead of picking one', () => {
    expect(authErrorMessage(['denied', 'failed'])).toBeNull()
  })
})
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `npx vitest run src/lib/auth-errors.test.ts`
Expected: FAIL — `Failed to resolve import "./auth-errors"`.

- [ ] **Step 3: Создать `src/lib/auth-errors.ts`**

```ts
/**
 * The words a person sees when signing in did not work.
 *
 * The routes pick a code, this table turns it into a sentence, and the landing
 * page renders the sentence. Three files, one vocabulary.
 *
 * The text lives here rather than in the query parameter it arrives with,
 * because that parameter is written by whoever composed the link. Echoing it
 * would make `/?error=<anything>` a way to print arbitrary words on our own
 * page, over our own layout, above our own sign-in buttons. Whoever sends the
 * link chooses the code; we choose the sentence.
 */

export type AuthErrorCode = 'denied' | 'expired' | 'failed'

const MESSAGES: Record<AuthErrorCode, string> = {
  denied: 'Sign-in was cancelled.',
  expired: 'That link has expired. Request a new one.',
  failed: 'Sign-in could not be completed. Please try again.',
}

/**
 * The message for a `?error=` value, or null when there is no complaint.
 *
 * An unrecognised value still gets the general sentence: it means something did
 * go wrong on a path we have not enumerated, and silence would be the same
 * failure this module exists to remove. An array — a repeated parameter — is
 * treated as absent rather than resolved by guessing which one was meant.
 */
export function authErrorMessage(
  raw: string | string[] | undefined,
): string | null {
  if (typeof raw !== 'string' || raw === '') return null
  return MESSAGES[raw as AuthErrorCode] ?? MESSAGES.failed
}
```

- [ ] **Step 4: Прогнать и убедиться, что проходит**

Run: `npx vitest run src/lib/auth-errors.test.ts`
Expected: PASS — 4 теста.

- [ ] **Step 5: Переписать `src/app/auth/callback/route.ts` целиком**

```ts
import { redirect } from 'next/navigation'
import { authErrorMessage, type AuthErrorCode } from '@/lib/auth-errors'
import { logError } from '@/lib/log'
import { createClient } from '@/utils/supabase/server'

/**
 * Which of our codes a Supabase refusal amounts to.
 *
 * The provider's own vocabulary is longer than ours and not ours to stabilise,
 * so anything unmapped becomes `failed` — a sentence we can stand behind —
 * rather than being passed through.
 */
function classify(error: string, code: string | null): AuthErrorCode {
  if (error === 'access_denied') return 'denied'
  if (code === 'otp_expired' || error === 'expired_token') return 'expired'
  return 'failed'
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  // Supabase reports a refused or expired sign-in by sending the person back
  // here with these parameters. Reading `code` alone meant every one of those
  // ended up at /dashboard, which bounced them to /login with nothing said.
  if (error) {
    const outcome = classify(error, url.searchParams.get('error_code'))
    // `error_description` is the provider's sentence, and it is the only part
    // of this worth keeping — it is what tells the difference between a
    // cancelled consent screen and a misconfigured provider. It goes to the
    // log, not to the page.
    logError('auth.callback.refused', new Error(error), {
      outcome,
      description: url.searchParams.get('error_description'),
    })
    redirect(`/?error=${outcome}`)
  }

  if (!code) {
    // Arriving with neither a code nor a refusal means the flow did not
    // complete. Nothing to diagnose, but the person still needs telling.
    redirect('/?error=failed')
  }

  const supabase = await createClient()
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
    code,
  )

  // The old version discarded this. An exchange fails on an expired link, a
  // replayed code, or a PKCE verifier that did not survive the round trip —
  // and every one of those looked exactly like success from here.
  if (exchangeError) {
    logError('auth.callback.exchange', exchangeError)
    redirect('/?error=failed')
  }

  redirect('/dashboard')
}
```

- [ ] **Step 6: Проверить, что типы и линтер чисты**

Run: `npx tsc --noEmit && npx eslint`
Expected: `tsc` без вывода; eslint — `0 errors` и по-прежнему **четыре** предупреждения. Ни одно из них не в этом файле: старый `callback` не деструктурировал результат вовсе, поэтому неиспользуемой переменной там и не было. `'error' is assigned a value but never used` из `auth/signin/route.ts` уйдёт в Задаче 2 — тогда предупреждений станет три.

Импортировать из `@/lib/auth-errors` только тип `AuthErrorCode`: текст показывает страница, а не маршрут, и `authErrorMessage` здесь не нужен.

- [ ] **Step 7: Написать E2E, доказывающий, что отказ доходит до человека**

Создать `e2e/auth-failure.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

/*
 * Every one of these used to end at /login with nothing said, because the
 * callback read `code` and ignored everything else.
 *
 * The alert is looked up inside `main`, never on the page. Next announces every
 * route change into its own `role="alert"` live region, so an unscoped locator
 * matches that instead: it made the third test here pass while the landing
 * still showed nothing, and it would turn the others into strict-mode
 * failures the moment a real alert appeared beside it.
 */
const alertIn = (page: import('@playwright/test').Page) =>
  page.getByRole('main').getByRole('alert')

test('a refused sign-in says so instead of ending at a blank form', async ({
  page,
}) => {
  await page.goto(
    '/auth/callback?error=access_denied&error_description=User+denied',
  )

  await expect(page).toHaveURL('/?error=denied')
  await expect(alertIn(page)).toHaveText('Sign-in was cancelled.')
})

test('an expired confirmation link says it expired', async ({ page }) => {
  await page.goto('/auth/callback?error=invalid_request&error_code=otp_expired')

  await expect(alertIn(page)).toHaveText(
    'That link has expired. Request a new one.',
  )
})

test('arriving at the callback with nothing still reports a failure', async ({
  page,
}) => {
  await page.goto('/auth/callback')

  await expect(page).toHaveURL('/?error=failed')
  await expect(alertIn(page)).toBeVisible()
})

// The parameter is written by whoever sent the link.
test('the landing does not print what the URL asked it to', async ({ page }) => {
  await page.goto('/?error=Your+account+is+suspended,+call+555-0100')

  const alert = alertIn(page)
  await expect(alert).toHaveText(
    'Sign-in could not be completed. Please try again.',
  )
  await expect(alert).not.toContainText('555-0100')
})
```

**Локатор обязан быть внутри `main`, и это не стилистика.** Первая версия этого набора искала `page.getByRole('alert')` и поймала живую область Next `__next-route-announcer__`: третий тест позеленел при лендинге, который ничего не показывал, — тест вхолостую того же класса, что описан в [debt.md](../../debt.md) A1. Та же ловушка уже задокументирована в `e2e/streak.spec.ts:31`.

- [ ] **Step 8: Прогнать E2E и убедиться, что падает**

Run: `npm run test:e2e -- e2e/auth-failure.spec.ts`
Expected: FAIL — `getByRole('alert')` не найден: лендинг ещё не читает `?error=`. Первые три теста могут дойти до проверки URL и упасть на алерте; это ожидаемо и означает, что маршрут уже работает, а страница ещё нет.

- [ ] **Step 9: Коммит**

```bash
git add src/lib/auth-errors.ts src/lib/auth-errors.test.ts \
  src/app/auth/callback/route.ts e2e/auth-failure.spec.ts
git commit -F - <<'EOF'
fix: /auth/callback перестал проглатывать отказы Supabase

Маршрут читал только code. Результат exchangeCodeForSession отбрасывался, а
параметры error и error_description не читались вовсе — то есть просроченная
ссылка подтверждения, отменённое согласие у провайдера и несовпадение PKCE
выглядели отсюда неотличимо от успеха. Все три заканчивались редиректом на
/dashboard, откуда requireSessionUser уводил на /login: человек оказывался у
формы входа без единого слова о том, что случилось.

Теперь у каждого исхода есть код, а у кода — предложение. Текст лежит в
репозитории, а не берётся из query-параметра: параметр пишет тот, кто
составил ссылку, и эхо превратило бы /?error=<что угодно> в способ напечатать
произвольные слова на нашей странице над нашими же кнопками входа.
Нераспознанное значение получает общее предложение, потому что молчание — это
ровно тот дефект, который здесь убирается.

Сообщение провайдера из error_description уходит в лог, а не на страницу:
именно оно отличает отменённое согласие от ненастроенного провайдера.

E2E на все четыре случая, включая попытку напечатать чужой текст.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

Тесты из Задачи 1 остаются красными до конца Задачи 2 — это единственная пара задач в плане с таким переходом, и она сознательная: маршрут и страница правятся по отдельности, потому что ревьюер должен видеть их порознь.

---

### Task 2: лендинг показывает то, что ему передали, а `/auth/signin` — говорит в лог

`src/app/auth/signin/route.ts` уже составляет `redirect('/?error=Could not authenticate')`, но `Home()` не принимает `searchParams` и никогда не читает `error`: сообщение складывается в URL и выбрасывается. Там же `error` из `signInWithOAuth` деструктурируется и не используется — это одно из четырёх предупреждений линтера, и оно стоит ровно на пути отказа.

**Files:**
- Modify: `src/app/page.tsx:55` (сигнатура `Home`) и разметка внутри первой `Panel`
- Modify: `src/app/auth/signin/route.ts` (весь файл, сейчас 25 строк)
- Test: `e2e/auth-failure.spec.ts` (создан в Задаче 1, здесь становится зелёным)

**Interfaces:**
- Consumes: `authErrorMessage(raw: string | string[] | undefined): string | null` из `@/lib/auth-errors`; `logError` из `@/lib/log`.
- Produces: ничего для последующих задач.

- [ ] **Step 1: Убедиться, что тесты Задачи 1 всё ещё красные**

Run: `npm run test:e2e -- e2e/auth-failure.spec.ts`
Expected: FAIL на `getByRole('alert')`. Это исходная точка; если они зелёные — значит Задача 1 не в том состоянии, в котором должна быть.

- [ ] **Step 2: Научить лендинг принимать `searchParams` и показывать сообщение**

В `src/app/page.tsx` заменить сигнатуру:

```tsx
export default async function Home() {
```

на

```tsx
export default async function Home({
  searchParams,
}: {
  // Next 16: searchParams is a Promise. See docs/architecture.md §8.
  searchParams: Promise<{ error?: string | string[] }>
}) {
```

Сразу после `const theme = await readThemeCookie()` добавить:

```tsx
  // `/auth/signin` and `/auth/callback` both send refusals here, because this
  // is where all three sign-in buttons are. The message comes from our own
  // table, never from the parameter — see `authErrorMessage`.
  const authError = authErrorMessage((await searchParams).error)
```

Добавить импорт рядом с остальными из `@/lib`:

```tsx
import { authErrorMessage } from '@/lib/auth-errors'
```

Внутри первой `Panel`, сразу после `<p className="font-mono text-sm text-ink-muted">…</p>` и **до** `<div className="flex w-full flex-col gap-3">`, вставить:

```tsx
        {authError ? (
          <p role="alert" className="font-mono text-xs text-streak">
            {authError}
          </p>
        ) : null}
```

`role="alert"` и класс — те же, что у формы входа (`src/app/login/login-form.tsx:115`): один и тот же вид отказа должен выглядеть одинаково на обеих поверхностях.

- [ ] **Step 3: Переписать `src/app/auth/signin/route.ts` целиком**

```ts
import { redirect } from 'next/navigation';
import { type Provider } from '@supabase/supabase-js';
import { logError } from '@/lib/log';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
  const formData = await request.formData();
  const provider = formData.get('provider') as Provider;

  if (!provider) {
    // Nothing was chosen: the form was submitted without its hidden field.
    redirect('/?error=failed');
  }

  const supabase = await createClient();
  const url = new URL(request.url);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${url.origin}/auth/callback`,
    },
  });

  if (data.url) {
    redirect(data.url);
  }

  // This used to be discarded, and the fall-through below composed a sentence
  // that no page ever read. The provider name is safe to record — it is a
  // fixed set chosen by our own markup, not user input.
  logError('auth.signin.start', error ?? new Error('no authorize url returned'), {
    provider,
  });
  redirect('/?error=failed');
}
```

Замечание, которое стоит знать исполнителю: **отключённый провайдер сюда не попадает.** Supabase возвращает исправный `data.url`, а отказывает уже собственный эндпоинт `authorize`, в браузере, кодом 400. Приложение в этом случае сделало всё правильно, и починить это кодом нельзя — только включить провайдеров. Этот маршрут теперь ловит другое: сбой самого вызова и ответ без URL.

- [ ] **Step 4: Прогнать E2E и убедиться, что тесты Задачи 1 позеленели**

Run: `npm run test:e2e -- e2e/auth-failure.spec.ts`
Expected: PASS — 4 теста.

- [ ] **Step 5: Прогнать всё, включая a11y — на лендинге появился новый элемент**

Run: `npx tsc --noEmit && npx eslint && npm test && npm run build && npm run test:e2e`
Expected: `tsc` чист; eslint `0 errors` и **три** предупреждения вместо четырёх; юнитов 109 и больше; сборка проходит; E2E 40 и больше, включая `e2e/a11y.spec.ts` — контраст `text-streak` на фоне панели уже проверен этим набором для формы входа, но лендинг он проверяет отдельно.

- [ ] **Step 6: Коммит**

```bash
git add src/app/page.tsx src/app/auth/signin/route.ts
git commit -F - <<'EOF'
fix: сообщение об отказе входа перестало выбрасываться в URL

/auth/signin составлял redirect('/?error=Could not authenticate'), а Home() не
принимал searchParams и никогда не читал error. Сообщение аккуратно
складывалось в адрес и выбрасывалось — отказ выглядел как возврат на лендинг
без причины.

Лендинг выбран поверхностью для всех отказов входа: там стоят все три кнопки,
и туда же теперь ведёт /auth/callback. Вид сообщения тот же, что у формы
входа, — один и тот же отказ не должен выглядеть по-разному.

Заодно перестал отбрасываться error из signInWithOAuth: это было одно из
четырёх предупреждений линтера, и стояло оно ровно на пути отказа. Теперь сбой
вызова пишется в лог с именем провайдера — оно из фиксированного набора в нашей
же разметке, не пользовательский ввод.

Что этим не починить и починить нельзя: отключённый провайдер сюда не
доходит. Supabase отдаёт исправный authorize URL, а отказывает уже свой
эндпоинт, в браузере, кодом 400. Нужны включённые провайдеры — см. план,
owner-действие №1.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: `product-spec.md` перестаёт быть нормативным документом, которому код не соответствует

Спека объявляет себя нормативной: «код обязан соответствовать описанному здесь поведению, а не наоборот». Значит каждое расхождение — либо дефект кода, либо устаревшая спека, и решать надо явно. Здесь четыре расхождения, и все четыре — устаревшая спека.

**Files:**
- Modify: `docs/product-spec.md` §3.3, §5, §6, §7

**Interfaces:**
- Consumes: ничего.
- Produces: ничего.

- [ ] **Step 1: Проверить своими глазами оба факта про статус и список имён**

```bash
curl -s -o /dev/null -w "unknown profile: %{http_code}\n" https://www.never-give.app/nosuchuser000
sed -n '16,31p' src/lib/validation.ts
```
Expected: `200`, и список из 14 значений, начинающийся с `_next`.

- [ ] **Step 2: §3.3 — сказать правду про статус**

Заменить пункт 3 в §3.3:

```markdown
3. Если пользователя нет, или обещание помечено `private` — 404.
```

на:

```markdown
3. Если пользователя нет, или обещание помечено `private` — страница «не
   найдено». **Статус ответа при этом 200, а не 404**, и это осознанно: в
   Next 16 динамические маршруты отдаются потоком, поэтому статус уходит раньше,
   чем серверный компонент успевает передумать. Фреймворк компенсирует это тегом
   `<meta name="robots" content="noindex">`. Проверено: удаление `loading.tsx`
   статус не меняет. Разбор и условие, при котором решение изменится —
   [debt.md](./debt.md) C2.
```

- [ ] **Step 3: §5 — `private` больше не зарезервирован**

Заменить строку таблицы:

```markdown
| `private` | 404 для всех, кроме владельца на его дашборде | **Не предлагается в MVP** |
```

на:

```markdown
| `private` | «Не найдено» для всех, кроме владельца на его дашборде | Предлагается в `/settings` |
```

и заменить абзац под таблицей:

```markdown
`private` обрабатывается кодом и политиками БД, но в онбординге не выбирается —
поле зарезервировано под будущий экран настроек.
```

на:

```markdown
`private` не выбирается в онбординге, но выбирается на экране настроек, который
с тех пор появился ([debt.md](./debt.md) A2, A3). Проверено обходом: после
выбора `private` публичная страница перестаёт отдавать обещание.
```

- [ ] **Step 4: §6 — добавить `_next` и объяснить, почему он там**

В список зарезервированных значений добавить `_next` первым и дописать абзац:

```markdown
- Зарезервированные значения запрещены: `_next`, `admin`, `api`, `auth`,
  `dashboard`, `login`, `onboarding`, `settings`, `about`, `help`, `support`,
  `null`, `undefined`, `www`
```

После существующего абзаца про корневой сегмент добавить:

```markdown
`_next` — не косметика: он проходил валидацию, и профиль мог занять путь, по
которому фреймворк отдаёт свои ассеты. Тест утверждает, что список покрывает все
существующие сегменты `src/app/`, поэтому новый роут не может появиться, не
попав в список.
```

- [ ] **Step 5: §7 — чек-лист готовности отражает состояние**

Заменить весь §7 на:

```markdown
## 7. Что считается готовым MVP

- [x] Онбординг показывает внятную ошибку на занятом username — и сообщает о
      занятости **при наборе**, не дожидаясь отправки
- [x] Чек-ин работает и не дублируется
- [x] Стрик считается по таймзоне пользователя, а не по UTC
- [x] Заморозка автоматически закрывает пропущенный день
- [x] Публичный профиль открывается и отдаёт OG-картинку фирменным шрифтом
- [x] RLS включена, чужие данные недоступны на уровне БД
- [x] Миграции лежат в репозитории, схема воспроизводима на чистой БД
- [x] `npm test`, `npm run test:db` и `npm run test:e2e` зелёные,
      `npm run build` проходит
- [ ] **Пользователь регистрируется любым из трёх способов и доходит до
      дашборда.** Работает один: email с паролем. Google и GitHub не включены в
      проекте Supabase — `authorize` отвечает `400 provider is not enabled`, и
      человек уходит на страницу с JSON вне приложения. Код входа при этом
      исправен, нужны включённые провайдеры
- [ ] ~~`private` профиль отдаёт 404~~ — отдаёт 200 со страницей «не найдено».
      Пункт снят как требование: см. §3.3 и [debt.md](./debt.md) C2

Восемь из десяти выполнены. Из двух оставшихся один требует панели Supabase, а
второй перестал быть требованием.
```

- [ ] **Step 6: Убедиться, что ссылки внутри документа не сломаны**

```bash
grep -n 'debt.md' docs/product-spec.md
ls docs/debt.md
```
Expected: три ссылки на `./debt.md`, файл существует.

- [ ] **Step 7: Коммит**

```bash
git add docs/product-spec.md
git commit -m "$(cat <<'EOF'
docs: спека перестала требовать того, чего код не делает

Документ объявляет себя нормативным, значит расхождение — это либо дефект
кода, либо устаревшая спека, и выбирать надо явно. Здесь все четыре
расхождения — устаревшая спека.

§3.3 требовала 404 на несуществующем и приватном профиле. Проверено на проде:
200. Это следствие потоковой отдачи Next 16, уже записанное как осознанное
решение, — поэтому требование снято, а не объявлено дефектом.

§5 называла private зарезервированным под будущий экран настроек. Экран
появился, private в нём выбирается.

§6 перечисляла тринадцать зарезервированных имён из четырнадцати. Не хватало
_next — того самого, из-за которого профиль мог занять путь ассетов
фреймворка.

§7 держал десять пунктов готовности неотмеченными, тогда как восемь выполнены.
Отмечены восемь; из двух оставшихся названо, что именно мешает: OAuth-провайдеры
не включены в Supabase, а требование 404 снято.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `data-model.md` описывает схему, которой уже нет

Пять расхождений, из них одно — длина колонки, то есть то, на что опирается валидация.

**Files:**
- Modify: `docs/data-model.md` — «Соглашения», таблицы `users`/`promises`/`checkins`/`streak_freezes`, «Сводка политик», «Что осознанно не сделано»

**Interfaces:**
- Consumes: ничего.
- Produces: ничего.

- [ ] **Step 1: Собрать факты из схемы и миграций одной командой**

```bash
grep -n "title: varchar\|withTimezone" src/db/schema.ts | head
grep -rn "grant update" drizzle/0006_account_settings.sql
grep -n "create schema\|create table" drizzle/0007_rate_limits.sql
ls drizzle/*.sql
```
Expected: `title` длиной 80; `withTimezone: true` у временных колонок; сужение гранта UPDATE на `promises`; схема `private` и таблица счётчика; восемь файлов миграций.

- [ ] **Step 2: «Соглашения» — временные метки с зоной**

Заменить строку:

```markdown
- Временные метки — `timestamp` с `defaultNow()`
```

на:

```markdown
- Временные метки — `timestamptz` (`timestamp with time zone`) с `defaultNow()`.
  Изначально были без зоны; миграция 0004 это исправила — «полночь» без зоны
  означает разную точку времени в зависимости от того, кто её читает
```

- [ ] **Step 3: Поправить источники истины в шапке**

Заменить:

```markdown
- **политики RLS и гранты** — `drizzle/0001_rls_policies.sql`, написана вручную
```

на:

```markdown
- **политики RLS и гранты** — рукописные миграции, а не Drizzle. Начало в
  `drizzle/0001_rls_policies.sql`, дальше правят: 0002 (сужение), 0003 (гранты
  на колонки при INSERT), 0006 (удаление аккаунта, сужение UPDATE на
  `promises`), 0007 (схема `private`: счётчик частоты и `delete_own_account`)
```

- [ ] **Step 4: `promises.title` — 80, а не 255**

В таблице `promises` заменить строку:

```markdown
| `title` | `varchar(255)` | живое | Текст обещания |
```

на:

```markdown
| `title` | `varchar(80)` | живое | Текст обещания. 80 — это то, что помещается на экране 320px в пиксельном шрифте; `PROMISE_MAX_LENGTH` в `src/lib/validation.ts` держит ту же цифру |
```

- [ ] **Step 5: Временные колонки — их шесть, в пяти таблицах**

Заменить тип `timestamp` на `timestamptz` во всех шести строках: `users.created_at`, `promises.created_at`, `promises.updated_at`, `checkins.created_at`, `streak_freezes.created_at`, `followers.created_at`. Проверить число до правки: `grep -c '| \`timestamp\` |' docs/data-model.md` должен дать 6.

В таблице `promises` дописать в описание `updated_at`:

```markdown
| `updated_at` | `timestamptz` | живое | Ставится триггером, а не кодом приложения (миграция 0005). До неё колонка заполнялась один раз при вставке и больше не менялась |
```

- [ ] **Step 6: `avatar_level` — подписи больше нет**

Заменить строку в таблице `users`:

```markdown
| `avatar_level` | `integer` | частично | Отображается на дашборде и в профиле, но **никогда не растёт**. Прокачка зарезервирована |
```

на:

```markdown
| `avatar_level` | `integer` | зарезервировано | Не читается интерфейсом: подпись `Lvl` убрана, стадия аватара выводится из длины стрика (known-issues 1.14). Значение всегда `1` |
```

- [ ] **Step 7: «Сводка политик» — DELETE и сужённый UPDATE**

Заменить строку таблицы:

```markdown
| `promises` | `authenticated` | UPDATE | `USING` и `WITH CHECK`: `(select auth.uid()) = user_id` |
```

на:

```markdown
| `promises` | `authenticated` | UPDATE | `USING` и `WITH CHECK`: `(select auth.uid()) = user_id`. Грант сужен до колонок `(title, visibility)` миграцией 0006 — до появления экрана настроек грант на всю таблицу никто не использовал, поэтому его ширину никто и не замечал |
```

Заменить строку под таблицей:

```markdown
`DELETE` не разрешён нигде: MVP не удаляет данные.
```

на:

```markdown
`DELETE` не выдан ни одной роли ни на одной таблице — и всё же удаление данных
существует. Аккаунт удаляется функцией `private.delete_own_account()`
(`security definer`, без параметров: цель берётся из проверенного JWT, а не из
аргумента), которая удаляет строку в `auth.users`. Оттуда каскад идёт вниз по
всему графу.

Удалять нужно именно `auth.users`, а не `public.users`: иначе логин остаётся, и
адрес застревает в состоянии, из которого нельзя ни войти, ни зарегистрироваться
заново. Ни одна роль приложения до `auth.users` не достаёт и не должна — отсюда
`security definer`. Функция живёт в схеме `private`, потому что PostgREST
публикует `public` наружу, и функция оттуда была бы ещё и HTTP-эндпоинтом.
```

- [ ] **Step 8: Дописать раздел про схему `private`**

Перед разделом «Что осознанно не сделано» добавить:

```markdown
## Схема `private`

Не публикуется PostgREST, в отличие от `public`. Это и есть причина её
существования: функция в `public` — это ещё и HTTP-эндпоинт для любого, у кого
есть анонимный ключ, а он лежит в браузере.

| Объект | Что это |
|---|---|
| `private.rate_limits` | Счётчик частоты: корзина, окно, количество. Под вход, регистрацию, онбординг и живую проверку username |
| `private.check_rate_limit(...)` | Инкремент и решение в одном вызове. Чтение-затем-запись пропустило бы больше запросов, чем позволяет лимит |
| `private.delete_own_account()` | Удаление своего аккаунта, см. выше |

Для ограничителя публикация была бы смертельна: вызывающий сам называл бы
корзину, которую тратит. Подробности и замеры — [debt.md](./debt.md) A4.
```

- [ ] **Step 9: Проверить, что в документе не осталось `varchar(255)` для `title` и `timestamp` без зоны**

```bash
grep -n 'varchar(255)' docs/data-model.md
grep -c '| `timestamp` |' docs/data-model.md
```
Expected: `varchar(255)` остаётся ровно на трёх строках — `users.email`, `users.username`, `users.timezone` (все три в схеме действительно 255); строки `title` среди них больше нет. Счётчик `| \`timestamp\` |` равен нулю.

- [ ] **Step 10: Коммит**

```bash
git add docs/data-model.md
git commit -m "$(cat <<'EOF'
docs: модель данных описывала схему, которой уже нет

Пять расхождений, и одно из них — не косметика.

promises.title значился varchar(255), в схеме 80. Цифра не произвольная: это
то, что помещается на 320px в пиксельном шрифте, и та же цифра лежит в
валидации. Документ, обещающий втрое больше, — приглашение написать проверку
не под то ограничение.

Временные метки давно timestamptz (0004), а «Соглашения» и все четыре таблицы
говорили timestamp. updated_at ставится триггером (0005), а не кодом.

«DELETE не разрешён нигде: MVP не удаляет данные» — грантов действительно нет,
но удаление аккаунта появилось и работает через security definer в схеме
private. Записано вместе с причиной, по которой удалять надо auth.users, а не
public.users.

Грант UPDATE на promises сужен до (title, visibility) в 0006 — в сводке
политик этого не было. Источником политик значилась одна миграция из пяти,
которые их меняют. Схема private не была описана вовсе.

avatar_level значился отображаемым в интерфейсе; подпись Lvl убрана давно.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `architecture.md` — разорванная таблица, устаревшая карта и противоречие про политики

Здесь есть дефект вёрстки, который делает часть документа нечитаемой: абзац вставлен между строками таблицы в §9, и три последние переменные окружения перестали быть строками таблицы.

**Files:**
- Modify: `docs/architecture.md` §2, §3, §9
- Modify: `src/utils/supabase/report.ts:14-15` (комментарий, утверждающий неверное про рантайм)

**Interfaces:**
- Consumes: ничего.
- Produces: ничего.

- [ ] **Step 1: Увидеть разрыв таблицы своими глазами**

```bash
sed -n '204,222p' docs/architecture.md
```
Expected: после строки `| NEXT_PUBLIC_SUPABASE_ANON_KEY | … |` идёт абзац текста, и только после него — ещё три строки с `|`. В Markdown это уже не таблица.

- [ ] **Step 2: Починить §9 — сначала вся таблица, потом весь текст**

Заменить блок от строки `| NEXT_PUBLIC_SUPABASE_URL |` до строки `| SUPABASE_SERVICE_ROLE_KEY | ... |` включительно (вместе с врезавшимися между ними абзацами) на:

```markdown
| Переменная | Где нужна | Описание |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | клиент, сервер | URL проекта Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | клиент, сервер | Публикуемый ключ. Предпочтителен |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | клиент, сервер | Legacy-ключ. Годится, если первого нет |
| `DATABASE_URL` | сервер | Строка подключения Postgres через pooler, режим Transaction, порт 6543 |
| `POSTGRES_URL` | сервер | То же. Под этим именем строку кладёт интеграция Supabase; принимается, `DATABASE_URL` предпочтительнее |
| `NEXT_PUBLIC_SITE_URL` | сервер | Базовый URL для писем подтверждения и OG. **Необязательна на Vercel** |
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
```

Оба существующих абзаца-разбора (про `PUBLISHABLE_KEY` и про `NEXT_PUBLIC_SITE_URL`) сохранить **после** таблицы, ничего в них не меняя, — они верны и объясняют цену обеих ошибок.

- [ ] **Step 3: §2 — дописать три роута**

В блок карты роутов добавить строки:

```
/settings                Экран настроек: обещание, видимость, таймзона, удаление
/<username>              Публичный профиль. Динамический сегмент в корне
/<username>/opengraph-image  OG-картинка профиля, 1200×630 PNG
/robots.txt              Единственный статический маршрут в проекте
```

- [ ] **Step 4: §3 — дерево исходников и снятие противоречия про политики**

Заменить строку:

```
    schema.ts               Таблицы, индексы, политики
```

на:

```
    schema.ts               Таблицы, индексы, ограничения. Политик здесь нет —
                            они в рукописных миграциях, см. data-model.md
```

Дописать в дерево отсутствующие файлы:

```
  app/
    settings/               page.tsx + actions.ts + promise-form.tsx +
                            timezone-form.tsx + delete-account.tsx (client)
    robots.ts               robots.txt. Sitemap намеренно не объявлен
    [username]/opengraph-image.tsx   OG-картинка
  components/
    layout/, share/, streak/, ui/   Презентационные компоненты
  lib/
    log.ts                  Структурный логгер, по строке JSON на событие
    rate-limit.ts           Обёртка над private.check_rate_limit
    site-url.ts             Собственный адрес приложения и его источник
    theme.ts                Чтение cookie темы
    auth-errors.ts          Код отказа входа → предложение для человека
    view/chain.ts           Окно цепочки и состояния клеток
  utils/supabase/
    credentials.ts          Адрес и ключ проекта, и заданы ли они вообще
    report.ts               Однократная запись о ненастроенности
```

- [ ] **Step 5: Поправить неверное утверждение про рантайм в комментарии**

В `src/utils/supabase/report.ts` заменить:

```
 * Measured, not assumed: thirty requests produce **two** lines, not one. The
 * middleware runs in the edge runtime and the server client in Node, so each
 * holds its own copy of this module. Two is the ceiling, and two is fine.
```

на:

```
 * Measured, not assumed: thirty requests produce **two** lines, not one. The
 * proxy and the server client are bundled separately, so each holds its own
 * copy of this module and its own `reported` flag. Two is the ceiling, and two
 * is fine.
 *
 * Not two runtimes: `src/proxy.ts` declares none, and Proxy in Next 16 runs on
 * Node — see docs/architecture.md §7. Separate bundles, one runtime.
```

- [ ] **Step 6: Проверить, что таблица §9 снова таблица, а типы не сломаны**

```bash
awk '/^## 9\./,/^## 10\./' docs/architecture.md | grep -c '^|'
npx tsc --noEmit
```
Expected: количество строк, начинающихся с `|`, равно 9 (шапка, разделитель и семь переменных) и все они идут подряд; `tsc` без вывода.

- [ ] **Step 7: Коммит**

```bash
git add docs/architecture.md src/utils/supabase/report.ts
git commit -m "$(cat <<'EOF'
docs: в §9 архитектуры абзац стоял внутри таблицы

Из-за этого три последние переменные окружения — DATABASE_URL,
NEXT_PUBLIC_SITE_URL и SUPABASE_SERVICE_ROLE_KEY — перестали быть строками
таблицы и не отрисовывались как таблица вообще. Таблица собрана целиком,
разборы перенесены под неё. Заодно в ней появились POSTGRES_URL и
VERCEL_PROJECT_PRODUCTION_URL, которые код принимает, а список не называл, и
пропал SUPABASE_SERVICE_ROLE_KEY — вместе с объяснением, почему его там нет.

Карта роутов не знала про /settings, opengraph-image и robots.txt. Дерево
исходников не знало про components/, settings/ и семь модулей в lib/ и
utils/supabase/.

Снято противоречие с data-model: здесь значилось, что политики лежат в
schema.ts, там — что в рукописных миграциях. Верно второе.

И одно неверное утверждение в комментарии кода: report.ts объяснял две строки
в логе двумя рантаймами. Рантайм один — proxy.ts не объявляет никакого, а
Proxy в Next 16 работает на Node. Причина в раздельных бандлах.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: README противоречит handover в том, что нужно для тестов

README требует `SUPABASE_SERVICE_ROLE_KEY` для E2E. `handover.md` §1 и `debt.md` B1 говорят, что ключ не нужен и в `.env.local` ему делать нечего, а `e2e/fixtures.ts` заводит аккаунт через `DATABASE_URL`. README — первый файл, который читает новый человек, и он отправляет его добывать ключ, который проекту не нужен.

**Files:**
- Modify: `README.md` — §Документация, §Тесты, §Скрипты, §4 «Провайдеры входа»

**Interfaces:**
- Consumes: ничего.
- Produces: ничего.

- [ ] **Step 1: Убедиться, что ключ действительно не нужен**

```bash
grep -rn 'SERVICE_ROLE' e2e/ src/ | grep -v '\.md'
sed -n '1,30p' e2e/fixtures.ts
```
Expected: в `e2e/` и `src/` ни одного обращения к `SUPABASE_SERVICE_ROLE_KEY`; фикстура читает `process.env.DATABASE_URL`.

- [ ] **Step 2: §Тесты — убрать требование ключа и добавить набор БД**

Заменить весь текст от `**E2E** покрывают сквозные сценарии` до конца раздела на:

```markdown
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

Оба набора пишут в ту же базу, на которую указывает `DATABASE_URL`. Если это
продовая база — а сейчас это она, — то прогон тестов есть операция над
продовыми данными. Удаления в наборах привязаны к своему `id` или к домену
`@never-give.test`; `npm run db:prune-test-users` сметает то, что осталось от
прерванного прогона (по умолчанию только показывает, удаляет с `--delete`).
```

- [ ] **Step 3: §Скрипты — дописать две команды**

Добавить в таблицу скриптов:

```markdown
| `npm run test:db` | Тесты против настоящей базы (Vitest, отдельный конфиг) |
| `npm run db:prune-test-users` | Сметает аккаунты от прерванного прогона E2E |
```

- [ ] **Step 4: §Документация — дописать два документа**

Добавить в таблицу:

```markdown
| [docs/debt.md](docs/debt.md) | Реестр долга: что закрыто, что заблокировано, что решено не чинить |
| [docs/handover.md](docs/handover.md) | Что осталось сделать руками |
```

- [ ] **Step 5: §4 — сказать, что будет, если провайдеров не включить**

Дописать после существующих двух пунктов:

```markdown
Если провайдеров не включить, кнопки «Sign in with Google» и «Sign in with
GitHub» на лендинге уводят на страницу Supabase с ответом
`400 provider is not enabled` — вне приложения. Код входа при этом исправен:
отказ приходит от эндпоинта Supabase, а не от нас. Вход по email работает
независимо от этого.
```

- [ ] **Step 6: Проверить, что README больше не отправляет за ключом**

```bash
grep -n 'SERVICE_ROLE' README.md
```
Expected: одно упоминание — в §Тесты, в предложении о том, что ключ **не** нужен.

- [ ] **Step 7: Коммит**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: README отправлял за ключом, который проекту не нужен

Раздел про тесты требовал SUPABASE_SERVICE_ROLE_KEY в .env.test.local. Это
прямо противоречило handover §1 и debt.md B1: ключ не нужен, аккаунт заводится
через DATABASE_URL, и в .env.local ему делать нечего, потому что всё, что
читает серверный рантайм приложения, не должно уметь обходить RLS. README —
первый файл, который читает новый человек, и он посылал его добывать самый
опасный ключ проекта.

Заодно названо то, о чём README молчал: набор test:db существует, оба набора
пишут в базу из DATABASE_URL, и если это продовая база, прогон тестов есть
операция над продовыми данными.

В таблице документов не хватало debt.md и handover.md — двух файлов, в которых
и лежит текущее состояние работ.

В разделе про провайдеров входа сказано, что видит человек, если их не
включить: страницу Supabase с 400 вне приложения.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: висящая ссылка на Sentry и исторические документы

`debt.md` A5 говорит «Sentry требует DSN и аккаунт, это раздел B», `known-issues.md` 2.6 говорит «см. debt.md B». В разделе B нет строки про Sentry: B1–B8 о другом. Единственный незакрытый пункт мониторинга не значится ни в одном списке — ссылка ведёт в пустоту.

**Files:**
- Modify: `docs/debt.md` — таблица раздела B
- Modify: `docs/known-issues.md` — 2.6, шапка
- Modify: `docs/pr-description.md` — шапка

**Interfaces:**
- Consumes: ничего.
- Produces: ничего.

- [ ] **Step 1: Убедиться, что строки про Sentry в разделе B действительно нет**

```bash
awk '/^## B\./,/^## C\./' docs/debt.md | grep -in 'sentry'
```
Expected: пусто.

- [ ] **Step 2: Добавить в таблицу B строку про Sentry**

После строки `| B8 | …` добавить:

```markdown
| B9 | Внешний мониторинг ошибок не подключён | DSN Sentry. Логгер уже пишет структурно — подключение сводится к замене функции `emit` в `src/lib/log.ts` |
```

И дописать в раздел «Что в B ещё осталось, и почему именно это»:

```markdown
**Sentry.** До этой правки пункт существовал только в виде ссылки: `A5` и
known-issues 2.6 отправляли за ним «в раздел B», где его не было. Теперь он
B9.

Незаблокированная половина уже сделана и это стоит помнить при подключении:
часть ошибок гасилась молча, и никакой внешний сервис не показал бы того, что
не было записано. Логгер даёт строку JSON на событие с разбором цепочки
`cause`. Sentry заменяет `emit` и больше ничего — если появится DSN, работа
измеряется одной функцией, а не проектом.
```

- [ ] **Step 3: Поправить 2.6 в known-issues**

Заменить в 2.6 фразу `Sentry требует DSN, которого нет, см. [debt.md](./debt.md) B` на `Sentry требует DSN, которого нет, см. [debt.md](./debt.md) B9`.

- [ ] **Step 4: Отметить known-issues и pr-description как исторические**

В шапку `docs/known-issues.md`, сразу после строки с датой ревизии, добавить:

```markdown
> **Это документ-история, а не текущее состояние.** Часть 1 закрыта целиком и
> сохранена потому, что объясняет, почему код устроен так, как устроен. Часть 2
> ведётся в [debt.md](./debt.md) — там же живёт всё, что появилось после
> 2026-08-06. Текущий остаток работ — в [handover.md](./handover.md) и в
> `docs/superpowers/plans/`.
```

В шапку `docs/pr-description.md` добавить первой строкой:

```markdown
> **Историческое.** Описание влитого PR #1 (`f4a6e81`) на момент 2026-08-08.
> Цифры в нём — тогдашние: юнитов было 76, сейчас больше. Не обновляется.
```

- [ ] **Step 5: Проверить, что ссылка больше не висит**

```bash
grep -rn 'debt.md) B9\|| B9 |' docs/
```
Expected: строка B9 в `debt.md` и ссылка на неё из `known-issues.md`.

- [ ] **Step 6: Коммит**

```bash
git add docs/debt.md docs/known-issues.md docs/pr-description.md
git commit -m "$(cat <<'EOF'
docs: единственный пункт мониторинга не значился ни в одном списке

debt.md A5 отправлял за Sentry «в раздел B», known-issues 2.6 — туда же. В
разделе B строки про Sentry не было: B1-B8 о другом. То есть единственная
незакрытая половина мониторинга существовала только в виде ссылки в пустоту.
Теперь это B9, с ценой работы: логгер уже пишет структурно, Sentry заменяет
функцию emit и больше ничего.

known-issues и pr-description помечены историческими. Первый описывает
дефекты, закрытые планом от 2026-08-06, и полезен тем, что объясняет форму
кода; второй — влитый PR с тогдашними цифрами. Оба читались как текущее
состояние, которого в них нет.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Не задачи: требует доступов, которых у исполнителя нет

Это остаток бэклога, который нельзя закрыть кодом. Порядок — по цене отказа.

1. **Включить Google и GitHub в Supabase** → Authentication → Providers, вписать client id и secret каждому. Сейчас `authorize` отвечает `400 provider is not enabled`, и две из трёх кнопок входа уводят человека на JSON вне приложения. Это единственный незакрытый пункт §7 product-spec, который остаётся требованием.
2. **Добавить `https://www.never-give.app/auth/callback`** в Authentication → URL Configuration → Redirect URLs. Домен, а не хост Vercel: `www.never-give.app` уже отвечает 200, apex редиректит на www. Без этого подтверждение почты уводит не туда даже при верном `emailRedirectTo`.
3. **Развернуть ветку `feature/mvp-completion`.** На проде старая сборка: цепочка растёт не в ту сторону, `og:image` ведёт на localhost, формы обещают адрес на `never-give.app`.
4. **Прогнать профиль через отладчики Facebook, X и Telegram** — после пункта 3, иначе они закэшируют старую карточку. Теги и картинка уже проверены, включая три краулерных User-Agent.
5. **DSN Sentry**, если мониторинг нужен (B9). Работа после получения — одна функция.
6. **Отдельный проект Supabase под тесты.** Сейчас `test:db` и `test:e2e` пишут в продовую базу. Это не дефект и не блокер, но единственная защита здесь — аккуратность запросов, а не изоляция.
7. **Завершить свой онбординг** или разобраться, почему он не завершился: в базе один аккаунт `auth.users` без профиля (handover §9).

## Не задачи: решено не чинить

Полные формулировки и условия, при которых решение изменится — `debt.md` C. Здесь только то, что план сознательно не трогает: CSP без nonce (C1); 200 вместо 404 на «не найдено» и на `/dashboard` без сессии (C2); публичный профиль до ленивого списания (C3); сдвиг истории при смене таймзоны (C4); одно обещание на пользователя (C5); зарезервированные поля схемы (C6); умеренные уязвимости в dev-зависимостях (C7).

---

## Self-Review

**Покрытие проверенного остатка.** Каждая строка таблицы «Что установлено проверкой» имеет адрес: Задача 1 (callback), Задача 2 (лендинг и signin), Задачи 3–7 (по документу), owner-действия 1–7. Единственный факт без задачи — отключённые провайдеры: закрыть его кодом нельзя, поэтому он owner-действие №1, и это сказано в трёх местах (Задача 2 Step 3, Задача 3 Step 5, Задача 6 Step 5).

**Заглушек нет.** Каждый шаг несёт либо готовый код, либо точный текст замены, либо команду с ожидаемым выводом. Ни одного «добавить обработку ошибок» без указания какой.

**Согласованность имён.** `authErrorMessage` и `AuthErrorCode` объявлены в Задаче 1 Step 3 и используются под теми же именами в Задаче 1 Step 7 и Задаче 2 Step 2. Коды `'denied' | 'expired' | 'failed'` — один и тот же набор в таблице `MESSAGES`, в `classify`, в редиректах обоих маршрутов и в E2E. `logError(event, error, fields)` вызывается ровно по сигнатуре из `src/lib/log.ts:86`.

**Одно намеренное отступление от TDD-цикла.** Тесты `e2e/auth-failure.spec.ts` пишутся в Задаче 1 и остаются красными до Задачи 2 Step 4. Разделение сознательное: маршрут и страница — разные поверхности, и ревьюер должен иметь возможность отклонить одну, приняв другую. Это отмечено в конце Задачи 1.
