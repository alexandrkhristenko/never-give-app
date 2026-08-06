# MVP Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Довести never-give.app до рабочего MVP: корректный расчёт стриков по таймзоне пользователя, механика заморозок, RLS на уровне БД, воспроизводимые миграции и тестовое покрытие.

**Architecture:** Вся бизнес-логика выносится в чистые модули (`src/lib/dates.ts`, `src/lib/streak.ts`) без обращений к БД и системным часам — их покрывают юнит-тесты. Весь доступ к данным централизуется в Data Access Layer (`src/lib/dal/*`), который ходит в БД только через RLS-обёртки `withUser` / `withAnon`, выставляющие транзакционно-локальную роль Postgres. Страницы становятся тонкими: получить DTO из DAL, отрисовать.

**Tech Stack:** Next.js 16.3 (App Router) · React 19.2 · TypeScript · Tailwind CSS 4 · NES.css · Supabase Auth (`@supabase/ssr`) · PostgreSQL · Drizzle ORM 0.45 + drizzle-kit 0.31 · Vitest · Playwright · Vercel

## Global Constraints

- **Next.js 16.3.** Перед написанием кода читать `node_modules/next/dist/docs/`. Версия ломающая, API отличается от обучающих данных.
- **`redirect()` и `notFound()` бросают управляющее исключение.** Никогда не вызывать их внутри `try`/`catch`.
- **`error.tsx` получает проп `retry`**, а не `reset`.
- **`params` — это `Promise`.** Обязателен `await`.
- **`ImageResponse` импортируется из `next/og`.** Пакет `@vercel/og` удаляется.
- **Cache Components выключены.** Для инвалидации после мутаций — `revalidatePath()`.
- **`db:push` запрещён.** Только `db:generate` + `db:migrate`. Политики RLS живут в custom-миграции и невидимы для снапшота drizzle-kit; `push` их снесёт.
- **RLS-политики:** роль указывается в `TO`, `auth.role()` не используется. `TO authenticated` всегда сопровождается предикатом владения. `UPDATE` требует и `USING`, и `WITH CHECK`. `auth.uid()` оборачивается в `(select auth.uid())`.
- **`users.id` всегда равен `auth.users.id`.** На этом держатся все политики.
- **Чистые модули** (`src/lib/dates.ts`, `src/lib/streak.ts`, `src/lib/view/*`) не импортируют ничего, кроме друг друга, и не читают текущее время. Время передаётся аргументом.
- **DAL-модули** начинаются с `import 'server-only'`.
- **Константы:** `FREEZE_EARN_INTERVAL = 7`, `MAX_FREEZE_BALANCE = 3`, `CHAIN_DAYS = 30`, `CHAIN_DAYS_COMPACT = 14`, `PROMISE_MAX_LENGTH = 80`.

### Ограничения фронтенда

Нормативный источник — [docs/superpowers/specs/2026-08-06-frontend-design.md](../specs/2026-08-06-frontend-design.md).

- **Классы `nes-*`** пишутся в `src/app/globals.css`, `src/app/nes-theme.css`, компонентах `src/components/` и на самих полях ввода, которые передаются в `Field` как children (`nes-input`, `nes-select`) — примитива для контрола нет. Контейнеры и кнопки за пределами `src/components/` берутся из `Panel`, `PixelButton` и `pixelButtonClass`: **`nes-container` и `nes-btn` в файлах роутов запрещены.**
- **Литеральные цвета запрещены.** Ни `#212529`, ни `text-red-500`, ни `text-gray-500`. Только токены из `@theme` (задача 9a).
- **Брейкпоинты — только `sm` (640) и `lg` (1024).** `md` не используется нигде: именно он оставлял непроверенным диапазон 375–767px.
- **Дашборд и публичный профиль — одна колонка `max-w-[42rem]` на всех ширинах.** Перестроений «несколько колонок → одна» нет.
- **`min-w-0`** на каждом grid/flex-потомке с текстом: моноширинный шрифт иначе распирает колонку изнутри.
- **Горизонтальной прокрутки у `body` нет ни на одной ширине.** Проверяется E2E-тестом в задаче 14.
- **Спрайт не масштабируется в потоке.** `transform: scale()` не меняет занимаемое место, поэтому соседние блоки о размере не знают. Масштабировать можно только внутри обёртки, чей размер задан явно и уже учитывает масштаб.
- **Кнопка с `disabled` вместо объяснения запрещена.** Если действие недоступно, рендерится не кнопка, а `<p role="status">` с причиной.
- **Всякая анимация выключается** под `@media (prefers-reduced-motion: reduce)`.
- **Язык кода** — английский: идентификаторы, комментарии, сообщения коммитов, строки UI.
- Нормативная семантика — [docs/product-spec.md](../../product-spec.md). При расхождении кода и спеки правится код.

---

## Структура файлов

| Файл | Ответственность | Задача |
|---|---|---|
| `vitest.config.mts` | Конфигурация Vitest | 1 |
| `src/lib/dates.ts` | Чистые операции с локальными датами | 1 |
| `src/lib/streak.ts` | Чистый расчёт стриков и заморозок | 2, 3 |
| `src/lib/validation.ts` | Валидация username | 4 |
| `src/db/schema.ts` | Таблицы, индексы, ограничения | 5 |
| `drizzle/*.sql` | Миграции | 5, 6 |
| `src/db/rls.ts` | Обёртки `withUser` / `withAnon` | 7 |
| `src/lib/dal/session.ts` | Сессия и её проверка | 8 |
| `src/lib/dal/user.ts` | Профиль: свой и публичный | 8 |
| `src/lib/dal/promise.ts` | Обещание, чек-ины, заморозки | 9, 11 |
| `src/app/globals.css` | Порядок слоёв, токены, две темы | 9a |
| `src/app/nes-theme.css` | Единственное место переопределения NES.css | 9a |
| `src/app/layout.tsx` | Шрифт, `data-theme` из куки | 9a |
| `src/app/theme-actions.ts` | Server action переключения темы | 9a |
| `src/components/ui/panel.tsx` | Примитив панели | 9a |
| `src/components/ui/pixel-button.tsx` | Примитив кнопки | 9a |
| `src/components/ui/field.tsx` | Примитив поля формы | 9a |
| `src/components/ui/theme-toggle.tsx` | Переключатель темы (клиент) | 9a |
| `src/lib/view/chain.ts` | Чистая сборка ячеек цепочки | 9b |
| `src/lib/view/stage.ts` | Чистое отображение стрика в стадию аватара | 9b |
| `src/components/streak/*` | Цепочка, статы, заморозки, аватар | 9c |
| `src/components/layout/*` | Шапка и меню | 9c |
| `src/components/share/share-bar.tsx` | Панель шаринга (клиент) | 9c |
| `src/app/dashboard/page.tsx` | Экран дашборда | 10 |
| `src/app/dashboard/actions.ts` | Server action чек-ина | 10 |
| `src/app/dashboard/checkin-form.tsx` | Клиентская форма чек-ина | 10 |
| `src/app/dashboard/error.tsx` | Граница ошибок дашборда | 10 |
| `src/app/onboarding/page.tsx` | Экран онбординга | 11 |
| `src/app/onboarding/actions.ts` | Server actions онбординга | 11 |
| `src/app/onboarding/onboarding-form.tsx` | Клиентская форма онбординга | 11 |
| `src/app/[username]/page.tsx` | Публичный профиль | 12 |
| `src/app/[username]/not-found.tsx` | 404 профиля | 12 |
| `src/app/[username]/opengraph-image.tsx` | OG-картинка | 13 |
| `assets/PressStart2P-Regular.ttf` | Шрифт для OG | 13 |
| `src/app/page.tsx` | Лендинг | 13a |
| `src/app/login/page.tsx` | Экран входа | 13a |
| `src/app/dashboard/loading.tsx` | Скелет дашборда | 13b |
| `src/app/[username]/loading.tsx` | Скелет профиля | 13b |
| `src/app/not-found.tsx` | Глобальная 404 | 13b |
| `playwright.config.ts`, `e2e/*` | E2E-тесты | 14 |

Удаляются: `src/app/api/og/route.tsx` (задача 13).

---

### Task 1: Инфраструктура тестов и работа с локальными датами

**Files:**
- Create: `vitest.config.mts`
- Create: `src/lib/dates.ts`
- Create: `src/lib/dates.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: ничего
- Produces:
  - `type LocalDate = string` — календарная дата `YYYY-MM-DD`
  - `localDateOf(instant: Date, timeZone: string): LocalDate`
  - `addDays(date: LocalDate, days: number): LocalDate`
  - `daysBetween(from: LocalDate, to: LocalDate): number`
  - `datesBetween(from: LocalDate, to: LocalDate): LocalDate[]`

**Контекст.** Сейчас стрик считается по UTC (`new Date().toISOString().split('T')[0]`), а «отметился сегодня» — по таймзоне пользователя. Два разных «сегодня» в одном файле. Этот модуль — единственный источник правды по датам.

Тесты используют только `environment: 'node'` — ни jsdom, ни React-плагин не ставим. Документация Next.js прямо рекомендует не покрывать async Server Components юнит-тестами; компоненты закрывает Playwright в задаче 14.

- [ ] **Step 1: Зафиксировать текущее состояние дерева**

В рабочем дереве есть незакоммиченные правки (`package.json`, `src/db/schema.ts`, две страницы) и блок, который дописывает `next dev` в `AGENTS.md`. Коммитим их как базу, чтобы дальнейшие диффы были читаемыми.

```bash
git add -A
git commit -m "chore: commit work in progress before MVP completion"
```

- [ ] **Step 2: Установить Vitest**

```bash
npm install -D vitest vite-tsconfig-paths
```

- [ ] **Step 3: Создать конфигурацию Vitest**

Создать `vitest.config.mts`:

```ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Добавить скрипты в package.json**

В `package.json`, в блок `"scripts"`, добавить две строки после `"lint": "eslint",`:

```json
    "test": "vitest run",
    "test:watch": "vitest",
```

- [ ] **Step 5: Написать падающие тесты**

Создать `src/lib/dates.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { addDays, datesBetween, daysBetween, localDateOf } from './dates'

describe('localDateOf', () => {
  it('resolves the calendar date in the given timezone', () => {
    // 23:30 UTC is already the next day in Kyiv (UTC+3).
    const instant = new Date('2026-08-06T23:30:00Z')

    expect(localDateOf(instant, 'UTC')).toBe('2026-08-06')
    expect(localDateOf(instant, 'Europe/Kyiv')).toBe('2026-08-07')
    expect(localDateOf(instant, 'America/New_York')).toBe('2026-08-06')
  })

  it('resolves the previous day for timezones behind UTC', () => {
    // 02:00 UTC is still the previous evening in Los Angeles (UTC-7).
    const instant = new Date('2026-08-06T02:00:00Z')

    expect(localDateOf(instant, 'UTC')).toBe('2026-08-06')
    expect(localDateOf(instant, 'America/Los_Angeles')).toBe('2026-08-05')
  })

  it('pads single-digit months and days', () => {
    expect(localDateOf(new Date('2026-01-02T12:00:00Z'), 'UTC')).toBe('2026-01-02')
  })
})

describe('addDays', () => {
  it('moves forward and backward', () => {
    expect(addDays('2026-08-06', 1)).toBe('2026-08-07')
    expect(addDays('2026-08-06', -1)).toBe('2026-08-05')
    expect(addDays('2026-08-06', 0)).toBe('2026-08-06')
  })

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01')
  })

  it('is unaffected by daylight saving transitions', () => {
    // Europe/Kyiv springs forward on 2026-03-29. Pure date math must not care.
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
  })
})

describe('daysBetween', () => {
  it('counts whole days and is signed', () => {
    expect(daysBetween('2026-08-01', '2026-08-10')).toBe(9)
    expect(daysBetween('2026-08-10', '2026-08-01')).toBe(-9)
    expect(daysBetween('2026-08-06', '2026-08-06')).toBe(0)
  })
})

describe('datesBetween', () => {
  it('returns an inclusive range', () => {
    expect(datesBetween('2026-08-06', '2026-08-09')).toEqual([
      '2026-08-06',
      '2026-08-07',
      '2026-08-08',
      '2026-08-09',
    ])
  })

  it('returns a single date when both ends match', () => {
    expect(datesBetween('2026-08-06', '2026-08-06')).toEqual(['2026-08-06'])
  })

  it('returns nothing when the range is inverted', () => {
    expect(datesBetween('2026-08-09', '2026-08-06')).toEqual([])
  })
})
```

- [ ] **Step 6: Убедиться, что тесты падают**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./dates"`.

- [ ] **Step 7: Реализовать модуль**

Создать `src/lib/dates.ts`:

```ts
/** A calendar date as `YYYY-MM-DD`, always interpreted in a user's timezone. */
export type LocalDate = string

const MS_PER_DAY = 86_400_000

function toUtcMillis(date: LocalDate): number {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

function fromUtcMillis(millis: number): LocalDate {
  const date = new Date(millis)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/**
 * The calendar date an instant falls on in `timeZone`.
 * This is the only place the app converts an instant into a day.
 */
export function localDateOf(instant: Date, timeZone: string): LocalDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)

  const valueOf = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)!.value

  return `${valueOf('year')}-${valueOf('month')}-${valueOf('day')}`
}

/**
 * Shifts a local date by whole days.
 * The arithmetic stays in UTC, so daylight saving transitions cannot skew it.
 */
export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtcMillis(toUtcMillis(date) + days * MS_PER_DAY)
}

/** Whole days from `from` to `to`. Negative when `to` precedes `from`. */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((toUtcMillis(to) - toUtcMillis(from)) / MS_PER_DAY)
}

/** Every date from `from` to `to` inclusive. Empty when the range is inverted. */
export function datesBetween(from: LocalDate, to: LocalDate): LocalDate[] {
  const span = daysBetween(from, to)
  if (span < 0) return []
  return Array.from({ length: span + 1 }, (_, offset) => addDays(from, offset))
}
```

- [ ] **Step 8: Убедиться, что тесты проходят**

Run: `npm test`
Expected: PASS — 11 тестов.

- [ ] **Step 9: Коммит**

```bash
git add vitest.config.mts package.json package-lock.json src/lib/dates.ts src/lib/dates.test.ts
git commit -m "feat: add Vitest and timezone-aware local date helpers"
```

---

### Task 2: Расчёт стрика

**Files:**
- Create: `src/lib/streak.ts`
- Create: `src/lib/streak.test.ts`

**Interfaces:**
- Consumes: `addDays`, `LocalDate` из `src/lib/dates.ts`
- Produces:
  - `interface StreakInput { checkinDates: LocalDate[]; frozenDates: LocalDate[]; today: LocalDate }`
  - `interface StreakResult { current: number; best: number }`
  - `calculateStreak(input: StreakInput): StreakResult`

**Контекст.** Правила — [docs/product-spec.md §4.2–4.4](../../product-spec.md). День считается закрытым, если есть чек-ин **или** заморозка. Текущий стрик привязывается к сегодня, а если сегодня ещё не закрыт — ко вчера (грация на незавершённый день). Лучший стрик — самая длинная цепочка за всю историю.

- [ ] **Step 1: Написать падающие тесты**

Создать `src/lib/streak.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { calculateStreak } from './streak'

const TODAY = '2026-08-10'

function streak(checkinDates: string[], frozenDates: string[] = []) {
  return calculateStreak({ checkinDates, frozenDates, today: TODAY })
}

describe('calculateStreak', () => {
  it('reports zero for a promise with no history', () => {
    expect(streak([])).toEqual({ current: 0, best: 0 })
  })

  it('counts a check-in made today', () => {
    expect(streak(['2026-08-10'])).toEqual({ current: 1, best: 1 })
  })

  it('keeps the streak alive when only yesterday is covered', () => {
    // Today is not a miss until it is over.
    expect(streak(['2026-08-09'])).toEqual({ current: 1, best: 1 })
  })

  it('breaks the streak when yesterday was missed', () => {
    expect(streak(['2026-08-08'])).toEqual({ current: 0, best: 1 })
  })

  it('counts a consecutive run ending today', () => {
    expect(streak(['2026-08-08', '2026-08-09', '2026-08-10'])).toEqual({
      current: 3,
      best: 3,
    })
  })

  it('counts a consecutive run ending yesterday', () => {
    expect(streak(['2026-08-07', '2026-08-08', '2026-08-09'])).toEqual({
      current: 3,
      best: 3,
    })
  })

  it('treats frozen days as covered', () => {
    expect(streak(['2026-08-08', '2026-08-10'], ['2026-08-09'])).toEqual({
      current: 3,
      best: 3,
    })
  })

  it('remembers the best run after the current one breaks', () => {
    const checkins = [
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-10',
    ]
    expect(streak(checkins)).toEqual({ current: 1, best: 4 })
  })

  it('ignores duplicate dates', () => {
    expect(streak(['2026-08-10', '2026-08-10', '2026-08-09'])).toEqual({
      current: 2,
      best: 2,
    })
  })

  it('ignores the order the dates arrive in', () => {
    expect(streak(['2026-08-09', '2026-08-10', '2026-08-08'])).toEqual({
      current: 3,
      best: 3,
    })
  })

  it('does not double-count a day that is both checked in and frozen', () => {
    expect(streak(['2026-08-10'], ['2026-08-10'])).toEqual({
      current: 1,
      best: 1,
    })
  })

  it('counts a run that crosses a month boundary', () => {
    expect(streak(['2026-07-31', '2026-08-01'])).toEqual({ current: 0, best: 2 })
  })
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npm test src/lib/streak.test.ts`
Expected: FAIL — `Failed to resolve import "./streak"`.

- [ ] **Step 3: Реализовать расчёт**

Создать `src/lib/streak.ts`:

```ts
import { addDays, type LocalDate } from './dates'

export interface StreakInput {
  /** Dates the user actually checked in on. */
  checkinDates: LocalDate[]
  /** Dates a streak freeze was spent on. */
  frozenDates: LocalDate[]
  /** The user's current local date. */
  today: LocalDate
}

export interface StreakResult {
  current: number
  best: number
}

/** Check-ins and freezes merged, deduplicated, ascending. */
export function coveredDays(
  checkinDates: LocalDate[],
  frozenDates: LocalDate[],
): LocalDate[] {
  return [...new Set([...checkinDates, ...frozenDates])].sort()
}

function runEndingAt(covered: Set<LocalDate>, anchor: LocalDate): number {
  let length = 0
  let cursor = anchor

  while (covered.has(cursor)) {
    length += 1
    cursor = addDays(cursor, -1)
  }

  return length
}

export function calculateStreak({
  checkinDates,
  frozenDates,
  today,
}: StreakInput): StreakResult {
  const ascending = coveredDays(checkinDates, frozenDates)
  if (ascending.length === 0) return { current: 0, best: 0 }

  const covered = new Set(ascending)

  // Today only anchors the streak once it is covered; until the day is over,
  // yesterday still counts as the end of a live streak.
  const yesterday = addDays(today, -1)
  const anchor = covered.has(today)
    ? today
    : covered.has(yesterday)
      ? yesterday
      : null

  const current = anchor === null ? 0 : runEndingAt(covered, anchor)

  let best = 1
  let run = 1
  for (let index = 1; index < ascending.length; index += 1) {
    run = ascending[index] === addDays(ascending[index - 1], 1) ? run + 1 : 1
    if (run > best) best = run
  }

  return { current, best }
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npm test`
Expected: PASS — 12 тестов в `streak.test.ts` плюс 11 из задачи 1.

- [ ] **Step 5: Коммит**

```bash
git add src/lib/streak.ts src/lib/streak.test.ts
git commit -m "feat: add timezone-aware streak calculation"
```

---

### Task 3: Заморозки стрика

**Files:**
- Modify: `src/lib/streak.ts`
- Modify: `src/lib/streak.test.ts`

**Interfaces:**
- Consumes: `addDays`, `datesBetween`, `LocalDate` из `src/lib/dates.ts`; `coveredDays` из `src/lib/streak.ts`
- Produces:
  - `const FREEZE_EARN_INTERVAL = 7`
  - `const MAX_FREEZE_BALANCE = 3`
  - `interface FreezePlanInput { checkinDates: LocalDate[]; frozenDates: LocalDate[]; today: LocalDate; freezeBalance: number }`
  - `interface FreezePlan { datesToFreeze: LocalDate[]; streakSurvives: boolean }`
  - `planFreezes(input: FreezePlanInput): FreezePlan`
  - `earnedFreezeBalance(streakLength: number, currentBalance: number): number`

**Контекст.** Правила — [docs/product-spec.md §4.5–4.6](../../product-spec.md). Начисление: каждые 7 дней стрика, потолок 3. Списание: ленивое, автоматическое, по правилу «всё или ничего» — если заморозок не хватает закрыть весь разрыв, не тратится ни одной.

Функция только **планирует**: она чистая и ничего не пишет. Запись выполняет DAL в задаче 9.

- [ ] **Step 1: Написать падающие тесты**

Сначала заменить строку импорта в начале `src/lib/streak.test.ts` на:

```ts
import { calculateStreak, earnedFreezeBalance, planFreezes } from './streak'
```

Затем дописать в конец файла:

```ts
function plan(
  checkinDates: string[],
  frozenDates: string[],
  freezeBalance: number,
) {
  return planFreezes({ checkinDates, frozenDates, today: TODAY, freezeBalance })
}

describe('planFreezes', () => {
  it('does nothing when there is no history', () => {
    expect(plan([], [], 3)).toEqual({ datesToFreeze: [], streakSurvives: false })
  })

  it('does nothing when the user checked in today', () => {
    expect(plan(['2026-08-10'], [], 3)).toEqual({
      datesToFreeze: [],
      streakSurvives: true,
    })
  })

  it('does nothing when the user checked in yesterday', () => {
    // Today is still in progress, so there is no completed miss yet.
    expect(plan(['2026-08-09'], [], 3)).toEqual({
      datesToFreeze: [],
      streakSurvives: true,
    })
  })

  it('freezes a single missed day', () => {
    expect(plan(['2026-08-08'], [], 1)).toEqual({
      datesToFreeze: ['2026-08-09'],
      streakSurvives: true,
    })
  })

  it('freezes every day of a gap it can cover', () => {
    expect(plan(['2026-08-06'], [], 3)).toEqual({
      datesToFreeze: ['2026-08-07', '2026-08-08', '2026-08-09'],
      streakSurvives: true,
    })
  })

  it('spends nothing when the gap is wider than the balance', () => {
    // All or nothing: a partly covered gap breaks the streak anyway.
    expect(plan(['2026-08-01'], [], 3)).toEqual({
      datesToFreeze: [],
      streakSurvives: false,
    })
  })

  it('spends nothing when the balance is empty', () => {
    expect(plan(['2026-08-08'], [], 0)).toEqual({
      datesToFreeze: [],
      streakSurvives: false,
    })
  })

  it('counts already frozen days as covered', () => {
    expect(plan(['2026-08-07'], ['2026-08-08'], 1)).toEqual({
      datesToFreeze: ['2026-08-09'],
      streakSurvives: true,
    })
  })

  it('measures the gap from the most recent covered day', () => {
    expect(plan(['2026-08-01', '2026-08-08'], [], 1)).toEqual({
      datesToFreeze: ['2026-08-09'],
      streakSurvives: true,
    })
  })
})

describe('earnedFreezeBalance', () => {
  it('grants a freeze every seven days', () => {
    expect(earnedFreezeBalance(7, 0)).toBe(1)
    expect(earnedFreezeBalance(14, 1)).toBe(2)
  })

  it('grants nothing on other days', () => {
    expect(earnedFreezeBalance(1, 0)).toBe(0)
    expect(earnedFreezeBalance(6, 0)).toBe(0)
    expect(earnedFreezeBalance(8, 1)).toBe(1)
  })

  it('grants nothing for an empty streak', () => {
    expect(earnedFreezeBalance(0, 2)).toBe(2)
  })

  it('never exceeds the cap', () => {
    expect(earnedFreezeBalance(7, 3)).toBe(3)
    expect(earnedFreezeBalance(28, 3)).toBe(3)
  })
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npm test src/lib/streak.test.ts`
Expected: FAIL — `planFreezes is not a function` или ошибка импорта.

- [ ] **Step 3: Реализовать заморозки**

Дописать в конец `src/lib/streak.ts` и добавить `datesBetween` в импорт из `./dates`:

```ts
/** Days of unbroken streak needed to earn one freeze. */
export const FREEZE_EARN_INTERVAL = 7

/** Hard cap on how many freezes a user may hold. */
export const MAX_FREEZE_BALANCE = 3

export interface FreezePlanInput extends StreakInput {
  freezeBalance: number
}

export interface FreezePlan {
  /** Days to record a freeze for. Empty when nothing is spent. */
  datesToFreeze: LocalDate[]
  streakSurvives: boolean
}

/**
 * Decides which missed days a freeze should cover.
 * Pure: it plans, the caller writes.
 */
export function planFreezes({
  checkinDates,
  frozenDates,
  today,
  freezeBalance,
}: FreezePlanInput): FreezePlan {
  const ascending = coveredDays(checkinDates, frozenDates)
  if (ascending.length === 0) {
    return { datesToFreeze: [], streakSurvives: false }
  }

  const lastCovered = ascending[ascending.length - 1]

  // Today is not a miss until it is over, so the gap can only end at yesterday.
  const gap = datesBetween(addDays(lastCovered, 1), addDays(today, -1))
  if (gap.length === 0) {
    return { datesToFreeze: [], streakSurvives: true }
  }

  // All or nothing: covering part of a gap still breaks the streak, so the
  // freezes are better kept for a gap that can actually be closed.
  if (gap.length > freezeBalance) {
    return { datesToFreeze: [], streakSurvives: false }
  }

  return { datesToFreeze: gap, streakSurvives: true }
}

/**
 * The freeze balance after a check-in that extended the streak to
 * `streakLength`. Returns `currentBalance` unchanged when nothing is earned.
 */
export function earnedFreezeBalance(
  streakLength: number,
  currentBalance: number,
): number {
  const earnsFreeze =
    streakLength > 0 && streakLength % FREEZE_EARN_INTERVAL === 0

  if (!earnsFreeze) return currentBalance

  return Math.min(currentBalance + 1, MAX_FREEZE_BALANCE)
}
```

Импорт в начале файла становится таким:

```ts
import { addDays, datesBetween, type LocalDate } from './dates'
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npm test`
Expected: PASS — 36 тестов.

- [ ] **Step 5: Коммит**

```bash
git add src/lib/streak.ts src/lib/streak.test.ts
git commit -m "feat: add streak freeze planning and earning rules"
```

---

### Task 4: Валидация username и текста обещания

**Files:**
- Create: `src/lib/validation.ts`
- Create: `src/lib/validation.test.ts`

**Interfaces:**
- Consumes: ничего
- Produces:
  - `type UsernameError = 'invalid_format' | 'reserved'`
  - `const RESERVED_USERNAMES: readonly string[]`
  - `validateUsername(username: string): UsernameError | null`
  - `const PROMISE_MAX_LENGTH = 80`
  - `type PromiseTitleError = 'empty' | 'too_long'`
  - `validatePromiseTitle(title: string): PromiseTitleError | null`

**Контекст.** Правила username — [docs/product-spec.md §6](../../product-spec.md). Публичный профиль живёт в корне (`/<username>`), поэтому ник конкурирует за путь с системными роутами: `/login`, `/dashboard`, `/onboarding`, `/auth`, `/api`. Занятые имена нужно запрещать.

Длина обещания ограничивается 80 символами. Это не вкусовое число: текст обещания — заголовок экрана, набранный пиксельным шрифтом, у которого ширина глифа ровно `1em`. На 320px под контент остаётся 248px, и всё, что длиннее, разносит вёрстку ([спека §5.3](../specs/2026-08-06-frontend-design.md)). Ограничение живёт на трёх уровнях: здесь, в схеме БД (задача 5) и в `maxLength` на инпуте (задача 11).

- [ ] **Step 1: Написать падающие тесты**

Создать `src/lib/validation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  PROMISE_MAX_LENGTH,
  validatePromiseTitle,
  validateUsername,
} from './validation'

describe('validatePromiseTitle', () => {
  it('accepts an ordinary promise', () => {
    expect(validatePromiseTitle('Code every day')).toBeNull()
  })

  it('rejects blank input, including whitespace only', () => {
    expect(validatePromiseTitle('')).toBe('empty')
    expect(validatePromiseTitle('   ')).toBe('empty')
  })

  it('accepts the boundary length', () => {
    expect(validatePromiseTitle('a'.repeat(PROMISE_MAX_LENGTH))).toBeNull()
  })

  it('rejects one character past the boundary', () => {
    expect(validatePromiseTitle('a'.repeat(PROMISE_MAX_LENGTH + 1))).toBe(
      'too_long',
    )
  })

  it('measures the trimmed value', () => {
    const padded = `  ${'a'.repeat(PROMISE_MAX_LENGTH)}  `
    expect(validatePromiseTitle(padded)).toBeNull()
  })
})

describe('validateUsername', () => {
  it('accepts letters, digits and underscores', () => {
    expect(validateUsername('player1')).toBeNull()
    expect(validateUsername('Player_One')).toBeNull()
    expect(validateUsername('___')).toBeNull()
  })

  it('rejects names that are too short or too long', () => {
    expect(validateUsername('ab')).toBe('invalid_format')
    expect(validateUsername('a'.repeat(21))).toBe('invalid_format')
  })

  it('accepts the boundary lengths', () => {
    expect(validateUsername('abc')).toBeNull()
    expect(validateUsername('a'.repeat(20))).toBeNull()
  })

  it('rejects empty input', () => {
    expect(validateUsername('')).toBe('invalid_format')
  })

  it('rejects disallowed characters', () => {
    expect(validateUsername('player one')).toBe('invalid_format')
    expect(validateUsername('player-one')).toBe('invalid_format')
    expect(validateUsername('player.one')).toBe('invalid_format')
    expect(validateUsername('игрок1')).toBe('invalid_format')
  })

  it('rejects route names that would collide with the app', () => {
    expect(validateUsername('dashboard')).toBe('reserved')
    expect(validateUsername('login')).toBe('reserved')
    expect(validateUsername('api')).toBe('reserved')
  })

  it('rejects reserved names regardless of case', () => {
    expect(validateUsername('Dashboard')).toBe('reserved')
    expect(validateUsername('ADMIN')).toBe('reserved')
  })
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npm test src/lib/validation.test.ts`
Expected: FAIL — `Failed to resolve import "./validation"`.

- [ ] **Step 3: Реализовать валидацию**

Создать `src/lib/validation.ts`:

```ts
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/

/**
 * Names the app owns. Public profiles live at the root (`/<username>`),
 * so a username must never collide with a route.
 */
export const RESERVED_USERNAMES: readonly string[] = [
  'about',
  'admin',
  'api',
  'auth',
  'dashboard',
  'help',
  'login',
  'null',
  'onboarding',
  'settings',
  'support',
  'undefined',
  'www',
]

export type UsernameError = 'invalid_format' | 'reserved'

/** Returns the reason a username is unacceptable, or `null` when it is fine. */
export function validateUsername(username: string): UsernameError | null {
  if (!USERNAME_PATTERN.test(username)) return 'invalid_format'
  if (RESERVED_USERNAMES.includes(username.toLowerCase())) return 'reserved'
  return null
}

/**
 * The promise is the page heading, set in a monospaced pixel font. Anything
 * longer than this wraps past what a 320px screen can hold.
 */
export const PROMISE_MAX_LENGTH = 80

export type PromiseTitleError = 'empty' | 'too_long'

export function validatePromiseTitle(title: string): PromiseTitleError | null {
  const trimmed = title.trim()
  if (trimmed.length === 0) return 'empty'
  if (trimmed.length > PROMISE_MAX_LENGTH) return 'too_long'
  return null
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npm test`
Expected: PASS — 48 тестов.

- [ ] **Step 5: Коммит**

```bash
git add src/lib/validation.ts src/lib/validation.test.ts
git commit -m "feat: add username validation with reserved route names"
```

---

### Task 4a: Чистый слой представления

**Files:**
- Create: `src/lib/view/chain.ts`
- Create: `src/lib/view/chain.test.ts`
- Create: `src/lib/view/stage.ts`
- Create: `src/lib/view/stage.test.ts`

**Interfaces:**
- Consumes: `addDays`, `datesBetween`, `LocalDate` из `src/lib/dates.ts`
- Produces:
  - `const CHAIN_DAYS = 30`, `const CHAIN_DAYS_COMPACT = 14`
  - `type CellState = 'checked' | 'frozen' | 'missed' | 'empty'`
  - `interface Cell { date: LocalDate; state: CellState }`
  - `interface ChainInput { today: LocalDate; checkinDates: LocalDate[]; frozenDates: LocalDate[]; startedOn: LocalDate | null; days?: number }`
  - `chainWindowStart(today: LocalDate, days?: number): LocalDate`
  - `buildChain(input: ChainInput): Cell[]`
  - `interface ChainSummary { checked: number; frozen: number; missed: number }`
  - `summarizeChain(cells: Cell[]): ChainSummary`
  - `type Stage = 'dormant' | 'walking' | 'running' | 'blazing' | 'crowned'`
  - `stageOf(currentStreak: number): Stage`
  - `daysToNextStage(currentStreak: number): number | null`

**Контекст.** Дашборд, публичный профиль и OG-картинка рисуют одну и ту же цепочку дней. Если собирать её на месте, повторится история дублированного `calculateStreak` ([known-issues.md 1.3](../../known-issues.md)) — только в вёрстке, где её никто не покроет тестами.

Модуль чистый по тем же правилам, что `dates.ts` и `streak.ts`: без БД, без чтения системных часов, `today` приходит аргументом.

Ключевое различие состояний — `missed` против `empty`. День без чек-ина считается пропущенным только если он **после** первого чек-ина пользователя. У человека, зарегистрировавшегося вчера, предыдущие 29 дней не «пропущены»: его тогда просто не было. Отсюда обязательный `startedOn` во входных данных.

Окно цепочки заканчивается сегодняшним днём, поэтому состояния `future` не существует.

Пороги стадий аватара — из [спеки §5.4](../specs/2026-08-06-frontend-design.md): 0 / 1 / 7 / 30 / 100.

- [ ] **Step 1: Написать падающие тесты цепочки**

Создать `src/lib/view/chain.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  CHAIN_DAYS,
  buildChain,
  chainWindowStart,
  summarizeChain,
} from './chain'

const TODAY = '2026-08-10'

describe('chainWindowStart', () => {
  it('spans CHAIN_DAYS days inclusive of today', () => {
    expect(chainWindowStart(TODAY)).toBe('2026-07-12')
  })

  it('honours a custom window length', () => {
    expect(chainWindowStart(TODAY, 14)).toBe('2026-07-28')
  })
})

describe('buildChain', () => {
  it('returns exactly CHAIN_DAYS cells ending on today', () => {
    const cells = buildChain({
      today: TODAY,
      checkinDates: [],
      frozenDates: [],
      startedOn: null,
    })

    expect(cells).toHaveLength(CHAIN_DAYS)
    expect(cells[0].date).toBe('2026-07-12')
    expect(cells[CHAIN_DAYS - 1].date).toBe(TODAY)
  })

  it('marks days before the first check-in as empty, not missed', () => {
    const cells = buildChain({
      today: TODAY,
      checkinDates: ['2026-08-09', '2026-08-10'],
      frozenDates: [],
      startedOn: '2026-08-09',
      days: 4,
    })

    expect(cells.map((cell) => cell.state)).toEqual([
      'empty',
      'empty',
      'checked',
      'checked',
    ])
  })

  it('distinguishes checked, frozen and missed days', () => {
    const cells = buildChain({
      today: TODAY,
      checkinDates: ['2026-08-07', '2026-08-10'],
      frozenDates: ['2026-08-08'],
      startedOn: '2026-08-07',
      days: 4,
    })

    expect(cells.map((cell) => cell.state)).toEqual([
      'checked',
      'frozen',
      'missed',
      'checked',
    ])
  })

  it('ignores dates outside the window', () => {
    const cells = buildChain({
      today: TODAY,
      checkinDates: ['2026-01-01'],
      frozenDates: [],
      startedOn: '2026-01-01',
      days: 3,
    })

    expect(cells.map((cell) => cell.state)).toEqual([
      'missed',
      'missed',
      'missed',
    ])
  })

  it('treats a user with no history as entirely empty', () => {
    const cells = buildChain({
      today: TODAY,
      checkinDates: [],
      frozenDates: [],
      startedOn: null,
      days: 3,
    })

    expect(cells.every((cell) => cell.state === 'empty')).toBe(true)
  })
})

describe('summarizeChain', () => {
  it('counts each state', () => {
    const cells = buildChain({
      today: TODAY,
      checkinDates: ['2026-08-07', '2026-08-10'],
      frozenDates: ['2026-08-08'],
      startedOn: '2026-08-07',
      days: 4,
    })

    expect(summarizeChain(cells)).toEqual({
      checked: 2,
      frozen: 1,
      missed: 1,
    })
  })
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run src/lib/view/chain.test.ts`
Expected: FAIL — `Failed to resolve import "./chain"`.

- [ ] **Step 3: Реализовать `chain.ts`**

Создать `src/lib/view/chain.ts`:

```ts
import { addDays, datesBetween, type LocalDate } from '../dates'

/** Days the chain shows on `sm` and wider. */
export const CHAIN_DAYS = 30

/** Days the chain shows below `sm`. The rest are hidden with CSS. */
export const CHAIN_DAYS_COMPACT = 14

export type CellState = 'checked' | 'frozen' | 'missed' | 'empty'

export interface Cell {
  date: LocalDate
  state: CellState
}

export interface ChainInput {
  today: LocalDate
  checkinDates: LocalDate[]
  frozenDates: LocalDate[]
  /** The user's first check-in. Days before it are empty, not missed. */
  startedOn: LocalDate | null
  days?: number
}

export interface ChainSummary {
  checked: number
  frozen: number
  missed: number
}

/** First day the chain shows, inclusive. */
export function chainWindowStart(
  today: LocalDate,
  days: number = CHAIN_DAYS,
): LocalDate {
  return addDays(today, -(days - 1))
}

export function buildChain(input: ChainInput): Cell[] {
  const days = input.days ?? CHAIN_DAYS
  const checked = new Set(input.checkinDates)
  const frozen = new Set(input.frozenDates)

  return datesBetween(chainWindowStart(input.today, days), input.today).map(
    (date): Cell => {
      if (checked.has(date)) return { date, state: 'checked' }
      if (frozen.has(date)) return { date, state: 'frozen' }

      // Before the user's first check-in there was nothing to miss.
      const started = input.startedOn !== null && date >= input.startedOn
      return { date, state: started ? 'missed' : 'empty' }
    },
  )
}

export function summarizeChain(cells: Cell[]): ChainSummary {
  return {
    checked: cells.filter((cell) => cell.state === 'checked').length,
    frozen: cells.filter((cell) => cell.state === 'frozen').length,
    missed: cells.filter((cell) => cell.state === 'missed').length,
  }
}
```

Сравнение `date >= input.startedOn` работает лексикографически, потому что `LocalDate` — это всегда `YYYY-MM-DD` с ведущими нулями.

- [ ] **Step 4: Убедиться, что тесты цепочки проходят**

Run: `npx vitest run src/lib/view/chain.test.ts`
Expected: PASS — 8 тестов.

- [ ] **Step 5: Написать падающие тесты стадий**

Создать `src/lib/view/stage.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { daysToNextStage, stageOf } from './stage'

describe('stageOf', () => {
  it.each([
    [0, 'dormant'],
    [1, 'walking'],
    [6, 'walking'],
    [7, 'running'],
    [29, 'running'],
    [30, 'blazing'],
    [99, 'blazing'],
    [100, 'crowned'],
    [10_000, 'crowned'],
  ])('maps a streak of %i to %s', (streak, stage) => {
    expect(stageOf(streak)).toBe(stage)
  })
})

describe('daysToNextStage', () => {
  it.each([
    [0, 1],
    [1, 6],
    [6, 1],
    [7, 23],
    [29, 1],
    [30, 70],
    [99, 1],
  ])('reports %i days short of the next stage from %i', (streak, remaining) => {
    expect(daysToNextStage(streak)).toBe(remaining)
  })

  it('returns null at the final stage', () => {
    expect(daysToNextStage(100)).toBeNull()
    expect(daysToNextStage(500)).toBeNull()
  })
})
```

- [ ] **Step 6: Убедиться, что тесты падают**

Run: `npx vitest run src/lib/view/stage.test.ts`
Expected: FAIL — `Failed to resolve import "./stage"`.

- [ ] **Step 7: Реализовать `stage.ts`**

Создать `src/lib/view/stage.ts`:

```ts
export type Stage = 'dormant' | 'walking' | 'running' | 'blazing' | 'crowned'

interface StageThreshold {
  stage: Stage
  min: number
}

/** Ordered high to low so the first match wins. */
const THRESHOLDS: StageThreshold[] = [
  { stage: 'crowned', min: 100 },
  { stage: 'blazing', min: 30 },
  { stage: 'running', min: 7 },
  { stage: 'walking', min: 1 },
  { stage: 'dormant', min: 0 },
]

export function stageOf(currentStreak: number): Stage {
  const match = THRESHOLDS.find(
    (threshold) => currentStreak >= threshold.min,
  )
  return match ? match.stage : 'dormant'
}

/** Days left until the avatar changes, or null once it cannot change again. */
export function daysToNextStage(currentStreak: number): number | null {
  // Thresholds run high to low; the last one above the current streak is the
  // next one the user will reach.
  const next = [...THRESHOLDS]
    .reverse()
    .find((threshold) => threshold.min > currentStreak)

  return next ? next.min - currentStreak : null
}
```

- [ ] **Step 8: Убедиться, что все тесты проходят**

Run: `npm test`
Expected: PASS — 73 теста.

- [ ] **Step 9: Коммит**

```bash
git add src/lib/view/
git commit -m "feat: add pure view helpers for the streak chain and avatar stage"
```

---

### Task 5: Схема БД и первая миграция

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `drizzle.config.ts`
- Modify: `package.json`
- Create: `drizzle/0000_*.sql` (генерируется)

**Interfaces:**
- Consumes: ничего
- Produces:
  - экспорт таблицы `streak_freezes` с колонками `id`, `promise_id`, `local_date`, `created_at`
  - ограничение `streak_freeze_promise_date_unique` на `(promise_id, local_date)`
  - индекс `promises_user_id_idx`
  - CHECK-ограничение `users_freeze_balance_range`
  - уникальный индекс `users_username_lower_idx` на `lower(username)`
  - `promises.title` сужается до `varchar(80)`
  - npm-скрипт `db:migrate`

**Контекст.** Миграций в репозитории нет вообще: схема применялась через `db:push`. Эта задача создаёт базовую миграцию и добавляет структуры, нужные для заморозок и RLS.

Политики и гранты **не** объявляются в Drizzle — они идут отдельной custom-миграцией в задаче 6. Причина: у грантов нет представления в Drizzle, а держать политики рядом с грантами, от которых они зависят, честнее, чем разносить защиту по двум механизмам. Это безопасно ровно потому, что мы используем `generate` + `migrate` (сравнение со снапшотом), а не `push` (сравнение с живой БД, которое снесло бы неизвестные ему политики).

- [ ] **Step 1: Добавить schemaFilter в конфиг drizzle-kit**

Заменить содержимое `drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' }); // Next.js typically uses .env.local

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  // Supabase owns `auth`, `storage` and friends. Only manage our own schema.
  schemaFilter: ['public'],
  dbCredentials: {
    url: process.env.DATABASE_URL || '',
  },
});
```

- [ ] **Step 2: Добавить скрипт миграции**

В `package.json`, в блоке `"scripts"`, добавить после `"db:generate": "drizzle-kit generate",`:

```json
    "db:migrate": "drizzle-kit migrate",
```

- [ ] **Step 3: Обновить схему**

Заменить содержимое `src/db/schema.ts`:

```ts
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
  boolean,
  text,
  date,
  primaryKey,
  unique,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  // Always equal to auth.users.id. Every RLS policy compares it to auth.uid().
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  username: varchar('username', { length: 255 }).notNull().unique(),
  timezone: varchar('timezone', { length: 255 }).notNull().default('UTC'),
  avatar_level: integer('avatar_level').notNull().default(1),
  total_score: integer('total_score').notNull().default(0),
  streak_freezes_balance: integer('streak_freezes_balance').notNull().default(0),
  is_premium: boolean('is_premium').notNull().default(false),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  // Usernames are compared case-insensitively: Player1 and player1 collide.
  uniqueIndex('users_username_lower_idx').on(sql`lower(${table.username})`),
  check(
    'users_freeze_balance_range',
    sql`${table.streak_freezes_balance} between 0 and 3`,
  ),
]);

export const promises = pgTable('promises', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // 80 characters is what the pixel font fits on a 320px screen without
  // wrecking the layout. See the frontend design spec, section 5.3.
  title: varchar('title', { length: 80 }).notNull(),
  visibility: varchar('visibility', { length: 50 }).notNull().default('public'), // 'public', 'unlisted', 'private'
  cadence: varchar('cadence', { length: 50 }).notNull().default('daily'), // reserved: 'daily', 'weekly'
  cadence_count: integer('cadence_count').notNull().default(1), // reserved
  status: varchar('status', { length: 50 }).notNull().default('active'), // reserved: 'active', 'archived', 'failed'
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  // RLS policies filter by owner on every read; without this they seq-scan.
  index('promises_user_id_idx').on(table.user_id),
]);

export const checkins = pgTable('checkins', {
  id: uuid('id').primaryKey().defaultRandom(),
  promise_id: uuid('promise_id').notNull().references(() => promises.id, { onDelete: 'cascade' }),
  local_date: date('local_date').notNull(), // 'YYYY-MM-DD' in the user's timezone
  note: text('note'), // reserved
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  // One check-in per day, and a covering index for lookups by promise.
  unique('checkin_promise_date_unique').on(table.promise_id, table.local_date),
]);

/**
 * Ledger of spent streak freezes. Without it lazy spending is not idempotent:
 * every dashboard load would re-detect the same gap and burn another freeze.
 */
export const streak_freezes = pgTable('streak_freezes', {
  id: uuid('id').primaryKey().defaultRandom(),
  promise_id: uuid('promise_id').notNull().references(() => promises.id, { onDelete: 'cascade' }),
  local_date: date('local_date').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  unique('streak_freeze_promise_date_unique').on(table.promise_id, table.local_date),
]);

/** Reserved. No policies are defined, so RLS denies every role. */
export const followers = pgTable('followers', {
  follower_id: uuid('follower_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  following_id: uuid('following_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.follower_id, table.following_id] }),
]);
```

- [ ] **Step 4: Проверить, что схема компилируется**

Run: `npx tsc --noEmit`
Expected: без ошибок в `src/db/schema.ts`. Ошибки в `src/app/dashboard/page.tsx` и `src/app/[username]/page.tsx` на этом шаге допустимы — эти файлы переписываются в задачах 10 и 12.

- [ ] **Step 5: Сгенерировать миграцию**

Run: `npm run db:generate`
Expected: создан файл `drizzle/0000_<name>.sql` и каталог `drizzle/meta/`.

- [ ] **Step 6: Прочитать сгенерированный SQL**

Открыть `drizzle/0000_*.sql` и проверить, что там есть:

- `CREATE TABLE "streak_freezes"` с ограничением `streak_freeze_promise_date_unique`
- `CREATE INDEX "promises_user_id_idx"`
- `CREATE UNIQUE INDEX "users_username_lower_idx"` с выражением `lower("username")`
- `CONSTRAINT "users_freeze_balance_range" CHECK`
- отсутствие любых операторов над схемой `auth`

Если чего-то нет — исправить `src/db/schema.ts`, удалить каталог `drizzle/`, вернуться к шагу 5.

- [ ] **Step 7: Применить миграцию**

Run: `npm run db:migrate`
Expected: `[✓] migrations applied successfully!`

Если БД уже содержит таблицы, созданные через `db:push`, миграция упадёт на `relation already exists`. В этом случае — удалить существующие таблицы (`drop table if exists followers, streak_freezes, checkins, promises, users cascade;` в SQL Editor Supabase) и повторить. На этой стадии проекта продовых данных нет.

- [ ] **Step 8: Коммит**

```bash
git add src/db/schema.ts drizzle.config.ts package.json drizzle/
git commit -m "feat: add streak_freezes table, RLS indexes and baseline migration"
```

---

### Task 6: Политики RLS и гранты

**Files:**
- Create: `drizzle/0001_rls_policies.sql` (генерируется пустым, заполняется вручную)

**Interfaces:**
- Consumes: таблицы из задачи 5
- Produces: включённая RLS и политики на `users`, `promises`, `checkins`, `streak_freezes`, `followers`; колоночные гранты на `users`

**Контекст.** Сводка политик — [docs/data-model.md](../../data-model.md). Требования взяты из `.agents/skills/supabase-postgres-best-practices`:

- роль указывается в `TO`; `auth.role()` устарел и ломается при включённых анонимных входах
- `TO authenticated` без предиката владения — это аутентификация без авторизации
- `UPDATE` без `WITH CHECK` позволяет переписать `user_id` на чужой
- `auth.uid()` без обёртки `(select ...)` вызывается на каждую строку
- RLS фильтрует строки, а не колонки: `email` закрывается колоночными грантами

- [ ] **Step 1: Создать пустую custom-миграцию**

Run: `npx drizzle-kit generate --custom --name rls_policies`
Expected: создан пустой файл `drizzle/0001_rls_policies.sql`.

- [ ] **Step 2: Записать политики и гранты**

Заменить содержимое `drizzle/0001_rls_policies.sql`:

```sql
-- Row Level Security for never-give.app.
--
-- Rules applied throughout:
--   * the target role is named in TO, never checked via the deprecated auth.role()
--   * TO authenticated is always paired with an ownership predicate
--   * UPDATE carries both USING and WITH CHECK so user_id cannot be reassigned
--   * auth.uid() is wrapped in (select ...) so it evaluates once, not per row
--   * RLS filters rows, not columns, so `email` is closed off with column grants

--------------------------------------------------------------------------------
-- users
--------------------------------------------------------------------------------

alter table "users" enable row level security;

revoke all on table "users" from anon, authenticated;

-- `email` is granted to NOBODY for select. The row policy below is
-- `using (true)`, so any column readable here is readable for every user;
-- the app reads the address from the Supabase session instead.
grant select (id, username, timezone, avatar_level, created_at)
  on table "users" to anon;

grant select (id, username, timezone, avatar_level,
              total_score, streak_freezes_balance, is_premium, created_at)
  on table "users" to authenticated;

-- Insert covers every column, which is how `email` gets written at onboarding.
grant insert on table "users" to authenticated;
grant update (username, timezone, streak_freezes_balance)
  on table "users" to authenticated;

create policy "users_select_public" on "users"
  for select to anon, authenticated
  using (true);

create policy "users_insert_own" on "users"
  for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "users_update_own" on "users"
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

--------------------------------------------------------------------------------
-- promises
--------------------------------------------------------------------------------

alter table "promises" enable row level security;

revoke all on table "promises" from anon, authenticated;
grant select on table "promises" to anon, authenticated;
grant insert, update on table "promises" to authenticated;

create policy "promises_select_public" on "promises"
  for select to anon
  using (visibility <> 'private');

create policy "promises_select_visible_or_own" on "promises"
  for select to authenticated
  using (visibility <> 'private' or (select auth.uid()) = user_id);

create policy "promises_insert_own" on "promises"
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "promises_update_own" on "promises"
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

--------------------------------------------------------------------------------
-- checkins
--------------------------------------------------------------------------------

alter table "checkins" enable row level security;

revoke all on table "checkins" from anon, authenticated;
grant select on table "checkins" to anon, authenticated;
grant insert on table "checkins" to authenticated;

create policy "checkins_select_public" on "checkins"
  for select to anon
  using (exists (
    select 1 from "promises" p
    where p.id = "checkins".promise_id
      and p.visibility <> 'private'
  ));

create policy "checkins_select_visible_or_own" on "checkins"
  for select to authenticated
  using (exists (
    select 1 from "promises" p
    where p.id = "checkins".promise_id
      and (p.visibility <> 'private' or p.user_id = (select auth.uid()))
  ));

create policy "checkins_insert_own" on "checkins"
  for insert to authenticated
  with check (exists (
    select 1 from "promises" p
    where p.id = "checkins".promise_id
      and p.user_id = (select auth.uid())
  ));

--------------------------------------------------------------------------------
-- streak_freezes
--------------------------------------------------------------------------------

alter table "streak_freezes" enable row level security;

revoke all on table "streak_freezes" from anon, authenticated;
grant select on table "streak_freezes" to anon, authenticated;
grant insert on table "streak_freezes" to authenticated;

create policy "streak_freezes_select_public" on "streak_freezes"
  for select to anon
  using (exists (
    select 1 from "promises" p
    where p.id = "streak_freezes".promise_id
      and p.visibility <> 'private'
  ));

create policy "streak_freezes_select_visible_or_own" on "streak_freezes"
  for select to authenticated
  using (exists (
    select 1 from "promises" p
    where p.id = "streak_freezes".promise_id
      and (p.visibility <> 'private' or p.user_id = (select auth.uid()))
  ));

create policy "streak_freezes_insert_own" on "streak_freezes"
  for insert to authenticated
  with check (exists (
    select 1 from "promises" p
    where p.id = "streak_freezes".promise_id
      and p.user_id = (select auth.uid())
  ));

--------------------------------------------------------------------------------
-- followers
--------------------------------------------------------------------------------

-- Reserved for a future feature. RLS is on and no policy exists, so neither
-- anon nor authenticated can reach a single row. That is the intended default.
alter table "followers" enable row level security;
revoke all on table "followers" from anon, authenticated;

--------------------------------------------------------------------------------
-- Keep public.users tied to auth.users
--------------------------------------------------------------------------------

alter table "users"
  add constraint "users_id_auth_users_id_fk"
  foreign key (id) references auth.users (id) on delete cascade;
```

- [ ] **Step 3: Применить миграцию**

Run: `npm run db:migrate`
Expected: `[✓] migrations applied successfully!`

Если шаг падает на внешнем ключе с `violates foreign key constraint`, значит в `public.users` есть строки без соответствующего пользователя в `auth.users` — наследие бага 1.5 из [known-issues.md](../../known-issues.md). Удалить их: `delete from public.users u where not exists (select 1 from auth.users a where a.id = u.id);` и повторить.

- [ ] **Step 4: Проверить, что политики на месте**

Run:

```bash
npx drizzle-kit studio
```

Либо в SQL Editor Supabase выполнить:

```sql
select tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Expected: 13 строк. По таблицам: `checkins` — 3, `promises` — 4, `streak_freezes` — 3, `users` — 3. Для `followers` — ни одной.

- [ ] **Step 5: Проверить, что RLS реально включена**

Выполнить в SQL Editor Supabase:

```sql
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relkind = 'r'
order by relname;
```

Expected: `relrowsecurity = true` у всех пяти таблиц.

- [ ] **Step 6: Коммит**

```bash
git add drizzle/
git commit -m "feat: enable RLS with ownership policies and column grants"
```

---

### Task 7: RLS-обёртки для запросов

**Files:**
- Create: `src/db/rls.ts`

**Interfaces:**
- Consumes: `db` из `src/db/index.ts`
- Produces:
  - `type DbTransaction`
  - `withUser<T>(userId: string, fn: (tx: DbTransaction) => Promise<T>): Promise<T>`
  - `withAnon<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T>`

**Контекст.** Drizzle подключается по `DATABASE_URL` под привилегированной ролью, которая обходит RLS. Обёртки открывают транзакцию и переключают роль на `authenticated` или `anon` **транзакционно-локально**.

Два обязательных условия:

1. `set_config(..., true)` — третий аргумент `is_local = true`. Настройка живёт до конца транзакции и сбрасывается сама. Без этого соединение вернулось бы в пул с чужой ролью, а pooler Supabase работает в transaction mode.
2. Claims выставляются **до** смены роли. После `set role authenticated` прав на изменение claims уже нет.

`request.jwt.claims` формируются из `userId`, который получен из `supabase.auth.getUser()` — то есть проверен сервером Supabase, а не взят из cookie на веру. `auth.uid()` в политиках читает именно `request.jwt.claims ->> 'sub'`.

- [ ] **Step 1: Реализовать обёртки**

Создать `src/db/rls.ts`:

```ts
import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from './index'

/** The transaction handle Drizzle hands to a `db.transaction` callback. */
export type DbTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0]

/**
 * Runs `fn` as the Postgres `authenticated` role with `auth.uid()` bound to
 * `userId`, so every RLS policy applies.
 *
 * `userId` must come from `supabase.auth.getUser()`, which verifies the token
 * server-side. Never pass an id read straight from a cookie.
 */
export async function withUser<T>(
  userId: string,
  fn: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  const claims = JSON.stringify({ sub: userId, role: 'authenticated' })

  return db.transaction(async (tx) => {
    // Claims first: after the role switch we no longer have the privileges to
    // set them. `true` makes both settings transaction-local, which is what
    // keeps a pooled connection from leaking a role to the next request.
    await tx.execute(sql`select set_config('request.jwt.claims', ${claims}, true)`)
    await tx.execute(sql`select set_config('role', 'authenticated', true)`)

    return fn(tx)
  })
}

/**
 * Runs `fn` as the Postgres `anon` role. Only rows a public visitor may see
 * are returned. Used by the public profile and its OG image.
 */
export async function withAnon<T>(
  fn: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', null, true)`)
    await tx.execute(sql`select set_config('role', 'anon', true)`)

    return fn(tx)
  })
}
```

- [ ] **Step 2: Установить пакет server-only**

```bash
npm install server-only
```

- [ ] **Step 3: Проверить компиляцию**

Run: `npx tsc --noEmit`
Expected: без ошибок в `src/db/rls.ts`. Ошибки в `src/app/dashboard/page.tsx` и `src/app/[username]/page.tsx` пока допустимы.

- [ ] **Step 4: Коммит**

```bash
git add src/db/rls.ts package.json package-lock.json
git commit -m "feat: run queries under RLS with transaction-local role switching"
```

---

### Task 8: Data Access Layer — сессия и профиль

**Files:**
- Create: `src/lib/dal/session.ts`
- Create: `src/lib/dal/user.ts`

**Interfaces:**
- Consumes: `withUser`, `withAnon`, `DbTransaction` из `src/db/rls.ts`; `users` из `src/db/schema.ts`; `createClient` из `src/utils/supabase/server.ts`
- Produces:
  - `interface SessionUser { id: string; email: string }`
  - `getSessionUser(): Promise<SessionUser | null>`
  - `requireSessionUser(): Promise<SessionUser>`
  - `interface Profile { id: string; username: string; timezone: string; avatarLevel: number; freezeBalance: number }`
  - `getProfile(): Promise<Profile | null>`
  - `interface PublicProfile { id: string; username: string; timezone: string; avatarLevel: number }`
  - `getPublicProfile(username: string): Promise<PublicProfile | null>`

**Контекст.** Next.js рекомендует централизовать доступ к данным в Data Access Layer: он проверяет сессию, возвращает минимальный DTO и мемоизируется через `cache()` в пределах рендера. Это закрывает два класса ошибок — утечку `email` в Client Component и рассинхронизацию проверок владения между страницами.

Везде используется `getUser()`, а не `getSession()`: первый валидирует токен на сервере Supabase, второй лишь разбирает cookie.

- [ ] **Step 1: Реализовать доступ к сессии**

Создать `src/lib/dal/session.ts`:

```ts
import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export interface SessionUser {
  id: string
  email: string
}

/**
 * The signed-in user, verified against the Supabase auth server.
 *
 * `getUser()` is used rather than `getSession()` on purpose: the latter only
 * decodes a cookie, which the client controls.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) return null

  return { id: user.id, email: user.email }
})

/** Same as `getSessionUser`, but sends anonymous visitors to the landing page. */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser()

  // redirect() throws a control-flow exception. Never wrap it in try/catch.
  if (!user) redirect('/')

  return user
}
```

- [ ] **Step 2: Реализовать доступ к профилю**

Создать `src/lib/dal/user.ts`:

```ts
import 'server-only'
import { cache } from 'react'
import { eq, sql } from 'drizzle-orm'
import { users } from '@/db/schema'
import { withAnon, withUser } from '@/db/rls'
import { getSessionUser } from './session'

/** The signed-in user's own profile. Never leaves the server with `email`. */
export interface Profile {
  id: string
  username: string
  timezone: string
  avatarLevel: number
  freezeBalance: number
}

/** What a public visitor is allowed to know about a user. */
export interface PublicProfile {
  id: string
  username: string
  timezone: string
  avatarLevel: number
}

export const getProfile = cache(async (): Promise<Profile | null> => {
  const session = await getSessionUser()
  if (!session) return null

  const rows = await withUser(session.id, (tx) =>
    tx
      .select({
        id: users.id,
        username: users.username,
        timezone: users.timezone,
        avatarLevel: users.avatar_level,
        freezeBalance: users.streak_freezes_balance,
      })
      .from(users)
      .where(eq(users.id, session.id))
      .limit(1),
  )

  return rows[0] ?? null
})

/** Looks a profile up by username, case-insensitively, as an anonymous reader. */
export const getPublicProfile = cache(
  async (username: string): Promise<PublicProfile | null> => {
    const rows = await withAnon((tx) =>
      tx
        .select({
          id: users.id,
          username: users.username,
          timezone: users.timezone,
          avatarLevel: users.avatar_level,
        })
        .from(users)
        .where(sql`lower(${users.username}) = ${username.toLowerCase()}`)
        .limit(1),
    )

    return rows[0] ?? null
  },
)
```

- [ ] **Step 3: Проверить компиляцию**

Run: `npx tsc --noEmit`
Expected: без ошибок в `src/lib/dal/`.

- [ ] **Step 4: Коммит**

```bash
git add src/lib/dal/session.ts src/lib/dal/user.ts
git commit -m "feat: add data access layer for session and profile"
```

---

### Task 9: Data Access Layer — обещание, чек-ины, заморозки

**Files:**
- Create: `src/lib/dal/promise.ts`

**Interfaces:**
- Consumes: `withUser`, `withAnon`, `DbTransaction` из `src/db/rls.ts`; `promises`, `checkins`, `streak_freezes`, `users` из `src/db/schema.ts`; `Profile`, `PublicProfile` из `src/lib/dal/user.ts`; `localDateOf`, `LocalDate` из `src/lib/dates.ts`; `calculateStreak`, `planFreezes`, `earnedFreezeBalance` из `src/lib/streak.ts`; `chainWindowStart` из `src/lib/view/chain.ts`
- Produces:
  - `interface PromiseView { id: string; title: string; visibility: string; today: LocalDate; checkedInToday: boolean; currentStreak: number; bestStreak: number; freezeBalance: number; startedOn: LocalDate | null; recentCheckins: LocalDate[]; recentFrozen: LocalDate[] }`
  - `interface PublicPromiseView { title: string; visibility: string; today: LocalDate; currentStreak: number; bestStreak: number; startedOn: LocalDate | null; recentCheckins: LocalDate[]; recentFrozen: LocalDate[] }`
  - `getOwnPromiseView(profile: Profile, now?: Date): Promise<PromiseView | null>`
  - `getPublicPromiseView(profile: PublicProfile, now?: Date): Promise<PublicPromiseView | null>`
  - `interface CheckInResult { alreadyCheckedIn: boolean; earnedFreeze: boolean }`
  - `checkIn(profile: Profile, now?: Date): Promise<CheckInResult>`
  - `createProfileAndPromise(...)` — см. задачу 11

**Контекст.** Порядок операций задан [docs/product-spec.md §4.7](../../product-spec.md):

| Действие | Последовательность |
|---|---|
| Загрузка дашборда | списать заморозки → посчитать стрик → отрисовать |
| Чек-ин | списать заморозки → вставить чек-ин → начислить заморозку при кратности 7 |
| Публичный профиль | только чтение, заморозки не списываются |

Публичный профиль не пишет в БД намеренно: анонимный посетитель не должен провоцировать мутации. Следствие зафиксировано в [known-issues.md §2.1](../../known-issues.md).

Списание заморозок и декремент баланса идут в одной транзакции, поэтому расхождение между журналом `streak_freezes` и `users.streak_freezes_balance` невозможно.

Оба DTO отдают не только числа стриков, но и **даты внутри окна цепочки** плюс `startedOn`. Без них экран не построит ленту дней, а без `startedOn` не отличит «пропустил» от «меня тогда ещё не было» (задача 4a). Даты режутся окном прямо здесь, а не на странице: DTO обязан оставаться минимальным ([architecture.md §5](../../architecture.md)), и отдавать наружу 365 записей ради тридцати клеток незачем.

- [ ] **Step 1: Реализовать модуль**

Создать `src/lib/dal/promise.ts`:

```ts
import 'server-only'
import { asc, eq } from 'drizzle-orm'
import { checkins, promises, streak_freezes, users } from '@/db/schema'
import { withAnon, withUser, type DbTransaction } from '@/db/rls'
import { localDateOf, type LocalDate } from '@/lib/dates'
import {
  calculateStreak,
  earnedFreezeBalance,
  planFreezes,
} from '@/lib/streak'
import { chainWindowStart } from '@/lib/view/chain'
import type { Profile, PublicProfile } from './user'

export interface PromiseView {
  id: string
  title: string
  visibility: string
  today: LocalDate
  checkedInToday: boolean
  currentStreak: number
  bestStreak: number
  freezeBalance: number
  startedOn: LocalDate | null
  recentCheckins: LocalDate[]
  recentFrozen: LocalDate[]
}

export interface PublicPromiseView {
  title: string
  visibility: string
  today: LocalDate
  currentStreak: number
  bestStreak: number
  startedOn: LocalDate | null
  recentCheckins: LocalDate[]
  recentFrozen: LocalDate[]
}

interface PromiseRow {
  id: string
  title: string
  visibility: string
}

/** The earliest date in the list, or null when it is empty. */
function earliest(dates: LocalDate[]): LocalDate | null {
  // LocalDate is always YYYY-MM-DD, so string ordering is date ordering.
  return dates.length === 0 ? null : dates.reduce((a, b) => (a < b ? a : b))
}

/** Keeps only the dates the chain can show, so the DTO stays small. */
function withinChainWindow(
  dates: LocalDate[],
  today: LocalDate,
): LocalDate[] {
  const from = chainWindowStart(today)
  return dates.filter((date) => date >= from && date <= today)
}

/** The MVP shows a single promise: the oldest one the user created. */
async function selectPrimaryPromise(
  tx: DbTransaction,
  userId: string,
): Promise<PromiseRow | null> {
  const rows = await tx
    .select({
      id: promises.id,
      title: promises.title,
      visibility: promises.visibility,
    })
    .from(promises)
    .where(eq(promises.user_id, userId))
    .orderBy(asc(promises.created_at))
    .limit(1)

  return rows[0] ?? null
}

async function selectCheckinDates(
  tx: DbTransaction,
  promiseId: string,
): Promise<LocalDate[]> {
  const rows = await tx
    .select({ localDate: checkins.local_date })
    .from(checkins)
    .where(eq(checkins.promise_id, promiseId))

  return rows.map((row) => row.localDate)
}

async function selectFrozenDates(
  tx: DbTransaction,
  promiseId: string,
): Promise<LocalDate[]> {
  const rows = await tx
    .select({ localDate: streak_freezes.local_date })
    .from(streak_freezes)
    .where(eq(streak_freezes.promise_id, promiseId))

  return rows.map((row) => row.localDate)
}

interface CoverageState {
  checkinDates: LocalDate[]
  frozenDates: LocalDate[]
  freezeBalance: number
}

/**
 * Spends freezes on any completed day the user missed, then reports the
 * resulting coverage. Idempotent: a day already in `streak_freezes` is never
 * paid for twice.
 */
async function applyPendingFreezes(
  tx: DbTransaction,
  promiseId: string,
  profile: Profile,
  today: LocalDate,
): Promise<CoverageState> {
  const checkinDates = await selectCheckinDates(tx, promiseId)
  const frozenDates = await selectFrozenDates(tx, promiseId)

  const plan = planFreezes({
    checkinDates,
    frozenDates,
    today,
    freezeBalance: profile.freezeBalance,
  })

  if (plan.datesToFreeze.length === 0) {
    return { checkinDates, frozenDates, freezeBalance: profile.freezeBalance }
  }

  await tx
    .insert(streak_freezes)
    .values(
      plan.datesToFreeze.map((localDate) => ({
        promise_id: promiseId,
        local_date: localDate,
      })),
    )
    .onConflictDoNothing()

  const freezeBalance = profile.freezeBalance - plan.datesToFreeze.length

  await tx
    .update(users)
    .set({ streak_freezes_balance: freezeBalance })
    .where(eq(users.id, profile.id))

  return {
    checkinDates,
    frozenDates: [...frozenDates, ...plan.datesToFreeze],
    freezeBalance,
  }
}

/** The owner's view of their promise. Spends due freezes as a side effect. */
export async function getOwnPromiseView(
  profile: Profile,
  now: Date = new Date(),
): Promise<PromiseView | null> {
  const today = localDateOf(now, profile.timezone)

  return withUser(profile.id, async (tx) => {
    const promise = await selectPrimaryPromise(tx, profile.id)
    if (!promise) return null

    const coverage = await applyPendingFreezes(tx, promise.id, profile, today)

    const { current, best } = calculateStreak({
      checkinDates: coverage.checkinDates,
      frozenDates: coverage.frozenDates,
      today,
    })

    return {
      id: promise.id,
      title: promise.title,
      visibility: promise.visibility,
      today,
      checkedInToday: coverage.checkinDates.includes(today),
      currentStreak: current,
      bestStreak: best,
      freezeBalance: coverage.freezeBalance,
      startedOn: earliest(coverage.checkinDates),
      recentCheckins: withinChainWindow(coverage.checkinDates, today),
      recentFrozen: withinChainWindow(coverage.frozenDates, today),
    }
  })
}

export interface CheckInResult {
  alreadyCheckedIn: boolean
  earnedFreeze: boolean
}

/**
 * Records today's check-in and grants a freeze when the streak hits a
 * multiple of seven. Safe to call twice: the unique constraint on
 * (promise_id, local_date) makes the second call a no-op.
 *
 * The result is what the UI celebrates with, so it has to say whether a
 * freeze was actually earned rather than leaving the page to guess.
 */
export async function checkIn(
  profile: Profile,
  now: Date = new Date(),
): Promise<CheckInResult> {
  const today = localDateOf(now, profile.timezone)

  return withUser(profile.id, async (tx) => {
    const promise = await selectPrimaryPromise(tx, profile.id)
    if (!promise) return { alreadyCheckedIn: false, earnedFreeze: false }

    const coverage = await applyPendingFreezes(tx, promise.id, profile, today)

    const inserted = await tx
      .insert(checkins)
      .values({ promise_id: promise.id, local_date: today })
      .onConflictDoNothing()
      .returning({ id: checkins.id })

    // Already checked in today. No new row means no freeze is earned either.
    if (inserted.length === 0) {
      return { alreadyCheckedIn: true, earnedFreeze: false }
    }

    const { current } = calculateStreak({
      checkinDates: [...coverage.checkinDates, today],
      frozenDates: coverage.frozenDates,
      today,
    })

    const nextBalance = earnedFreezeBalance(current, coverage.freezeBalance)
    if (nextBalance === coverage.freezeBalance) {
      return { alreadyCheckedIn: false, earnedFreeze: false }
    }

    await tx
      .update(users)
      .set({ streak_freezes_balance: nextBalance })
      .where(eq(users.id, profile.id))

    return { alreadyCheckedIn: false, earnedFreeze: true }
  })
}

/**
 * The public view of a promise. Read-only on purpose: an anonymous visitor
 * must never trigger a write, so due freezes are not spent here.
 */
export async function getPublicPromiseView(
  profile: PublicProfile,
  now: Date = new Date(),
): Promise<PublicPromiseView | null> {
  const today = localDateOf(now, profile.timezone)

  return withAnon(async (tx) => {
    // Under the anon role a private promise simply is not returned.
    const promise = await selectPrimaryPromise(tx, profile.id)
    if (!promise) return null

    const checkinDates = await selectCheckinDates(tx, promise.id)
    const frozenDates = await selectFrozenDates(tx, promise.id)

    const { current, best } = calculateStreak({
      checkinDates,
      frozenDates,
      today,
    })

    return {
      title: promise.title,
      visibility: promise.visibility,
      today,
      currentStreak: current,
      bestStreak: best,
      startedOn: earliest(checkinDates),
      recentCheckins: withinChainWindow(checkinDates, today),
      recentFrozen: withinChainWindow(frozenDates, today),
    }
  })
}
```

- [ ] **Step 2: Проверить компиляцию**

Run: `npx tsc --noEmit`
Expected: без ошибок в `src/lib/dal/promise.ts`.

- [ ] **Step 3: Коммит**

```bash
git add src/lib/dal/promise.ts
git commit -m "feat: add data access layer for promises, check-ins and freezes"
```

---

### Task 9a: Дизайн-система

**Files:**
- Rewrite: `src/app/globals.css`
- Create: `src/app/nes-theme.css`
- Rewrite: `src/app/layout.tsx`
- Create: `src/app/theme-actions.ts`
- Create: `src/lib/theme.ts`
- Create: `src/components/ui/panel.tsx`
- Create: `src/components/ui/pixel-button.tsx`
- Create: `src/components/ui/field.tsx`
- Create: `src/components/ui/theme-toggle.tsx`

**Interfaces:**
- Consumes: ничего
- Produces:
  - токены `--color-bg`, `--color-panel`, `--color-ink`, `--color-ink-muted`, `--color-edge`, `--color-streak`, `--color-freeze`, `--color-miss`, `--color-empty`
  - утилиты Tailwind `bg-bg`, `bg-panel`, `text-ink`, `text-ink-muted`, `border-edge`, `text-streak`, `bg-streak`, `bg-freeze`, `bg-miss`, `bg-empty`
  - `setTheme(theme: 'light' | 'dark'): Promise<void>` в `src/app/theme-actions.ts`
  - `type Theme = 'light' | 'dark'` и `readThemeCookie(): Promise<Theme | null>` в `src/lib/theme.ts` — единственное место чтения куки темы, его используют корневой layout и все четыре страницы с шапкой
  - `Panel({ title?, children, className? })` — default export `src/components/ui/panel.tsx`
  - `PixelButton({ variant?, full?, ...buttonProps })` — default export, и `pixelButtonClass(variant?, full?): string` — named export `src/components/ui/pixel-button.tsx`
  - `Field({ id, label, hint?, error?, children })` — default export `src/components/ui/field.tsx`
  - `ThemeToggle({ stored })` — default export `src/components/ui/theme-toggle.tsx`

**Контекст.** Разбирается дефект, из-за которого тёмная тема сейчас недостижима в принципе.

`node_modules/nes.css/css/nes.min.css` не содержит ни одного `@layer`, а Tailwind 4 объявляет `@layer theme, base, components, utilities` и кладёт туда всё своё. По каскаду **нелейерные правила выигрывают у лейерных** независимо от специфичности и порядка подключения. Проверить можно так:

```bash
grep -c "@layer" node_modules/nes.css/css/nes.min.css   # 0
grep -o "\.nes-btn{[^}]*}" node_modules/nes.css/css/nes.min.css | grep -o "background-color:#fff"
```

`.nes-btn` жёстко задаёт `color:#212529;background-color:#fff` и перебивает любую Tailwind-утилиту. Плюс NES.css тащит внутри себя Bootstrap Reboot v4.1.3, который подключается после Tailwind и переопределяет его preflight, и подменяет системный курсор base64-картинкой.

Лечится одной строкой: импортом NES.css **в слой**.

Тема живёт в куке и попадает в серверный HTML атрибутом `data-theme`. Это даёт переключатель без мигания при загрузке и без блокирующего inline-скрипта. Медиазапрос `prefers-color-scheme` обслуживает первый визит, атрибут перебивает его в обе стороны — пользователь с системной тёмной темой может выбрать светлую.

Пиксельная сетка отдельных токенов не требует: дефолтная шкала отступов Tailwind (`--spacing: 0.25rem`) — это уже шаг 4px.

- [ ] **Step 1: Переписать `globals.css`**

Заменить содержимое `src/app/globals.css`:

```css
/*
 * Layer order is the whole point of this file. NES.css ships unlayered, and
 * unlayered rules beat layered ones no matter the specificity, so without
 * `layer(nes)` every Tailwind utility loses to it.
 */
@layer theme, base, nes, components, utilities;

@import "tailwindcss";
@import "nes.css/css/nes.min.css" layer(nes);
@import "./nes-theme.css" layer(components);

@theme {
  --font-pixel: var(--font-press-start), "Courier New", monospace;
  --font-sans: var(--font-pixel);
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Light theme. Dark values override these variables further down. */
  --color-bg: #ebe9e4;
  --color-panel: #ffffff;
  --color-ink: #1a1d21;
  --color-ink-muted: #5b6169;
  --color-edge: #1a1d21;
  --color-streak: #b3341c;
  --color-freeze: #1c5f8f;
  --color-miss: #b9bec4;
  --color-empty: #dfe1e4;
}

@layer base {
  :root {
    color-scheme: light;
  }

  /*
   * The dark palette is written twice on purpose: a media query cannot join a
   * selector list. The media rule covers the first visit, the attribute rule
   * lets an explicit choice win in either direction. Keep the two in sync.
   */
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      color-scheme: dark;
      --color-bg: #14171a;
      --color-panel: #21262b;
      --color-ink: #f2f4f6;
      --color-ink-muted: #a3acb5;
      --color-edge: #f2f4f6;
      --color-streak: #ff6b4a;
      --color-freeze: #5cb8e8;
      --color-miss: #3a4148;
      --color-empty: #2a3036;
    }
  }

  :root[data-theme="dark"] {
    color-scheme: dark;
    --color-bg: #14171a;
    --color-panel: #21262b;
    --color-ink: #f2f4f6;
    --color-ink-muted: #a3acb5;
    --color-edge: #f2f4f6;
    --color-streak: #ff6b4a;
    --color-freeze: #5cb8e8;
    --color-miss: #3a4148;
    --color-empty: #2a3036;
  }

  body {
    font-family: var(--font-pixel);
  }
}

@layer components {
  /*
   * The chain. `--chain-n` comes from the component so CHAIN_DAYS stays a
   * single source of truth; the nth-child count cannot take a variable, so 16
   * is CHAIN_DAYS - CHAIN_DAYS_COMPACT and must be updated alongside them.
   *
   * The trimming applies only to full-length chains, marked with
   * `data-responsive`. A shorter chain — the ten-day illustration on the
   * landing page, for instance — would otherwise vanish entirely.
   */
  .chain {
    display: grid;
    grid-template-columns: repeat(var(--chain-n), minmax(0, 1fr));
    gap: 2px;
  }

  .chain[data-responsive] > li:nth-child(-n + 16) {
    display: none;
  }

  @media (width >= 40rem) {
    .chain {
      grid-template-columns: repeat(var(--chain-n-sm), minmax(0, 1fr));
      gap: 4px;
    }

    .chain[data-responsive] > li:nth-child(-n + 16) {
      display: block;
    }
  }

  .chain > li[data-today][data-state="checked"] {
    animation: chain-pop 320ms steps(4, end) 1;
  }

  @keyframes chain-pop {
    from {
      transform: scale(0.2);
    }
    to {
      transform: scale(1);
    }
  }

  /*
   * The avatar. `.nes-mario` is a fixed 84x96 sprite, so it can only be
   * resized with a transform — which is safe here because the wrapper's own
   * width and height already account for the scale.
   */
  .avatar-stage {
    --sprite-w: 84px;
    --sprite-h: 96px;
    --sprite-scale: 0.667;
    position: relative;
    width: calc(var(--sprite-w) * var(--sprite-scale));
    height: calc(var(--sprite-h) * var(--sprite-scale));
  }

  @media (width >= 40rem) {
    .avatar-stage {
      --sprite-scale: 1;
    }
  }

  .avatar-stage > .nes-mario {
    position: absolute;
    top: 0;
    left: 0;
    transform: scale(var(--sprite-scale));
    transform-origin: top left;
  }

  .avatar-stage[data-stage="dormant"] > .nes-mario {
    filter: grayscale(1);
    opacity: 0.45;
  }

  .avatar-stage[data-stage="running"],
  .avatar-stage[data-stage="blazing"],
  .avatar-stage[data-stage="crowned"] {
    animation: avatar-hop 700ms steps(2, end) infinite;
  }

  .avatar-stage[data-stage="blazing"],
  .avatar-stage[data-stage="crowned"] {
    box-shadow: 0 0 0 4px var(--color-streak);
  }

  .avatar-stage[data-stage="crowned"]::before {
    content: "";
    position: absolute;
    inset-inline: 25%;
    top: -10px;
    height: 6px;
    background-color: var(--color-streak);
  }

  @keyframes avatar-hop {
    0%,
    100% {
      translate: 0 0;
    }
    50% {
      translate: 0 -4px;
    }
  }
}
```

- [ ] **Step 2: Написать `nes-theme.css`**

Создать `src/app/nes-theme.css`:

```css
/*
 * The only place NES.css is overridden. Everything here relies on globals.css
 * importing NES.css into the `nes` layer, which sits below `components`.
 */

.nes-container {
  padding: 1rem;
  color: var(--color-ink);
  background-color: var(--color-panel);
  border-color: var(--color-edge);
}

@media (width >= 40rem) {
  .nes-container {
    padding: 1.5rem 2rem;
  }
}

.nes-container.with-title > .title {
  color: var(--color-ink);
  background-color: var(--color-panel);
}

.nes-btn {
  /* WCAG target size. NES.css ships 6px/8px padding, which lands under 30px. */
  min-height: 44px;
  padding: 0.5rem 1rem;
  color: var(--color-ink);
  background-color: var(--color-panel);
  cursor: pointer;
}

.nes-btn.is-primary {
  color: var(--color-panel);
  background-color: var(--color-freeze);
}

.nes-btn.is-success {
  color: var(--color-panel);
  background-color: var(--color-streak);
}

.nes-input,
.nes-textarea,
.nes-select select {
  color: var(--color-ink);
  background-color: var(--color-panel);
  border-color: var(--color-edge);
}

/*
 * NES.css replaces the system cursor with a base64 PNG on html and on every
 * button. That overrides the user's cursor size and contrast settings, which
 * some people depend on.
 */
html,
.nes-btn,
.nes-input,
.nes-select select {
  cursor: auto;
}

.nes-btn {
  cursor: pointer;
}

:focus-visible {
  outline: 3px solid var(--color-streak);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 3: Написать чтение и запись темы**

Создать `src/lib/theme.ts`:

```ts
import 'server-only'
import { cookies } from 'next/headers'

export type Theme = 'light' | 'dark'

/**
 * The theme the user explicitly chose, or null when they never chose one.
 *
 * A null result means no `data-theme` attribute is rendered, which is exactly
 * what lets the prefers-color-scheme media query decide on a first visit.
 * Every server component that renders the header reads the cookie through
 * here — the parsing rule lives in one place.
 */
export async function readThemeCookie(): Promise<Theme | null> {
  const stored = (await cookies()).get('theme')?.value
  return stored === 'dark' || stored === 'light' ? stored : null
}
```

Создать `src/app/theme-actions.ts`:

```ts
'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export async function setTheme(theme: 'light' | 'dark'): Promise<void> {
  const store = await cookies()

  store.set('theme', theme, {
    maxAge: ONE_YEAR_SECONDS,
    path: '/',
    sameSite: 'lax',
  })

  // The attribute lives on <html> in the root layout, so every route re-renders.
  revalidatePath('/', 'layout')
}
```

- [ ] **Step 4: Переписать корневой layout**

Заменить содержимое `src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import { Press_Start_2P } from 'next/font/google'
import { readThemeCookie } from '@/lib/theme'
import './globals.css'

// The `cyrillic` subset is gone: the interface is English only.
const pressStart2P = Press_Start_2P({
  weight: '400',
  variable: '--font-press-start',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'never-give.app',
  description: 'Promise publicly. Check in daily. Do not break the chain.',
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Reading the cookie here puts data-theme into the initial HTML, so there is
  // no flash of the wrong theme and no blocking inline script.
  //
  // A null theme renders no attribute at all, which is what lets the
  // prefers-color-scheme media query decide on a first visit.
  const theme = await readThemeCookie()

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${pressStart2P.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-bg text-ink">{children}</body>
    </html>
  )
}
```

- [ ] **Step 5: Написать примитивы**

Создать `src/components/ui/panel.tsx`:

```tsx
import type { ReactNode } from 'react'

interface PanelProps {
  title?: string
  className?: string
  children: ReactNode
}

export default function Panel({ title, className = '', children }: PanelProps) {
  return (
    <section
      className={`nes-container ${title ? 'with-title' : ''} ${className}`}
    >
      {title ? <p className="title">{title}</p> : null}
      {children}
    </section>
  )
}
```

Создать `src/components/ui/pixel-button.tsx`:

```tsx
import type { ComponentProps } from 'react'

export type PixelVariant = 'default' | 'primary' | 'success' | 'warning'

const VARIANT_CLASS: Record<PixelVariant, string> = {
  default: '',
  primary: 'is-primary',
  success: 'is-success',
  warning: 'is-warning',
}

/** Shared with links that need to look like buttons. */
export function pixelButtonClass(
  variant: PixelVariant = 'default',
  full = false,
): string {
  return [
    'nes-btn',
    VARIANT_CLASS[variant],
    full ? 'w-full' : '',
    'inline-flex items-center justify-center',
  ]
    .filter(Boolean)
    .join(' ')
}

interface PixelButtonProps extends ComponentProps<'button'> {
  variant?: PixelVariant
  full?: boolean
}

export default function PixelButton({
  variant = 'default',
  full = false,
  className = '',
  type = 'button',
  ...rest
}: PixelButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={`${pixelButtonClass(variant, full)} ${className}`}
    />
  )
}
```

Создать `src/components/ui/field.tsx`:

```tsx
import type { ReactNode } from 'react'

interface FieldProps {
  id: string
  label: string
  hint?: ReactNode
  error?: string
  children: ReactNode
}

/**
 * Renders the label, hint and error around a control.
 *
 * The ids are conventional: the control itself must carry
 * `aria-describedby="<id>-hint <id>-error"` and `aria-invalid` — a wrapper
 * cannot set attributes on a child it does not own.
 */
export default function Field({
  id,
  label,
  hint,
  error,
  children,
}: FieldProps) {
  return (
    <div className="nes-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint ? (
        <span
          id={`${id}-hint`}
          className="mt-2 block font-mono text-xs text-ink-muted"
        >
          {hint}
        </span>
      ) : null}
      {error ? (
        <span
          id={`${id}-error`}
          role="alert"
          className="mt-2 block font-mono text-xs text-streak"
        >
          {error}
        </span>
      ) : null}
    </div>
  )
}
```

Создать `src/components/ui/theme-toggle.tsx`:

```tsx
'use client'

import { useEffect, useState, useTransition } from 'react'
import { setTheme } from '@/app/theme-actions'

// Declared locally on purpose. `src/lib/theme.ts` is marked `server-only`, so
// importing its `Theme` type here would pull a server module into the client
// bundle and fail the build.
type Theme = 'light' | 'dark'

export default function ThemeToggle({ stored }: { stored: Theme | null }) {
  const [effective, setEffective] = useState<Theme | null>(stored)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    // With no cookie the media query decides what is actually on screen, and
    // only the browser knows that.
    if (stored) return
    setEffective(
      window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light',
    )
  }, [stored])

  const next: Theme = effective === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      className="nes-btn"
      aria-label={`Switch to ${next} theme`}
      aria-busy={pending}
      onClick={() => {
        setEffective(next)
        startTransition(() => setTheme(next))
      }}
    >
      {next === 'dark' ? 'DARK' : 'LIGHT'}
    </button>
  )
}
```

- [ ] **Step 6: Проверить компиляцию**

Run: `npx tsc --noEmit && npm run lint`
Expected: без ошибок.

- [ ] **Step 7: Проверить, что каскад починен**

Это главная проверка задачи. Без неё всё остальное — вёрстка поверх сломанного фундамента.

Run: `npm run dev`

Открыть любую страницу, где есть `.nes-btn` (например `/`), в DevTools выбрать кнопку и посмотреть вычисленный `background-color`.

Expected: цвет берётся из `nes-theme.css`, а правило `background-color:#fff` из `nes.min.css` показано **перечёркнутым** как перебитое. Если оно всё ещё побеждает — слой `nes` не применился; в этом случае перенести объявление `@layer theme, base, nes, components, utilities;` **после** `@import "tailwindcss"` и повторить проверку.

Затем в консоли DevTools:

```js
document.documentElement.setAttribute('data-theme', 'dark')
```

Expected: фон страницы и панелей темнеет немедленно, текст остаётся читаемым. Вернуть: `document.documentElement.removeAttribute('data-theme')`.

- [ ] **Step 8: Проверить контраст**

Значения токенов подобраны так, чтобы проходить WCAG AA (4.5:1 для обычного текста). Проверить пипеткой в DevTools или любым калькулятором контраста:

| Пара | Тема | Ожидается |
|---|---|---|
| `--color-ink-muted` на `--color-panel` | светлая | ≈ 6.2:1 |
| `--color-streak` на `--color-panel` | светлая | ≈ 6.1:1 |
| `--color-freeze` на `--color-panel` | светлая | ≈ 6.8:1 |
| `--color-ink-muted` на `--color-panel` | тёмная | ≈ 6.6:1 |
| `--color-streak` на `--color-panel` | тёмная | ≈ 5.4:1 |
| `--color-freeze` на `--color-panel` | тёмная | ≈ 6.9:1 |

Expected: каждая пара не ниже 4.5:1. Если ниже — правится токен, а не отменяется проверка.

- [ ] **Step 9: Коммит**

```bash
git add src/app/globals.css src/app/nes-theme.css src/app/layout.tsx src/app/theme-actions.ts src/lib/theme.ts src/components/ui/
git commit -m "feat: add design tokens, layered NES.css override and theme switching"
```

---

### Task 9b: Доменные компоненты

**Files:**
- Create: `src/components/streak/streak-chain.tsx`
- Create: `src/components/streak/streak-stats.tsx`
- Create: `src/components/streak/freeze-meter.tsx`
- Create: `src/components/streak/avatar-stage.tsx`
- Create: `src/components/layout/app-header.tsx`
- Create: `src/components/layout/app-menu.tsx`
- Create: `src/components/share/share-bar.tsx`
- Create: `src/app/logout-actions.ts`

**Interfaces:**
- Consumes: `Cell`, `CHAIN_DAYS`, `CHAIN_DAYS_COMPACT`, `summarizeChain` из `src/lib/view/chain.ts`; `stageOf`, `daysToNextStage` из `src/lib/view/stage.ts`; `MAX_FREEZE_BALANCE` из `src/lib/streak.ts`; `ThemeToggle`, `pixelButtonClass` из `src/components/ui/`
- Produces:
  - `StreakChain({ cells })` — default export
  - `StreakStats({ current, best })` — default export
  - `FreezeMeter({ balance })` — default export
  - `AvatarStage({ currentStreak })` — default export
  - `AppHeader({ username?, theme })` — default export
  - `ShareBar({ url, title })` — default export
  - `signOut(): Promise<void>` в `src/app/logout-actions.ts`
  - атрибуты `data-testid="current-streak"`, `data-testid="best-streak"`, `data-testid="freeze-balance"`, `data-testid="chain"` — на них опираются E2E-тесты в задаче 14

**Контекст.** Дашборд и публичный профиль показывают одни и те же сущности. Собранные здесь компоненты — единственное место, где они верстаются; страницы в задачах 10 и 12 только компонуют.

Из всего набора клиентские только два: меню и панель шаринга. Цепочка, статы, заморозки и аватар остаются серверными — состояния у них нет.

- [ ] **Step 1: Написать цепочку**

Создать `src/components/streak/streak-chain.tsx`:

```tsx
import type { CSSProperties } from 'react'
import {
  CHAIN_DAYS,
  CHAIN_DAYS_COMPACT,
  summarizeChain,
  type Cell,
} from '@/lib/view/chain'

const STATE_CLASS: Record<Cell['state'], string> = {
  checked: 'bg-streak',
  frozen: 'bg-freeze',
  missed: 'bg-miss',
  empty: 'bg-empty',
}

export default function StreakChain({ cells }: { cells: Cell[] }) {
  const summary = summarizeChain(cells)
  const lastDate = cells.length > 0 ? cells[cells.length - 1].date : null

  // Only a full-length chain gets trimmed below `sm`. A shorter one — the
  // ten-day illustration on the landing page — must render whole at every
  // width, or the CSS rule would hide all of it.
  const responsive = cells.length === CHAIN_DAYS

  // Thirty list items would be thirty announcements. One summary is the point.
  const label =
    `Last ${cells.length} days: ${summary.checked} checked in, ` +
    `${summary.frozen} frozen, ${summary.missed} missed.`

  return (
    <div className="min-w-0">
      <ol
        role="img"
        aria-label={label}
        data-testid="chain"
        data-responsive={responsive ? '' : undefined}
        className="chain"
        style={
          {
            '--chain-n': responsive ? CHAIN_DAYS_COMPACT : cells.length,
            '--chain-n-sm': cells.length,
          } as CSSProperties
        }
      >
        {cells.map((cell) => (
          <li
            key={cell.date}
            aria-hidden="true"
            data-state={cell.state}
            data-today={cell.date === lastDate ? '' : undefined}
            className={`aspect-square border-2 border-edge ${STATE_CLASS[cell.state]}`}
          />
        ))}
      </ol>

      <p
        aria-hidden="true"
        className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-ink-muted"
      >
        <span>
          <span className="mr-1 inline-block size-2 bg-streak align-middle" />
          check-in
        </span>
        <span>
          <span className="mr-1 inline-block size-2 bg-freeze align-middle" />
          freeze
        </span>
        <span>
          <span className="mr-1 inline-block size-2 bg-miss align-middle" />
          missed
        </span>
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Написать статы, заморозки и аватар**

Создать `src/components/streak/streak-stats.tsx`:

```tsx
const NUMBER_CLASS = 'leading-none [font-size:clamp(1.75rem,10vw,3.5rem)]'

interface StreakStatsProps {
  current: number
  best: number
}

export default function StreakStats({ current, best }: StreakStatsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="min-w-0 text-center">
        <p className={`text-streak ${NUMBER_CLASS}`} data-testid="current-streak">
          {current}
        </p>
        <p className="mt-2 font-mono text-xs text-ink-muted">CURRENT</p>
      </div>
      <div className="min-w-0 text-center">
        <p className={NUMBER_CLASS} data-testid="best-streak">
          {best}
        </p>
        <p className="mt-2 font-mono text-xs text-ink-muted">BEST</p>
      </div>
    </div>
  )
}
```

Создать `src/components/streak/freeze-meter.tsx`:

```tsx
import { MAX_FREEZE_BALANCE } from '@/lib/streak'

export default function FreezeMeter({ balance }: { balance: number }) {
  const pips = Array.from({ length: MAX_FREEZE_BALANCE }, (_, index) =>
    index < balance ? '*' : '-',
  ).join(' ')

  return (
    <p className="font-mono text-xs text-ink-muted">
      FREEZES{' '}
      <span aria-hidden="true" className="text-freeze">
        {pips}
      </span>
      <span className="sr-only">
        <span data-testid="freeze-balance">{balance}</span> of{' '}
        {MAX_FREEZE_BALANCE} available
      </span>
    </p>
  )
}
```

Создать `src/components/streak/avatar-stage.tsx`:

```tsx
import { daysToNextStage, stageOf } from '@/lib/view/stage'

export default function AvatarStage({ currentStreak }: { currentStreak: number }) {
  const stage = stageOf(currentStreak)
  const remaining = daysToNextStage(currentStreak)

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="avatar-stage" data-stage={stage} data-testid="avatar">
        <i className="nes-mario" aria-hidden="true" />
      </div>
      <p className="font-mono text-xs text-ink-muted">
        {remaining === null
          ? 'Final form reached.'
          : `${remaining} more ${remaining === 1 ? 'day' : 'days'} to the next form.`}
      </p>
    </div>
  )
}
```

- [ ] **Step 3: Написать выход из аккаунта**

Создать `src/app/logout-actions.ts`:

```ts
'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()

  // Outside any try/catch: redirect() throws a control-flow exception.
  redirect('/')
}
```

- [ ] **Step 4: Написать шапку и меню**

Создать `src/components/layout/app-menu.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { signOut } from '@/app/logout-actions'

export default function AppMenu({ username }: { username: string }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        className="nes-btn"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        onClick={() => setOpen((value) => !value)}
      >
        MENU
      </button>

      {open ? (
        <div
          role="menu"
          className="nes-container absolute right-0 z-10 mt-2 flex w-56 flex-col gap-2"
        >
          <Link
            role="menuitem"
            href={`/${username}`}
            className="font-mono text-xs underline"
          >
            View public profile
          </Link>
          <form action={signOut}>
            <button
              role="menuitem"
              type="submit"
              className="font-mono text-xs underline"
            >
              Log out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  )
}
```

Создать `src/components/layout/app-header.tsx`:

```tsx
import Link from 'next/link'
import ThemeToggle from '@/components/ui/theme-toggle'
import AppMenu from './app-menu'

interface AppHeaderProps {
  /** Omitted for signed-out visitors: there is no menu to show them. */
  username?: string
  theme: 'light' | 'dark' | null
}

export default function AppHeader({ username, theme }: AppHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <Link href="/" className="min-w-0 truncate">
        never-give.app
      </Link>

      <div className="flex items-center gap-2">
        {username ? (
          <span className="hidden font-mono text-xs text-ink-muted sm:inline">
            @{username}
          </span>
        ) : null}
        <ThemeToggle stored={theme} />
        {username ? <AppMenu username={username} /> : null}
      </div>
    </header>
  )
}
```

- [ ] **Step 5: Написать панель шаринга**

Создать `src/components/share/share-bar.tsx`:

```tsx
'use client'

import { useState } from 'react'
import PixelButton from '@/components/ui/pixel-button'

interface ShareBarProps {
  url: string
  title: string
}

export default function ShareBar({ url, title }: ShareBarProps) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be denied. The links below still work.
      setCopied(false)
    }
  }

  async function share() {
    // navigator.share exists mostly on mobile; elsewhere fall back to copying.
    if (typeof navigator.share !== 'function') return copy()

    try {
      await navigator.share({ title, url })
    } catch {
      // The user dismissed the sheet. Nothing to do.
    }
  }

  const text = encodeURIComponent(title)
  const target = encodeURIComponent(url)

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <PixelButton variant="primary" onClick={share}>
        SHARE
      </PixelButton>
      <PixelButton onClick={copy} aria-live="polite">
        {copied ? 'COPIED' : 'COPY LINK'}
      </PixelButton>
      <a
        className="nes-btn inline-flex items-center justify-center"
        href={`https://x.com/intent/tweet?text=${text}&url=${target}`}
        target="_blank"
        rel="noreferrer noopener"
      >
        X
      </a>
      <a
        className="nes-btn inline-flex items-center justify-center"
        href={`https://t.me/share/url?url=${target}&text=${text}`}
        target="_blank"
        rel="noreferrer noopener"
      >
        TG
      </a>
    </div>
  )
}
```

- [ ] **Step 6: Проверить компиляцию**

Run: `npx tsc --noEmit && npm run lint`
Expected: без ошибок.

- [ ] **Step 7: Коммит**

```bash
git add src/components/ src/app/logout-actions.ts
git commit -m "feat: add streak, layout and share components"
```

---

### Task 10: Дашборд

**Files:**
- Rewrite: `src/app/dashboard/page.tsx`
- Create: `src/app/dashboard/actions.ts`
- Create: `src/app/dashboard/checkin-form.tsx`
- Create: `src/app/dashboard/error.tsx`

**Interfaces:**
- Consumes: `requireSessionUser` из `src/lib/dal/session.ts`; `getProfile` из `src/lib/dal/user.ts`; `getOwnPromiseView`, `checkIn` из `src/lib/dal/promise.ts`; `buildChain` из `src/lib/view/chain.ts`; `AppHeader`, `Panel`, `PixelButton`, `AvatarStage`, `FreezeMeter`, `StreakChain`, `StreakStats` из `src/components/`
- Produces:
  - `type CheckInState = { status: 'idle' } | { status: 'ok'; earnedFreeze: boolean } | { status: 'error'; message: string }`
  - `checkInAction(prevState: CheckInState, formData: FormData): Promise<CheckInState>`
  - `CheckInForm({ checkedInToday, timezone })` — default export

**Контекст.** Чинятся дефекты 1.1, 1.2, 1.3, 1.6 из [known-issues.md](../../known-issues.md). Ключевые изменения:

- `redirect()` выносится **из** `try`/`catch` — сейчас `catch` его глотает, и новый пользователь вместо онбординга видит фейковый дашборд
- фиктивные данные при сбое БД убираются: исключение доходит до `error.tsx`
- локальная копия `calculateStreak` удаляется, расчёт берётся из DAL
- server action переезжает в отдельный файл: инлайн-замыкание над `dbPromise` и `dbUser` было ещё одним источником рассинхронизации

Раскладка — одна колонка `max-w-[42rem]` на всех ширинах ([спека §4.2](../specs/2026-08-06-frontend-design.md)). Порядок блоков: обещание → аватар → статы → кнопка → цепочка → заморозки. Кнопка стоит выше цепочки намеренно: так она попадает в первый экран на 320px без прокрутки.

Кнопка с `disabled` заменяется на **другую разметку**: если отмечаться уже не нужно, действия нет, значит нет и кнопки. `disabled`-кнопка выпадает из порядка табуляции и не сообщает причину.

- [ ] **Step 1: Написать server action**

Создать `src/app/dashboard/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/dal/user'
import { checkIn } from '@/lib/dal/promise'

export type CheckInState =
  | { status: 'idle' }
  | { status: 'ok'; earnedFreeze: boolean }
  | { status: 'error'; message: string }

/**
 * Records today's check-in.
 *
 * Server Actions are reachable by direct POST, not only through the UI, so
 * authorization is re-established here rather than trusted from the page.
 *
 * Failures are returned, not thrown: a thrown error would replace the whole
 * dashboard with the error boundary over what is a retryable hiccup.
 */
export async function checkInAction(
  _prevState: CheckInState,
  _formData: FormData,
): Promise<CheckInState> {
  const profile = await getProfile()
  if (!profile) return { status: 'error', message: 'Please sign in again.' }

  try {
    const result = await checkIn(profile)

    revalidatePath('/dashboard')
    revalidatePath(`/${profile.username}`)

    return { status: 'ok', earnedFreeze: result.earnedFreeze }
  } catch (error) {
    console.error('Check-in failed', error)
    return { status: 'error', message: 'Could not check in. Please try again.' }
  }
}
```

- [ ] **Step 2: Написать границу ошибок**

Создать `src/app/dashboard/error.tsx`:

```tsx
'use client' // Error boundaries must be Client Components

import { useEffect } from 'react'
import Panel from '@/components/ui/panel'
import PixelButton from '@/components/ui/pixel-button'

export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="mx-auto flex w-full max-w-[42rem] flex-col gap-6 p-4 sm:p-8">
      <Panel
        title="GAME OVER"
        className="flex flex-col items-center gap-6 text-center"
      >
        <p className="font-mono text-sm">
          We could not load your quest. This is on us, not on your streak.
        </p>
        <PixelButton variant="warning" onClick={() => retry()}>
          Try again
        </PixelButton>
      </Panel>
    </main>
  )
}
```

Проп называется `retry`, а не `reset` — это изменение Next.js 16.

- [ ] **Step 3: Написать форму чек-ина**

Создать `src/app/dashboard/checkin-form.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import PixelButton from '@/components/ui/pixel-button'
import { checkInAction, type CheckInState } from './actions'

const INITIAL_STATE: CheckInState = { status: 'idle' }

interface CheckInFormProps {
  checkedInToday: boolean
  timezone: string
}

export default function CheckInForm({
  checkedInToday,
  timezone,
}: CheckInFormProps) {
  const [state, action, pending] = useActionState(checkInAction, INITIAL_STATE)

  // No action to offer means no button. A disabled button leaves the tab order
  // and announces nothing about why it is unavailable.
  //
  // The wording says "after midnight" rather than counting hours down: an hour
  // count rendered on the server goes stale on screen until the next
  // revalidation, while midnight in the user's own timezone is always true.
  if (checkedInToday) {
    return (
      <div className="w-full text-center">
        <p role="status" className="border-4 border-edge p-3">
          DONE FOR TODAY
        </p>
        <p className="mt-2 font-mono text-xs text-ink-muted">
          Next check-in after midnight ({timezone}).
        </p>
        {state.status === 'ok' && state.earnedFreeze ? (
          <p role="status" className="mt-2 font-mono text-xs text-freeze">
            +1 FREEZE
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <form action={action} className="w-full text-center">
      <PixelButton type="submit" variant="success" full aria-busy={pending}>
        {pending ? 'CHECKING IN...' : 'CHECK IN TODAY'}
      </PixelButton>
      {state.status === 'error' ? (
        <p role="alert" className="mt-2 font-mono text-xs text-streak">
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
```

После успешного чек-ина `revalidatePath` перерисовывает страницу, `checkedInToday` становится `true`, и компонент переключается на вторую ветку. Состояние `useActionState` при этом сохраняется — поэтому `+1 FREEZE` виден именно там.

- [ ] **Step 4: Переписать страницу**

Заменить содержимое `src/app/dashboard/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import AppHeader from '@/components/layout/app-header'
import AvatarStage from '@/components/streak/avatar-stage'
import FreezeMeter from '@/components/streak/freeze-meter'
import StreakChain from '@/components/streak/streak-chain'
import StreakStats from '@/components/streak/streak-stats'
import Panel from '@/components/ui/panel'
import { requireSessionUser } from '@/lib/dal/session'
import { getProfile } from '@/lib/dal/user'
import { getOwnPromiseView } from '@/lib/dal/promise'
import { readThemeCookie } from '@/lib/theme'
import { buildChain } from '@/lib/view/chain'
import CheckInForm from './checkin-form'

export default async function DashboardPage() {
  await requireSessionUser()

  const profile = await getProfile()

  // redirect() throws a control-flow exception, so it must stay outside any
  // try/catch. A swallowed redirect is what used to strand new users here.
  if (!profile) redirect('/onboarding')

  const promise = await getOwnPromiseView(profile)
  if (!promise) redirect('/onboarding')

  const theme = await readThemeCookie()

  const cells = buildChain({
    today: promise.today,
    checkinDates: promise.recentCheckins,
    frozenDates: promise.recentFrozen,
    startedOn: promise.startedOn,
  })

  return (
    <main className="mx-auto flex w-full max-w-[42rem] flex-col gap-6 p-4 sm:p-8">
      <AppHeader username={profile.username} theme={theme} />

      <Panel title="ACTIVE QUEST" className="flex flex-col items-center gap-6">
        <h1 className="min-w-0 text-balance text-center [font-size:clamp(0.75rem,3.5vw,1.25rem)] [overflow-wrap:anywhere]">
          {promise.title}
        </h1>

        <AvatarStage currentStreak={promise.currentStreak} />

        <div className="w-full">
          <StreakStats
            current={promise.currentStreak}
            best={promise.bestStreak}
          />
        </div>

        <CheckInForm
          checkedInToday={promise.checkedInToday}
          timezone={profile.timezone}
        />

        <div className="w-full">
          <StreakChain cells={cells} />
        </div>

        {promise.startedOn === null ? (
          <p className="font-mono text-xs text-ink-muted">
            Your chain starts today.
          </p>
        ) : null}

        {promise.startedOn !== null &&
        promise.currentStreak === 0 &&
        promise.bestStreak > 0 ? (
          <p className="font-mono text-xs text-ink-muted">
            Your chain broke at {promise.bestStreak} days. Start again.
          </p>
        ) : null}

        <FreezeMeter balance={promise.freezeBalance} />
      </Panel>

      <p className="text-center">
        <Link
          href={`/${profile.username}`}
          className="font-mono text-xs underline"
        >
          View public profile
        </Link>
      </p>
    </main>
  )
}
```

`profile.avatarLevel` больше не выводится: механики прокачки нет и в MVP не будет ([known-issues.md 1.14](../../known-issues.md)). Стадию аватара определяет длина стрика.

- [ ] **Step 5: Проверить компиляцию и сборку**

Run: `npx tsc --noEmit && npm run lint`
Expected: без ошибок в `src/app/dashboard/`.

- [ ] **Step 6: Проверить вручную**

Run: `npm run dev`

Открыть `http://localhost:3000/dashboard` под существующим пользователем.

Ожидается:

- экран отрисован, кнопка чек-ина активна;
- нажатие увеличивает текущий стрик на 1, последнее звено цепочки коротко проявляется, вместо кнопки появляется `DONE FOR TODAY` с указанием таймзоны;
- повторная перезагрузка стрик не меняет.

Затем в DevTools включить эмуляцию мобильного и проверить ширины **320, 375, 768, 1280**. На каждой:

- горизонтальной прокрутки нет;
- цепочка показывает 14 клеток ниже 640px и 30 от 640px;
- кнопка чек-ина видна без прокрутки на 320px.

Проверить переключатель темы: обе темы читаемы, выбор переживает перезагрузку страницы.

- [ ] **Step 7: Коммит**

```bash
git add src/app/dashboard/
git commit -m "fix: rebuild dashboard on the data access layer"
```

---

### Task 11: Онбординг

**Files:**
- Rewrite: `src/app/onboarding/page.tsx`
- Create: `src/app/onboarding/actions.ts`
- Create: `src/app/onboarding/onboarding-form.tsx`
- Modify: `src/lib/dal/promise.ts`

**Interfaces:**
- Consumes: `requireSessionUser` из `src/lib/dal/session.ts`; `getProfile` из `src/lib/dal/user.ts`; `validateUsername` из `src/lib/validation.ts`
- Produces:
  - `createProfileAndPromise(session: SessionUser, input: OnboardingInput): Promise<OnboardingError | null>` в `src/lib/dal/promise.ts`
  - `type OnboardingError = 'invalid_username' | 'reserved_username' | 'username_taken' | 'empty_promise' | 'promise_too_long' | 'unknown'`
  - `interface OnboardingState { error?: string }`
  - `completeOnboarding(prevState: OnboardingState, formData: FormData): Promise<OnboardingState>`

**Контекст.** Чинятся дефекты 1.4 и 1.5 из [known-issues.md](../../known-issues.md). Сейчас занятый username даёт `catch` → `return`, и форма молча ничего не делает. Плюс апсерт идёт с целью конфликта `email` вместо `id`, из-за чего `users.id` может разойтись с `auth.users.id` и сломать все политики RLS.

Ошибки моделируются возвращаемым значением, а не исключением — так рекомендует документация Next.js по обработке ожидаемых ошибок. Форма читает их через `useActionState`.

- [ ] **Step 1: Добавить создание профиля в DAL**

Дописать в конец `src/lib/dal/promise.ts`:

```ts
export type OnboardingError =
  | 'invalid_username'
  | 'reserved_username'
  | 'username_taken'
  | 'empty_promise'
  | 'promise_too_long'
  | 'unknown'

export interface OnboardingInput {
  username: string
  promiseTitle: string
  visibility: string
  timezone: string
}

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = '23505'

/**
 * The constraint a unique violation tripped, or null when the error is
 * something else. postgres-js exposes it as `constraint_name`.
 */
function violatedConstraint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null

  const candidate = error as { code?: unknown; constraint_name?: unknown }
  if (candidate.code !== UNIQUE_VIOLATION) return null

  return typeof candidate.constraint_name === 'string'
    ? candidate.constraint_name
    : ''
}

/**
 * Creates the user's profile row and their first promise.
 *
 * `users.id` is set from the verified auth id and the conflict target is `id`,
 * not `email`: a row whose id drifts from auth.users.id is invisible to every
 * RLS policy.
 */
export async function createProfileAndPromise(
  session: { id: string; email: string },
  input: OnboardingInput,
): Promise<OnboardingError | null> {
  const usernameError = validateUsername(input.username)
  if (usernameError === 'invalid_format') return 'invalid_username'
  if (usernameError === 'reserved') return 'reserved_username'

  const titleError = validatePromiseTitle(input.promiseTitle)
  if (titleError === 'empty') return 'empty_promise'
  if (titleError === 'too_long') return 'promise_too_long'

  const title = input.promiseTitle.trim()

  const visibility = input.visibility === 'unlisted' ? 'unlisted' : 'public'

  try {
    await withUser(session.id, async (tx) => {
      await tx
        .insert(users)
        .values({
          id: session.id,
          email: session.email,
          username: input.username,
          timezone: input.timezone,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: { username: input.username, timezone: input.timezone },
        })

      await tx.insert(promises).values({
        user_id: session.id,
        title,
        visibility,
        cadence: 'daily',
        status: 'active',
      })
    })
  } catch (error) {
    const constraint = violatedConstraint(error)

    // Both the plain unique constraint and the case-insensitive index count
    // as "taken". An email collision is a different problem and must not be
    // reported as a username one.
    if (constraint !== null && constraint.includes('username')) {
      return 'username_taken'
    }

    console.error('Failed to complete onboarding', error)
    return 'unknown'
  }

  return null
}
```

Добавить в импорты в начале `src/lib/dal/promise.ts`:

```ts
import { validatePromiseTitle, validateUsername } from '@/lib/validation'
```

- [ ] **Step 2: Написать server action**

Создать `src/app/onboarding/actions.ts`:

```ts
'use server'

import { redirect } from 'next/navigation'
import { requireSessionUser } from '@/lib/dal/session'
import {
  createProfileAndPromise,
  type OnboardingError,
} from '@/lib/dal/promise'
import { PROMISE_MAX_LENGTH } from '@/lib/validation'

export interface OnboardingState {
  error?: string
}

const MESSAGES: Record<OnboardingError, string> = {
  invalid_username:
    'Username must be 3-20 characters: letters, digits, underscore.',
  reserved_username: 'That username is reserved. Pick another one.',
  username_taken: 'This username is already taken.',
  empty_promise: 'Describe what you are committing to.',
  promise_too_long: `Keep it under ${PROMISE_MAX_LENGTH} characters.`,
  unknown: 'Something went wrong. Please try again.',
}

export async function completeOnboarding(
  _prevState: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const session = await requireSessionUser()

  const error = await createProfileAndPromise(session, {
    username: String(formData.get('username') ?? ''),
    promiseTitle: String(formData.get('promise') ?? ''),
    visibility: String(formData.get('visibility') ?? 'public'),
    timezone: String(formData.get('timezone') || 'UTC'),
  })

  if (error) return { error: MESSAGES[error] }

  // Outside any try/catch: redirect() throws a control-flow exception.
  redirect('/dashboard')
}
```

- [ ] **Step 3: Написать клиентскую форму**

Создать `src/app/onboarding/onboarding-form.tsx`:

```tsx
'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import Field from '@/components/ui/field'
import PixelButton from '@/components/ui/pixel-button'
import { PROMISE_MAX_LENGTH } from '@/lib/validation'
import { completeOnboarding, type OnboardingState } from './actions'

const INITIAL_STATE: OnboardingState = {}

export default function OnboardingForm() {
  const [state, action, pending] = useActionState(
    completeOnboarding,
    INITIAL_STATE,
  )
  const timezoneRef = useRef<HTMLInputElement>(null)
  const [username, setUsername] = useState('')
  const [promiseLength, setPromiseLength] = useState(0)

  useEffect(() => {
    if (timezoneRef.current) {
      timezoneRef.current.value =
        Intl.DateTimeFormat().resolvedOptions().timeZone
    }
  }, [])

  return (
    <form action={action} className="flex flex-col gap-6">
      {state.error ? (
        <p role="alert" className="font-mono text-xs text-streak">
          {state.error}
        </p>
      ) : null}

      <Field
        id="username"
        label="Choose a username"
        hint={`never-give.app/${username || 'username'}`}
      >
        <input
          type="text"
          id="username"
          name="username"
          className="nes-input"
          required
          minLength={3}
          maxLength={20}
          pattern="[a-zA-Z0-9_]+"
          autoComplete="off"
          title="Letters, digits and underscores, 3-20 characters"
          aria-describedby="username-hint"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </Field>

      <Field
        id="promise"
        label="Your main promise"
        hint={`${promiseLength} / ${PROMISE_MAX_LENGTH}`}
      >
        <input
          type="text"
          id="promise"
          name="promise"
          className="nes-input"
          placeholder="e.g. Code every day"
          required
          maxLength={PROMISE_MAX_LENGTH}
          aria-describedby="promise-hint"
          onChange={(event) => setPromiseLength(event.target.value.length)}
        />
      </Field>

      <Field id="visibility" label="Profile visibility">
        <div className="nes-select">
          <select
            required
            id="visibility"
            name="visibility"
            defaultValue="public"
          >
            <option value="public">Public (recommended)</option>
            <option value="unlisted">Unlisted (link only)</option>
          </select>
        </div>
      </Field>

      <input type="hidden" name="timezone" ref={timezoneRef} defaultValue="UTC" />

      <PixelButton type="submit" variant="primary" full aria-busy={pending}>
        {pending ? 'STARTING...' : 'START GAME'}
      </PixelButton>
    </form>
  )
}
```

Селект видимости предлагает только `public` и `unlisted`. Значение `private` обрабатывается кодом и политиками, но в онбординге не выбирается — [product-spec.md §5](../../product-spec.md).

Живой проверки занятости ника здесь **нет**, и это осознанно. Такая проверка требует чтения чужих строк `users`, что RLS запрещает по построению; корректная реализация — функция `SECURITY DEFINER` в Postgres с отдельным грантом, то есть новая миграция ради косметики. Занятый ник и так даёт внятное сообщение при отправке (задача 11 именно это и чинит).

Таймзона проставляется в `useEffect`, а не инлайновым `<script>`: прежний вариант зависел от порядка выполнения скрипта и молча оставлял пустое значение, если форма отправлялась раньше.

- [ ] **Step 4: Переписать страницу**

Заменить содержимое `src/app/onboarding/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import Panel from '@/components/ui/panel'
import { requireSessionUser } from '@/lib/dal/session'
import { getProfile } from '@/lib/dal/user'
import { getOwnPromiseView } from '@/lib/dal/promise'
import OnboardingForm from './onboarding-form'

export default async function OnboardingPage() {
  await requireSessionUser()

  const profile = await getProfile()

  // Onboarding is only complete once BOTH the profile and its first promise
  // exist. Redirecting on the profile alone would bounce a user with no
  // promise between here and /dashboard forever.
  if (profile) {
    const promise = await getOwnPromiseView(profile)

    // Outside any try/catch: redirect() throws a control-flow exception.
    if (promise) redirect('/dashboard')
  }

  return (
    <main className="mx-auto flex w-full max-w-[42rem] flex-col gap-6 p-4 sm:p-8">
      <Panel title="WELCOME, PLAYER 1">
        <OnboardingForm />
      </Panel>
    </main>
  )
}
```

- [ ] **Step 5: Проверить компиляцию**

Run: `npx tsc --noEmit && npm run lint`
Expected: без ошибок.

- [ ] **Step 6: Проверить вручную**

Run: `npm run dev`

Зарегистрировать нового пользователя через `/login`. Ожидается: редирект на `/onboarding`. Ввести username, который уже занят, — форма показывает `This username is already taken.` и остаётся на месте. Ввести `dashboard` — показывает `That username is reserved. Pick another one.` Ввести свободный — редирект на `/dashboard`.

- [ ] **Step 7: Коммит**

```bash
git add src/app/onboarding/ src/lib/dal/promise.ts
git commit -m "fix: surface onboarding errors and key the upsert on auth id"
```

---

### Task 12: Публичный профиль

**Files:**
- Rewrite: `src/app/[username]/page.tsx`
- Create: `src/app/[username]/not-found.tsx`

**Interfaces:**
- Consumes: `getPublicProfile` из `src/lib/dal/user.ts`; `getPublicPromiseView` из `src/lib/dal/promise.ts`; `buildChain` из `src/lib/view/chain.ts`; `AppHeader`, `ShareBar`, `AvatarStage`, `StreakChain`, `StreakStats`, `Panel`, `pixelButtonClass` из `src/components/`
- Produces: атрибуты `data-testid="current-streak"`, `data-testid="best-streak"`, `data-testid="chain"` — те же, что на дашборде

**Контекст.** Чинятся дефекты 1.2, 1.3, 1.6 из [known-issues.md](../../known-issues.md). Копия `calculateStreak` удаляется вместе с UTC-расчётом; подмена фиктивными данными (`test` / `Read 10 pages`) убирается; `notFound()` выносится из `try`/`catch`.

Появляется **панель шаринга**, которой не было вовсе — при том что расшаренная ссылка заявлена единственным каналом дистрибуции ([product-spec.md §1](../../product-spec.md)).

Два отличия от дашборда, оба намеренные ([спека §4.3](../specs/2026-08-06-frontend-design.md)):

- **кнопки чек-ина нет** — профиль чужой;
- **остаток заморозок не показывается.** Замороженные дни в цепочке видны: это часть честной летописи. Остаток баланса — тактическая информация владельца, и `PublicPromiseView` его вообще не содержит.

Шапка рендерится без `username`: посетитель не обязан быть авторизованным, поэтому меню аккаунта ему не показывается, а переключатель темы — да.

Метаданные OG переезжают на файловую конвенцию `opengraph-image.tsx` в задаче 13, поэтому здесь блок `openGraph.images` не пишется вручную.

- [ ] **Step 1: Написать страницу 404**

Создать `src/app/[username]/not-found.tsx`:

```tsx
import Link from 'next/link'
import Panel from '@/components/ui/panel'
import { pixelButtonClass } from '@/components/ui/pixel-button'

export default function ProfileNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-[42rem] flex-col gap-6 p-4 sm:p-8">
      <Panel
        title="NO SUCH PLAYER"
        className="flex flex-col items-center gap-6 text-center"
      >
        <p className="font-mono text-sm">No player found at this address.</p>
        <Link href="/" className={pixelButtonClass('primary')}>
          Start your own quest
        </Link>
      </Panel>
    </main>
  )
}
```

- [ ] **Step 2: Переписать страницу профиля**

Заменить содержимое `src/app/[username]/page.tsx`:

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import AppHeader from '@/components/layout/app-header'
import ShareBar from '@/components/share/share-bar'
import AvatarStage from '@/components/streak/avatar-stage'
import StreakChain from '@/components/streak/streak-chain'
import StreakStats from '@/components/streak/streak-stats'
import Panel from '@/components/ui/panel'
import { pixelButtonClass } from '@/components/ui/pixel-button'
import { getPublicProfile } from '@/lib/dal/user'
import { getPublicPromiseView } from '@/lib/dal/promise'
import { readThemeCookie } from '@/lib/theme'
import { buildChain } from '@/lib/view/chain'

interface PageProps {
  params: Promise<{ username: string }>
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://never-give.app'

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params

  const profile = await getPublicProfile(username)
  if (!profile) return { title: 'Player not found - never-give.app' }

  const promise = await getPublicPromiseView(profile)

  return {
    title: `${profile.username}'s Streak - never-give.app`,
    description: promise
      ? `${profile.username} is committing to: ${promise.title}`
      : `Follow ${profile.username}'s journey.`,
    // Unlisted profiles are reachable by link but must stay out of search.
    robots:
      promise?.visibility === 'unlisted'
        ? { index: false, follow: false }
        : undefined,
  }
}

export default async function PublicProfilePage({ params }: PageProps) {
  const { username } = await params

  const profile = await getPublicProfile(username)

  // notFound() throws a control-flow exception, so it stays out of try/catch.
  if (!profile) notFound()

  // Under the anon role a private promise is simply not returned.
  const promise = await getPublicPromiseView(profile)
  if (!promise) notFound()

  const theme = await readThemeCookie()

  const cells = buildChain({
    today: promise.today,
    checkinDates: promise.recentCheckins,
    frozenDates: promise.recentFrozen,
    startedOn: promise.startedOn,
  })

  return (
    <main className="mx-auto flex w-full max-w-[42rem] flex-col gap-6 p-4 sm:p-8">
      {/* No username: the visitor is not necessarily signed in. */}
      <AppHeader theme={theme} />

      <Panel className="flex flex-col items-center gap-6">
        <h1 className="min-w-0 truncate">{profile.username}</h1>
        <p className="font-mono text-xs text-ink-muted">is committing to</p>

        <p className="min-w-0 text-balance text-center [font-size:clamp(0.75rem,3.5vw,1.25rem)] [overflow-wrap:anywhere]">
          {promise.title}
        </p>

        <AvatarStage currentStreak={promise.currentStreak} />

        <div className="w-full">
          <StreakStats
            current={promise.currentStreak}
            best={promise.bestStreak}
          />
        </div>

        <div className="w-full">
          <StreakChain cells={cells} />
        </div>

        {promise.startedOn ? (
          <p className="font-mono text-xs text-ink-muted">
            since {promise.startedOn}
          </p>
        ) : null}
      </Panel>

      <ShareBar
        url={`${SITE_URL}/${profile.username}`}
        title={`${profile.username} is committing to: ${promise.title}`}
      />

      <p className="text-center">
        <Link href="/" className={pixelButtonClass('primary')}>
          Start your own quest
        </Link>
      </p>
    </main>
  )
}
```

- [ ] **Step 3: Проверить компиляцию**

Run: `npx tsc --noEmit && npm run lint`
Expected: без ошибок.

- [ ] **Step 4: Проверить вручную**

Run: `npm run dev`

Открыть `http://localhost:3000/<свой_username>` в приватном окне (без сессии).

Ожидается:

- профиль виден, стрик и цепочка совпадают с дашбордом;
- счётчика заморозок нет;
- `COPY LINK` кладёт в буфер полный URL профиля;
- ссылки X и TG открываются с подставленным текстом обещания;
- меню аккаунта отсутствует, переключатель темы работает.

Открыть `http://localhost:3000/nosuchuser` — страница из шага 1.

Проверить ширины 320, 375, 768, 1280: горизонтальной прокрутки нет, кнопки шаринга переносятся, а не выходят за край.

- [ ] **Step 5: Коммит**

```bash
git add "src/app/[username]/"
git commit -m "fix: rebuild public profile on the data access layer"
```

---

### Task 13: OG-картинка

**Files:**
- Create: `assets/PressStart2P-Regular.ttf`
- Create: `src/app/[username]/opengraph-image.tsx`
- Delete: `src/app/api/og/route.tsx`
- Modify: `package.json`

**Interfaces:**
- Consumes: `getPublicProfile` из `src/lib/dal/user.ts`; `getPublicPromiseView` из `src/lib/dal/promise.ts`; `buildChain`, `CHAIN_DAYS` из `src/lib/view/chain.ts`
- Produces: OG-картинка 1200×630 по маршруту, который Next подставляет в метаданные автоматически

**Контекст.** Чинятся дефекты 1.10 и 1.11 из [known-issues.md](../../known-issues.md). Расшариваемая картинка — главный канал распространения продукта, а сейчас она рисуется системным моноширинным шрифтом.

Переход на файловую конвенцию `opengraph-image.tsx` вместо ручного роута `/api/og` даёт автоматическую простановку `og:image`, `og:image:width` и `og:image:height` — руками их поддерживать больше не нужно.

**В картинку идёт цепочка.** Это то же самое `buildChain`, что и на странице: расшаренная ссылка должна показывать доказательство, а не только цифру. Ради этого `PublicPromiseView` и отдаёт даты (задача 9).

Здесь единственное разрешённое исключение из запрета на литеральные цвета: Satori рендерит картинку вне документа и до CSS-переменных приложения не дотягивается, поэтому палитра в этом файле записана значениями светлой темы напрямую. Satori умеет только flexbox — grid из `.chain` тут неприменим, клетки выкладываются строкой.

- [ ] **Step 1: Скачать шрифт**

Press Start 2P распространяется под SIL Open Font License.

```bash
mkdir -p assets
curl -L -o assets/PressStart2P-Regular.ttf \
  https://github.com/google/fonts/raw/main/ofl/pressstart2p/PressStart2P-Regular.ttf
```

Проверить, что файл — действительно TrueType, а не HTML-страница ошибки:

```bash
file assets/PressStart2P-Regular.ttf
```

Expected: `TrueType Font data` (или `TrueType font data`). Размер порядка 100 КБ.

- [ ] **Step 2: Удалить старый роут и зависимость**

```bash
git rm -r src/app/api/og
npm uninstall @vercel/og
```

- [ ] **Step 3: Написать генератор картинки**

Создать `src/app/[username]/opengraph-image.tsx`:

```tsx
import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getPublicProfile } from '@/lib/dal/user'
import { getPublicPromiseView } from '@/lib/dal/promise'
import { buildChain, type Cell } from '@/lib/view/chain'

export const alt = 'never-give.app streak'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const pressStart2P = await readFile(
  join(process.cwd(), 'assets/PressStart2P-Regular.ttf'),
)

// Satori renders outside the document and cannot see the app's CSS variables,
// so the light-theme palette is written out here.
const INK = '#1a1d21'
const MUTED = '#5b6169'
const PANEL = '#ffffff'
const BG = '#14171a'
const CELL_COLOR: Record<Cell['state'], string> = {
  checked: '#b3341c',
  frozen: '#1c5f8f',
  missed: '#b9bec4',
  empty: '#dfe1e4',
}

export default async function Image({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params

  const profile = await getPublicProfile(username)
  const promise = profile ? await getPublicPromiseView(profile) : null

  const displayName = profile?.username ?? 'Player'
  const title = promise?.title ?? 'A new quest'
  const streak = promise?.currentStreak ?? 0

  const cells: Cell[] = promise
    ? buildChain({
        today: promise.today,
        checkinDates: promise.recentCheckins,
        frozenDates: promise.recentFrozen,
        startedOn: promise.startedOn,
      })
    : []

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          backgroundColor: BG,
          padding: 40,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: PANEL,
            border: `8px solid ${INK}`,
            width: '100%',
            height: '100%',
            padding: 60,
          }}
        >
          <div style={{ fontSize: 36, color: INK }}>{displayName}</div>
          <div style={{ fontSize: 18, color: MUTED, marginTop: 24 }}>
            is committing to
          </div>
          <div
            style={{
              fontSize: 34,
              color: INK,
              marginTop: 28,
              textAlign: 'center',
              // Satori has no line clamping, so keep long titles from
              // pushing the streak out of frame.
              maxWidth: 940,
            }}
          >
            {title.length > 48 ? `${title.slice(0, 45)}...` : title}
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 44 }}>
            {cells.map((cell) => (
              <div
                key={cell.date}
                style={{
                  width: 26,
                  height: 26,
                  backgroundColor: CELL_COLOR[cell.state],
                  border: `3px solid ${INK}`,
                }}
              />
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginTop: 44,
            }}
          >
            <span style={{ fontSize: 16, color: MUTED }}>CURRENT STREAK</span>
            <span style={{ fontSize: 88, color: CELL_COLOR.checked, marginTop: 16 }}>
              {streak}
            </span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: 'Press Start 2P',
          data: pressStart2P,
          style: 'normal',
          weight: 400,
        },
      ],
    },
  )
}
```

Шрифт объявлен как единственный, поэтому `fontFamily` в стилях не указывается — Satori применит его ко всему дереву.

- [ ] **Step 4: Проверить компиляцию и сборку**

Run: `npx tsc --noEmit && npm run build`
Expected: сборка проходит. В выводе присутствует маршрут `/[username]/opengraph-image`.

- [ ] **Step 5: Проверить картинку глазами**

Run: `npm run dev`

Открыть `http://localhost:3000/<свой_username>/opengraph-image`. Ожидается: PNG 1200×630, весь текст — пиксельным шрифтом Press Start 2P, число стрика красное и крупное.

Затем открыть исходный код страницы `http://localhost:3000/<свой_username>` и убедиться, что в `<head>` есть `<meta property="og:image">` со ссылкой на этот маршрут.

- [ ] **Step 6: Коммит**

```bash
git add assets/ "src/app/[username]/opengraph-image.tsx" package.json package-lock.json
git commit -m "feat: render OG image with the pixel font via next/og"
```

---

### Task 13a: Лендинг и экран входа

**Files:**
- Rewrite: `src/app/page.tsx`
- Rewrite: `src/app/login/page.tsx`
- Create: `src/app/login/login-form.tsx`

**Interfaces:**
- Consumes: `login`, `signup` из `src/app/login/actions.ts` (файл **не меняется**); `createClient` из `src/utils/supabase/server.ts`; `buildChain` из `src/lib/view/chain.ts`; `datesBetween` из `src/lib/dates.ts`; `AppHeader`, `StreakChain`, `Panel`, `PixelButton`, `pixelButtonClass` из `src/components/`
- Produces: `LoginForm()` — default export `src/app/login/login-form.tsx`

**Контекст.** Лендинг — точка приземления по расшаренной ссылке, то есть место, где посетитель решает, регистрироваться ли. Сейчас это три кнопки входа без единого слова о механике.

Заморозки выносятся в отдельный блок сознательно: это единственная механика, отличающая продукт от соседних трекеров, и объяснять её надо до регистрации, а не после.

Демо-цепочка строится тем же `buildChain` с зафиксированными датами. Системные часы не читаются, поэтому картинка детерминированная и страница остаётся статической.

Кнопка Google перестаёт быть `is-error`. Красный в дизайн-системе означает ошибку, и «Sign in with Google» красной кнопкой читается как предупреждение.

`src/app/login/actions.ts` остаётся как есть: логика входа рабочая, меняется только оболочка. `useActionState` получает клиентскую обёртку, которая вызывает уже существующие server actions — переписывать их сигнатуры незачем.

- [ ] **Step 1: Переписать лендинг**

Заменить содержимое `src/app/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import AppHeader from '@/components/layout/app-header'
import StreakChain from '@/components/streak/streak-chain'
import Panel from '@/components/ui/panel'
import { pixelButtonClass } from '@/components/ui/pixel-button'
import { datesBetween } from '@/lib/dates'
import { readThemeCookie } from '@/lib/theme'
import { buildChain } from '@/lib/view/chain'
import { createClient } from '@/utils/supabase/server'

// Fixed dates keep the demo deterministic: no system clock, no hydration drift.
const DEMO_TODAY = '2026-08-10'
const DEMO_START = '2026-07-16'
const DEMO_FROZEN = '2026-08-02'
const DEMO_MISSED = '2026-07-28'

const DEMO_CHAIN = buildChain({
  today: DEMO_TODAY,
  checkinDates: datesBetween(DEMO_START, DEMO_TODAY).filter(
    (date) => date !== DEMO_FROZEN && date !== DEMO_MISSED,
  ),
  frozenDates: [DEMO_FROZEN],
  startedOn: DEMO_START,
})

const FREEZE_DEMO = buildChain({
  today: '2026-08-10',
  checkinDates: datesBetween('2026-08-01', '2026-08-10').filter(
    (date) => date !== '2026-08-06',
  ),
  frozenDates: ['2026-08-06'],
  startedOn: '2026-08-01',
  days: 10,
})

const STEPS = [
  {
    title: '1. PROMISE',
    body: 'Say out loud what you will do every single day. One promise, in public.',
  },
  {
    title: '2. CHECK IN',
    body: 'Tap the button once a day. Your day ends at midnight in your own timezone.',
  },
  {
    title: '3. DO NOT BREAK IT',
    body: 'Every check-in adds a link. Your profile shows the whole chain to anyone.',
  },
]

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Outside any try/catch: redirect() throws a control-flow exception.
  if (user) redirect('/dashboard')

  const theme = await readThemeCookie()

  return (
    <main className="mx-auto flex w-full max-w-[42rem] flex-col gap-8 p-4 sm:p-8">
      <AppHeader theme={theme} />

      <Panel className="flex flex-col items-center gap-6 text-center">
        <h1 className="[font-size:clamp(1rem,5vw,1.75rem)]">never-give.app</h1>
        <p className="font-mono text-sm text-ink-muted">
          Promise publicly. Check in daily. Do not break the chain.
        </p>

        <div className="flex w-full flex-col gap-3">
          <form action="/auth/signin" method="post">
            <input type="hidden" name="provider" value="google" />
            <button type="submit" className={pixelButtonClass('default', true)}>
              Sign in with Google
            </button>
          </form>

          <form action="/auth/signin" method="post">
            <input type="hidden" name="provider" value="github" />
            <button type="submit" className={pixelButtonClass('default', true)}>
              Sign in with GitHub
            </button>
          </form>

          <Link href="/login" className={pixelButtonClass('primary', true)}>
            Continue with email
          </Link>
        </div>
      </Panel>

      <Panel title="HOW IT WORKS" className="flex flex-col gap-6">
        {STEPS.map((step) => (
          <div key={step.title} className="min-w-0">
            <h2 className="text-sm">{step.title}</h2>
            <p className="mt-2 font-mono text-xs text-ink-muted">{step.body}</p>
          </div>
        ))}
      </Panel>

      <Panel title="FREEZES" className="flex flex-col gap-4">
        <p className="font-mono text-xs text-ink-muted">
          Miss a day and a freeze covers it automatically. You earn one every
          seven days, and you can hold three.
        </p>

        <StreakChain cells={FREEZE_DEMO} />

        <p className="font-mono text-xs text-ink-muted">
          All or nothing: if your freezes cannot cover the whole gap, none are
          spent. A partly rescued chain would break anyway, so they are kept for
          next time.
        </p>
      </Panel>

      <Panel title="A REAL CHAIN" className="flex flex-col gap-4">
        <StreakChain cells={DEMO_CHAIN} />
        <p className="font-mono text-xs text-ink-muted">
          This is what your public profile shows. One missed day, one saved by a
          freeze, the rest earned.
        </p>
      </Panel>

      <footer className="text-center font-mono text-xs text-ink-muted">
        never-give.app
      </footer>
    </main>
  )
}
```

- [ ] **Step 2: Написать клиентскую форму входа**

Создать `src/app/login/login-form.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import Field from '@/components/ui/field'
import PixelButton from '@/components/ui/pixel-button'
import { login, signup } from './actions'

type LoginState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'check_email' }

const INITIAL_STATE: LoginState = { status: 'idle' }

export default function LoginForm() {
  const [isLogin, setIsLogin] = useState(true)

  // The wrapper runs on the client and calls the existing server actions, so
  // their signatures stay untouched.
  const [state, action, pending] = useActionState(
    async (_prev: LoginState, formData: FormData): Promise<LoginState> => {
      if (isLogin) {
        const result = await login(formData)
        return result?.error
          ? { status: 'error', message: result.error }
          : { status: 'idle' }
      }

      const result = await signup(formData)
      if (result?.error) return { status: 'error', message: result.error }
      return { status: 'check_email' }
    },
    INITIAL_STATE,
  )

  if (state.status === 'check_email') {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p role="status">REGISTRATION SUCCESSFUL</p>
        <p className="font-mono text-xs text-ink-muted">
          Check your email to verify the account before signing in.
        </p>
        <Link href="/" className="font-mono text-xs underline">
          Back to home
        </Link>
      </div>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-6">
      {state.status === 'error' ? (
        <p role="alert" className="font-mono text-xs text-streak">
          {state.message}
        </p>
      ) : null}

      <Field id="email" label="Email">
        <input
          type="email"
          id="email"
          name="email"
          className="nes-input"
          autoComplete="email"
          required
        />
      </Field>

      <Field
        id="password"
        label="Password"
        hint={isLogin ? undefined : 'At least 6 characters.'}
      >
        <input
          type="password"
          id="password"
          name="password"
          className="nes-input"
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          aria-describedby={isLogin ? undefined : 'password-hint'}
          required
        />
      </Field>

      <PixelButton type="submit" variant="primary" full aria-busy={pending}>
        {pending ? 'PLEASE WAIT...' : isLogin ? 'SIGN IN' : 'SIGN UP'}
      </PixelButton>

      <button
        type="button"
        className="font-mono text-xs underline"
        onClick={() => setIsLogin((value) => !value)}
      >
        {isLogin
          ? 'No account yet? Sign up'
          : 'Already have an account? Sign in'}
      </button>

      <Link href="/" className="text-center font-mono text-xs underline">
        Back to home
      </Link>
    </form>
  )
}
```

- [ ] **Step 3: Переписать страницу входа**

Заменить содержимое `src/app/login/page.tsx`:

```tsx
import AppHeader from '@/components/layout/app-header'
import Panel from '@/components/ui/panel'
import { readThemeCookie } from '@/lib/theme'
import LoginForm from './login-form'

export default async function LoginPage() {
  const theme = await readThemeCookie()

  return (
    <main className="mx-auto flex w-full max-w-[42rem] flex-col gap-6 p-4 sm:p-8">
      <AppHeader theme={theme} />
      <Panel title="SIGN IN">
        <LoginForm />
      </Panel>
    </main>
  )
}
```

Страница стала серверной, вся интерактивность ушла в `login-form.tsx`. Прежний `'use client'` на всей странице тянул в браузер и разметку, которой там делать нечего.

- [ ] **Step 4: Проверить компиляцию**

Run: `npx tsc --noEmit && npm run lint`
Expected: без ошибок.

- [ ] **Step 5: Проверить вручную**

Run: `npm run dev`

Открыть `http://localhost:3000/` без сессии. Ожидается: лендинг с четырьмя панелями, обе демо-цепочки отрисованы, кнопки входа нейтральные (красной среди них нет).

Открыть `http://localhost:3000/login`. Ожидается: переключение sign in / sign up работает, неверный пароль показывает сообщение под заголовком, регистрация показывает экран `REGISTRATION SUCCESSFUL`.

Проверить ширины 320, 375, 768, 1280 на обеих страницах: горизонтальной прокрутки нет.

- [ ] **Step 6: Коммит**

```bash
git add src/app/page.tsx src/app/login/
git commit -m "feat: rebuild the landing page and sign-in screen"
```

---

### Task 13b: Служебные состояния

**Files:**
- Create: `src/app/dashboard/loading.tsx`
- Create: `src/app/[username]/loading.tsx`
- Create: `src/app/not-found.tsx`

**Interfaces:**
- Consumes: `Panel` из `src/components/ui/panel.tsx`; `pixelButtonClass` из `src/components/ui/pixel-button.tsx`
- Produces: ничего, что потребляют другие задачи

**Контекст.** Сейчас в приложении нет ни одного из этих файлов, хотя [architecture.md §3](../../architecture.md) их описывает. Дашборд и профиль ходят в БД на каждый запрос, поэтому пауза перед первой отрисовкой заметна, и показывать в ней пустой экран незачем.

Пустые состояния дашборда (первый день, сгоревшая цепочка) уже реализованы в задаче 10 — здесь только скелеты и глобальная 404.

Пульсация скелетона гасится глобальным правилом `prefers-reduced-motion` из `nes-theme.css` (задача 9a), отдельной обработки не требует.

- [ ] **Step 1: Написать скелет дашборда**

Создать `src/app/dashboard/loading.tsx`:

```tsx
import Panel from '@/components/ui/panel'

function Block({ className }: { className: string }) {
  return <div className={`animate-pulse bg-empty ${className}`} />
}

export default function DashboardLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading your quest"
      className="mx-auto flex w-full max-w-[42rem] flex-col gap-6 p-4 sm:p-8"
    >
      <Block className="h-11 w-full" />

      <Panel title="ACTIVE QUEST" className="flex flex-col items-center gap-6">
        <Block className="h-6 w-3/4" />
        <Block className="h-16 w-14 sm:h-24 sm:w-[5.25rem]" />
        <div className="grid w-full grid-cols-2 gap-4">
          <Block className="h-16 w-full" />
          <Block className="h-16 w-full" />
        </div>
        <Block className="h-11 w-full" />
        <Block className="h-4 w-full" />
      </Panel>
    </main>
  )
}
```

- [ ] **Step 2: Написать скелет профиля**

Создать `src/app/[username]/loading.tsx`:

```tsx
import Panel from '@/components/ui/panel'

function Block({ className }: { className: string }) {
  return <div className={`animate-pulse bg-empty ${className}`} />
}

export default function ProfileLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading profile"
      className="mx-auto flex w-full max-w-[42rem] flex-col gap-6 p-4 sm:p-8"
    >
      <Block className="h-11 w-full" />

      <Panel className="flex flex-col items-center gap-6">
        <Block className="h-6 w-40" />
        <Block className="h-6 w-3/4" />
        <Block className="h-16 w-14 sm:h-24 sm:w-[5.25rem]" />
        <div className="grid w-full grid-cols-2 gap-4">
          <Block className="h-16 w-full" />
          <Block className="h-16 w-full" />
        </div>
        <Block className="h-4 w-full" />
      </Panel>
    </main>
  )
}
```

- [ ] **Step 3: Написать глобальную 404**

Создать `src/app/not-found.tsx`:

```tsx
import Link from 'next/link'
import Panel from '@/components/ui/panel'
import { pixelButtonClass } from '@/components/ui/pixel-button'

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-[42rem] flex-col gap-6 p-4 sm:p-8">
      <Panel
        title="404"
        className="flex flex-col items-center gap-6 text-center"
      >
        <p className="font-mono text-sm">There is nothing at this address.</p>
        <Link href="/" className={pixelButtonClass('primary')}>
          Back to home
        </Link>
      </Panel>
    </main>
  )
}
```

- [ ] **Step 4: Проверить компиляцию и сборку**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: без ошибок.

- [ ] **Step 5: Проверить вручную**

Run: `npm run dev`

Открыть `http://localhost:3000/dashboard` и `http://localhost:3000/<свой_username>`. При медленном соединении (DevTools → Network → Slow 3G) ожидается скелет вместо пустого экрана.

Открыть `http://localhost:3000/no/such/path` — глобальная 404. Открыть `http://localhost:3000/nosuchuser` — по-прежнему `NO SUCH PLAYER` из задачи 12, а не глобальная.

Включить в системе «уменьшить движение» и убедиться, что скелет не пульсирует.

- [ ] **Step 6: Коммит**

```bash
git add src/app/dashboard/loading.tsx "src/app/[username]/loading.tsx" src/app/not-found.tsx
git commit -m "feat: add loading skeletons and a global not-found page"
```

---

### Task 14: E2E-тесты

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/fixtures.ts`
- Create: `e2e/streak.spec.ts`
- Create: `e2e/layout.spec.ts`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `data-testid="current-streak"`, `data-testid="best-streak"`, `data-testid="chain"`, `data-responsive` из задач 9b, 10 и 12
- Produces: npm-скрипт `test:e2e`

**Контекст.** Юнит-тесты покрывают чистую логику, но не проверяют, что страницы, RLS-политики и server actions работают вместе. Документация Next.js прямо рекомендует покрывать async Server Components именно E2E-тестами.

Тестовый пользователь создаётся через Admin API с `email_confirm: true` — иначе Supabase потребует подтверждения почты и вход не пройдёт. Для этого нужен `SUPABASE_SERVICE_ROLE_KEY`, который кладётся **только** в `.env.test.local` и никогда в `.env.local`: всё, что попадает в серверный рантайм приложения, не должно иметь прав сервисной роли.

Удаление пользователя из `auth.users` каскадно чистит `public.users`, `promises`, `checkins` и `streak_freezes` благодаря внешним ключам из задач 5 и 6.

- [ ] **Step 1: Установить Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Добавить скрипт и игнор**

В `package.json`, в блок `"scripts"`, добавить после `"test:watch": "vitest",`:

```json
    "test:e2e": "playwright test",
```

В `.gitignore` дописать в конец:

```
# playwright
/test-results/
/playwright-report/
/blob-report/
/playwright/.cache/

# local test secrets
.env.test.local
```

- [ ] **Step 3: Создать файл с секретом для тестов**

Создать `.env.test.local` в корне (в git не попадёт):

```bash
SUPABASE_SERVICE_ROLE_KEY=<service role key из Supabase Dashboard → Project Settings → API>
```

- [ ] **Step 4: Написать конфигурацию Playwright**

Создать `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'
import { config } from 'dotenv'

config({ path: '.env.local' })
config({ path: '.env.test.local', override: true })

export default defineConfig({
  testDir: './e2e',
  // Every test creates its own user, but they share one Supabase project.
  // Serial execution keeps failures readable.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Tests run against a production build, the way the app actually ships.
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
```

- [ ] **Step 5: Написать фикстуру тестового пользователя**

Создать `e2e/fixtures.ts`:

```ts
import { test as base } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

export interface TestUser {
  id: string
  email: string
  password: string
  username: string
}

export const test = base.extend<{ user: TestUser }>({
  user: async ({}, use, testInfo) => {
    const stamp = `${Date.now()}${testInfo.workerIndex}`
    const email = `e2e-${stamp}@never-give.test`
    const password = `Pw-${stamp}-aA1!`
    const username = `e2e_${stamp}`.slice(0, 20)

    // email_confirm skips the verification mail, which a browser test
    // cannot complete.
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error) throw error

    await use({ id: data.user.id, email, password, username })

    // Cascades through public.users, promises, checkins and streak_freezes.
    await admin.auth.admin.deleteUser(data.user.id)
  },
})

export { expect } from '@playwright/test'
```

- [ ] **Step 6: Написать сквозной сценарий**

Создать `e2e/streak.spec.ts`:

```ts
import { expect, test } from './fixtures'

async function signIn(page: import('@playwright/test').Page, user: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign In' }).click()
}

test('a new player onboards, checks in, and shows up publicly', async ({
  page,
  user,
}) => {
  await signIn(page, user)

  await expect(page).toHaveURL('/onboarding')

  await page.getByLabel('Choose a Username').fill(user.username)
  await page.getByLabel('Your Main Promise').fill('Ship every day')
  await page.getByRole('button', { name: 'Start Game' }).click()

  await expect(page).toHaveURL('/dashboard')
  await expect(page.getByText('Ship every day')).toBeVisible()
  await expect(page.getByTestId('current-streak')).toHaveText('0')

  await page.getByRole('button', { name: 'CHECK IN TODAY' }).click()

  await expect(page.getByTestId('current-streak')).toHaveText('1')
  await expect(page.getByTestId('best-streak')).toHaveText('1')
  await expect(
    page.getByRole('button', { name: 'DONE FOR TODAY' }),
  ).toBeDisabled()

  // The public page must show the same streak to a visitor with no session.
  const visitor = await page.context().browser()!.newContext()
  const visitorPage = await visitor.newPage()
  await visitorPage.goto(`http://localhost:3000/${user.username}`)

  await expect(
    visitorPage.getByRole('heading', { name: user.username }),
  ).toBeVisible()
  await expect(visitorPage.getByTestId('current-streak')).toHaveText('1')

  await visitor.close()
})

test('a taken username is reported instead of failing silently', async ({
  page,
  user,
}) => {
  await signIn(page, user)
  await expect(page).toHaveURL('/onboarding')

  // `dashboard` is on the reserved list because profiles live at the root.
  await page.getByLabel('Choose a Username').fill('dashboard')
  await page.getByLabel('Your Main Promise').fill('Ship every day')
  await page.getByRole('button', { name: 'Start Game' }).click()

  await expect(page.getByText('That username is reserved. Pick another one.')).toBeVisible()
  await expect(page).toHaveURL('/onboarding')
})

test('an unknown profile returns the 404 page', async ({ page }) => {
  await page.goto('/nosuchplayer')

  await expect(page.getByText('No player found at this address.')).toBeVisible()
})
```

- [ ] **Step 7: Написать проверки раскладки**

Эти тесты не требуют сессии и потому не трогают фикстуру: они ходят по публичным роутам.

Создать `e2e/layout.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

const WIDTHS = [320, 375, 768, 1280]
const PUBLIC_PATHS = ['/', '/login']

// A page that scrolls sideways is broken on a phone, and it is the failure
// mode a monospaced pixel font produces most easily.
for (const width of WIDTHS) {
  for (const path of PUBLIC_PATHS) {
    test(`${path} does not scroll horizontally at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.goto(path)

      const overflow = await page.evaluate(() => {
        const root = document.documentElement
        return root.scrollWidth - root.clientWidth
      })

      expect(overflow).toBeLessThanOrEqual(0)
    })
  }
}

test('a full chain trims to 14 days on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('/')

  const cells = page.locator('[data-testid="chain"][data-responsive]').locator('li')

  // All thirty are rendered; sixteen are hidden by CSS below `sm`.
  await expect(cells).toHaveCount(30)
  await expect(cells.first()).toBeHidden()
  await expect(cells.nth(16)).toBeVisible()
})

test('a short chain is never trimmed', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('/')

  const shortChain = page
    .locator('[data-testid="chain"]:not([data-responsive])')
    .first()

  await expect(shortChain.locator('li').first()).toBeVisible()
})

test('the theme choice survives a reload', async ({ page }) => {
  await page.goto('/')

  // With no cookie the media query decides, and the attribute is absent.
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/)

  await page
    .getByRole('button', { name: /Switch to (dark|light) theme/ })
    .click()

  await expect(page.locator('html')).toHaveAttribute('data-theme', /light|dark/)

  const chosen = await page.evaluate(() =>
    document.documentElement.getAttribute('data-theme'),
  )

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', chosen ?? '')
})
```

- [ ] **Step 8: Запустить E2E**

Run: `npm run test:e2e`
Expected: PASS — 14 тестов (3 сценарных плюс 11 проверок раскладки). Первый запуск дольше остальных: Playwright собирает продовый билд.

- [ ] **Step 9: Коммит**

```bash
git add playwright.config.ts e2e/ package.json package-lock.json .gitignore
git commit -m "test: add Playwright coverage for the streak flow and layout"
```

---

### Task 15: Финальная проверка и синхронизация документации

**Files:**
- Modify: `docs/known-issues.md`

**Interfaces:**
- Consumes: всё предыдущее
- Produces: документация, соответствующая коду

**Контекст.** [known-issues.md](../../known-issues.md) описывает дефекты как существующие. После задач 1–14 большая их часть закрыта, и документ обязан это отражать — иначе он вводит в заблуждение при следующем заходе.

- [ ] **Step 1: Прогнать полную проверку**

Run:

```bash
npm test && npm run lint && npx tsc --noEmit && npm run build && npm run test:e2e
```

Expected: все пять команд завершаются успешно. Если что-то падает — чинить до перехода к шагу 2. Не отмечать задачу выполненной по частично зелёному прогону.

- [ ] **Step 2: Проверить изоляцию данных под RLS**

Создать через приложение второго пользователя со своим обещанием и видимостью `public`. Затем в SQL Editor Supabase выполнить, подставив id первого пользователя:

```sql
begin;
select set_config('request.jwt.claims', '{"sub":"<id первого пользователя>","role":"authenticated"}', true);
select set_config('role', 'authenticated', true);

-- Должна вернуться ровно одна строка: своя.
select count(*) as own_rows from public.promises where user_id = '<id первого>';

-- Публичные обещания второго пользователя видны (visibility <> 'private').
select count(*) as visible_rows from public.promises;

-- А email не доступен вообще: колонка не выдана роли authenticated.
select email from public.users;
rollback;
```

Expected: первые два запроса возвращают числа, а последний падает с
`permission denied for column email of relation users`. Именно это и требуется:
колоночный грант закрывает адрес наглухо, независимо от политик строк.

Дополнительно проверить, что приватное обещание не утекает анониму:

```sql
begin;
select set_config('role', 'anon', true);
select count(*) from public.promises where visibility = 'private';
rollback;
```

Expected: `0`. Если в базе нет приватных обещаний, временно выставить
`visibility = 'private'` одному из них под сервисной ролью, повторить проверку
и вернуть значение обратно.

- [ ] **Step 3: Обновить known-issues.md**

В `docs/known-issues.md` заменить заголовок первой части

```markdown
## Часть 1. Дефекты текущего кода
```

на

```markdown
## Часть 1. Дефекты, устранённые в MVP

Закрыты планом `docs/superpowers/plans/2026-08-06-mvp-completion.md`.
Раздел сохранён как история: он объясняет, почему код устроен так, как устроен.
```

Затем в каждом пункте 1.1–1.13 дописать первой строкой пометку с задачей, которая его закрыла:

| Пункт | Пометка |
|---|---|
| 1.1 | `**Устранено** (задача 10): `redirect()` вынесен из `try`/`catch`.` |
| 1.2 | `**Устранено** (задачи 1, 2): расчёт переведён на `localDateOf` с таймзоной пользователя.` |
| 1.3 | `**Устранено** (задачи 2, 10, 12): единственная реализация в `src/lib/streak.ts`.` |
| 1.4 | `**Устранено** (задача 11): ошибки возвращаются в `useActionState` и показываются в форме.` |
| 1.5 | `**Устранено** (задача 11): цель конфликта — `users.id`; FK на `auth.users` добавлен в задаче 6.` |
| 1.6 | `**Устранено** (задачи 10, 12): заглушки убраны, ошибки доходят до `error.tsx`.` |
| 1.7 | `**Устранено** (задача 5): миграции в `drizzle/`, `db:push` больше не используется.` |
| 1.8 | `**Устранено** (задачи 6, 7): RLS включена, запросы идут под ролью `authenticated` или `anon`.` |
| 1.9 | `**Устранено** (задачи 3, 5, 9): механика заморозок реализована полностью.` |
| 1.10 | `**Устранено** (задача 13): используется `next/og`, `@vercel/og` удалён.` |
| 1.11 | `**Устранено** (задача 13): шрифт Press Start 2P загружается в `ImageResponse`.` |
| 1.12 | `**Устранено** (задачи 1–4, 14): Vitest на чистую логику, Playwright на сквозные сценарии.` |
| 1.13 | `**Устранено**: README переписан.` |
| 1.14 | `**Устранено** (задачи 9b, 10, 12): подпись `Lvl` убрана, стадия аватара выводится из длины стрика.` |
| 1.15 | `**Снято** (задача 11): расхождения нет. Селект предлагает `public` и `unlisted`, `private` обрабатывается кодом и политиками — это зафиксировано в product-spec §5 как решение, а не недосмотр.` |

Пункт 2.7 части 2 («`avatar_level` остаётся в выдаче как константа») удалить: он противоречит устранённому 1.14.

- [ ] **Step 4: Проверить адаптив и доступность**

Чек-лист из [фронтенд-спеки](../specs/2026-08-06-frontend-design.md) §5.5, §7. Пройти по `/`, `/login`, `/onboarding`, `/dashboard`, `/<username>`:

| Проверка | Как |
|---|---|
| Нет горизонтальной прокрутки на 320/375/768/1280 | закрыто E2E из задачи 14, здесь — глазами |
| Кнопки не мельче 44px | DevTools, режим инспектора |
| Фокус виден на каждом интерактивном элементе | пройти всю страницу клавишей Tab |
| Цепочка озвучивается одной строкой | скринридер или Accessibility-панель DevTools |
| Кнопки `disabled` без объяснения нет ни одной | `grep -rn "disabled" src/app src/components` |
| Анимации гаснут при «уменьшить движение» | системная настройка либо эмуляция в DevTools |
| Литеральных цветов не осталось | `grep -rnE "#[0-9a-fA-F]{6}|text-(gray|red|blue)-[0-9]" src/app src/components` |

Последняя команда должна давать совпадения только в `src/app/globals.css`, `src/app/nes-theme.css` и `src/app/[username]/opengraph-image.tsx` — там литералы разрешены явно (задачи 9a и 13).

Аналогично `grep -rnE "nes-(container|btn)" src/app --include=*.tsx` не должен находить ничего: контейнеры и кнопки в роутах берутся из примитивов. `nes-input` и `nes-select` на полях ввода разрешены.

- [ ] **Step 5: Проверить, что документация не разошлась с кодом**

Пройти по чек-листу [docs/product-spec.md §7](../../product-spec.md) и отметить выполненные пункты. Любой невыполненный пункт — либо недоделанная задача, либо ошибка в спецификации; разобраться до коммита.

Сверить с кодом и [фронтенд-спеку](../specs/2026-08-06-frontend-design.md): если реализация от неё отошла, правится тот документ, который неправ, а не замалчивается расхождение.

- [ ] **Step 6: Коммит**

```bash
git add docs/
git commit -m "docs: mark MVP defects as resolved"
```

---

## Проверка плана

**Покрытие решений, принятых на этапе постановки:**

| Решение | Задачи |
|---|---|
| Заморозки за длину стрика, каждые 7 дней, потолок 3 | 3, 9 |
| Ленивое автоматическое списание | 3, 9, 10 |
| RLS через переключение роли в Drizzle | 6, 7, 9 |
| Vitest + Playwright | 1–4a, 14 |
| Хостинг Vercel, без cron | архитектурная документация, §10 |
| Зарезервированные поля остаются в схеме | 5, документация |

**Покрытие фронтенд-спеки** ([2026-08-06-frontend-design.md](../specs/2026-08-06-frontend-design.md)):

| Раздел спеки | Задачи |
|---|---|
| §2 Слои стилей, токены, темы, шрифты | 9a |
| §3 Компоненты и чистый слой представления | 4a, 9b |
| §4.2 Дашборд | 10 |
| §4.3 Публичный профиль | 12 |
| §4.4 Лендинг | 13a |
| §4.5 Логин и онбординг | 11, 13a |
| §4.6 Служебные и пустые состояния | 10, 12, 13b |
| §5 Адаптивность | 9a, 9b, 10, 12 |
| §6 Поведение чек-ина | 9, 10 |
| §7 Доступность | 9a, 9b, 10, 15 |
| §8 Проверки | 4a, 14 |
| §9 Вливание в план | этот документ |

**Покрытие дефектов из known-issues.md:** 1.1 → 10 · 1.2 → 1, 2 · 1.3 → 2, 10, 12 · 1.4 → 11 · 1.5 → 6, 11 · 1.6 → 10, 12 · 1.7 → 5 · 1.8 → 6, 7 · 1.9 → 3, 5, 9 · 1.10 → 13 · 1.11 → 13 · 1.12 → 1–4a, 14 · 1.13 → выполнено при подготовке документации · 1.14 → 9b, 10, 12 (подпись `Lvl` убрана, стадия аватара выводится из стрика) · 1.15 → 11 (расхождения нет: `private` не предлагается сознательно, product-spec §5).

**Согласованность имён между задачами:** `LocalDate`, `localDateOf`, `addDays`, `datesBetween`, `daysBetween` (задача 1) · `calculateStreak`, `coveredDays`, `planFreezes`, `earnedFreezeBalance`, `FREEZE_EARN_INTERVAL`, `MAX_FREEZE_BALANCE` (задачи 2, 3) · `validateUsername` (задача 4) · `streak_freezes` (задача 5) · `withUser`, `withAnon`, `DbTransaction` (задача 7) · `getSessionUser`, `requireSessionUser`, `getProfile`, `getPublicProfile`, `Profile`, `PublicProfile` (задача 8) · `getOwnPromiseView`, `getPublicPromiseView`, `checkIn`, `createProfileAndPromise` (задачи 9, 11) · `data-testid="current-streak"`, `data-testid="best-streak"` (задачи 10, 12, 14).
