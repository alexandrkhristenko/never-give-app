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
- **Чистые модули** (`src/lib/dates.ts`, `src/lib/streak.ts`) не импортируют ничего, кроме друг друга, и не читают текущее время. Время передаётся аргументом.
- **DAL-модули** начинаются с `import 'server-only'`.
- **Константы:** `FREEZE_EARN_INTERVAL = 7`, `MAX_FREEZE_BALANCE = 3`.
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
| `src/lib/dal/promise.ts` | Обещание, чек-ины, заморозки | 9 |
| `src/app/dashboard/page.tsx` | Экран дашборда | 10 |
| `src/app/dashboard/actions.ts` | Server action чек-ина | 10 |
| `src/app/dashboard/error.tsx` | Граница ошибок дашборда | 10 |
| `src/app/onboarding/page.tsx` | Экран онбординга | 11 |
| `src/app/onboarding/actions.ts` | Server action онбординга | 11 |
| `src/app/onboarding/onboarding-form.tsx` | Клиентская форма онбординга | 11 |
| `src/app/[username]/page.tsx` | Публичный профиль | 12 |
| `src/app/[username]/not-found.tsx` | 404 профиля | 12 |
| `src/app/[username]/opengraph-image.tsx` | OG-картинка | 13 |
| `assets/PressStart2P-Regular.ttf` | Шрифт для OG | 13 |
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

### Task 4: Валидация username

**Files:**
- Create: `src/lib/validation.ts`
- Create: `src/lib/validation.test.ts`

**Interfaces:**
- Consumes: ничего
- Produces:
  - `type UsernameError = 'invalid_format' | 'reserved'`
  - `const RESERVED_USERNAMES: readonly string[]`
  - `validateUsername(username: string): UsernameError | null`

**Контекст.** Правила — [docs/product-spec.md §6](../../product-spec.md). Публичный профиль живёт в корне (`/<username>`), поэтому ник конкурирует за путь с системными роутами: `/login`, `/dashboard`, `/onboarding`, `/auth`, `/api`. Занятые имена нужно запрещать.

- [ ] **Step 1: Написать падающие тесты**

Создать `src/lib/validation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { validateUsername } from './validation'

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
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npm test`
Expected: PASS — 43 теста.

- [ ] **Step 5: Коммит**

```bash
git add src/lib/validation.ts src/lib/validation.test.ts
git commit -m "feat: add username validation with reserved route names"
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
  title: varchar('title', { length: 255 }).notNull(),
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
- Consumes: `withUser`, `withAnon`, `DbTransaction` из `src/db/rls.ts`; `promises`, `checkins`, `streak_freezes`, `users` из `src/db/schema.ts`; `Profile`, `PublicProfile` из `src/lib/dal/user.ts`; `localDateOf`, `LocalDate` из `src/lib/dates.ts`; `calculateStreak`, `planFreezes`, `earnedFreezeBalance` из `src/lib/streak.ts`
- Produces:
  - `interface PromiseView { id: string; title: string; visibility: string; today: LocalDate; checkedInToday: boolean; currentStreak: number; bestStreak: number; freezeBalance: number }`
  - `interface PublicPromiseView { title: string; visibility: string; currentStreak: number; bestStreak: number }`
  - `getOwnPromiseView(profile: Profile, now?: Date): Promise<PromiseView | null>`
  - `getPublicPromiseView(profile: PublicProfile, now?: Date): Promise<PublicPromiseView | null>`
  - `checkIn(profile: Profile, now?: Date): Promise<void>`
  - `createProfileAndPromise(...)` — см. задачу 11

**Контекст.** Порядок операций задан [docs/product-spec.md §4.7](../../product-spec.md):

| Действие | Последовательность |
|---|---|
| Загрузка дашборда | списать заморозки → посчитать стрик → отрисовать |
| Чек-ин | списать заморозки → вставить чек-ин → начислить заморозку при кратности 7 |
| Публичный профиль | только чтение, заморозки не списываются |

Публичный профиль не пишет в БД намеренно: анонимный посетитель не должен провоцировать мутации. Следствие зафиксировано в [known-issues.md §2.1](../../known-issues.md).

Списание заморозок и декремент баланса идут в одной транзакции, поэтому расхождение между журналом `streak_freezes` и `users.streak_freezes_balance` невозможно.

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
}

export interface PublicPromiseView {
  title: string
  visibility: string
  currentStreak: number
  bestStreak: number
}

interface PromiseRow {
  id: string
  title: string
  visibility: string
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
    }
  })
}

/**
 * Records today's check-in and grants a freeze when the streak hits a
 * multiple of seven. Safe to call twice: the unique constraint on
 * (promise_id, local_date) makes the second call a no-op.
 */
export async function checkIn(
  profile: Profile,
  now: Date = new Date(),
): Promise<void> {
  const today = localDateOf(now, profile.timezone)

  await withUser(profile.id, async (tx) => {
    const promise = await selectPrimaryPromise(tx, profile.id)
    if (!promise) return

    const coverage = await applyPendingFreezes(tx, promise.id, profile, today)

    const inserted = await tx
      .insert(checkins)
      .values({ promise_id: promise.id, local_date: today })
      .onConflictDoNothing()
      .returning({ id: checkins.id })

    // Already checked in today. No new row means no freeze is earned either.
    if (inserted.length === 0) return

    const { current } = calculateStreak({
      checkinDates: [...coverage.checkinDates, today],
      frozenDates: coverage.frozenDates,
      today,
    })

    const nextBalance = earnedFreezeBalance(current, coverage.freezeBalance)
    if (nextBalance === coverage.freezeBalance) return

    await tx
      .update(users)
      .set({ streak_freezes_balance: nextBalance })
      .where(eq(users.id, profile.id))
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
      currentStreak: current,
      bestStreak: best,
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

### Task 10: Дашборд

**Files:**
- Rewrite: `src/app/dashboard/page.tsx`
- Create: `src/app/dashboard/actions.ts`
- Create: `src/app/dashboard/error.tsx`

**Interfaces:**
- Consumes: `requireSessionUser` из `src/lib/dal/session.ts`; `getProfile` из `src/lib/dal/user.ts`; `getOwnPromiseView`, `checkIn` из `src/lib/dal/promise.ts`
- Produces: атрибуты `data-testid="current-streak"`, `data-testid="best-streak"`, `data-testid="freeze-balance"` — на них опираются E2E-тесты в задаче 14

**Контекст.** Чинятся дефекты 1.1, 1.2, 1.3, 1.6 из [known-issues.md](../../known-issues.md). Ключевые изменения:

- `redirect()` выносится **из** `try`/`catch` — сейчас `catch` его глотает, и новый пользователь вместо онбординга видит фейковый дашборд
- фиктивные данные при сбое БД убираются: исключение доходит до `error.tsx`
- локальная копия `calculateStreak` удаляется, расчёт берётся из DAL
- server action переезжает в отдельный файл: инлайн-замыкание над `dbPromise` и `dbUser` было ещё одним источником рассинхронизации

- [ ] **Step 1: Написать server action**

Создать `src/app/dashboard/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/dal/user'
import { checkIn } from '@/lib/dal/promise'

/**
 * Records today's check-in.
 *
 * Server Actions are reachable by direct POST, not only through the UI, so
 * authorization is re-established here rather than trusted from the page.
 */
export async function checkInAction(): Promise<void> {
  const profile = await getProfile()
  if (!profile) return

  await checkIn(profile)

  revalidatePath('/dashboard')
  revalidatePath(`/${profile.username}`)
}
```

- [ ] **Step 2: Написать границу ошибок**

Создать `src/app/dashboard/error.tsx`:

```tsx
'use client' // Error boundaries must be Client Components

import { useEffect } from 'react'

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
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-[#212529]">
      <div className="nes-container with-title is-centered max-w-lg w-full bg-white text-black">
        <p className="title">Game Over</p>
        <p className="mb-8">
          We could not load your quest. This is on us, not on your streak.
        </p>
        <button type="button" className="nes-btn is-warning" onClick={() => retry()}>
          Try again
        </button>
      </div>
    </main>
  )
}
```

Проп называется `retry`, а не `reset` — это изменение Next.js 16.

- [ ] **Step 3: Переписать страницу**

Заменить содержимое `src/app/dashboard/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireSessionUser } from '@/lib/dal/session'
import { getProfile } from '@/lib/dal/user'
import { getOwnPromiseView } from '@/lib/dal/promise'
import { MAX_FREEZE_BALANCE } from '@/lib/streak'
import { checkInAction } from './actions'

export default async function DashboardPage() {
  await requireSessionUser()

  const profile = await getProfile()

  // redirect() throws a control-flow exception, so it must stay outside any
  // try/catch. A swallowed redirect is what used to strand new users here.
  if (!profile) redirect('/onboarding')

  const promise = await getOwnPromiseView(profile)
  if (!promise) redirect('/onboarding')

  return (
    <main className="min-h-screen p-4 md:p-8 bg-[#212529] text-white">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        <header className="flex flex-col md:flex-row justify-between items-center bg-white p-4 nes-container is-rounded">
          <div className="text-black text-center md:text-left mb-4 md:mb-0">
            <h1 className="text-2xl mb-1">never-give.app</h1>
            <p className="text-gray-500 text-sm">Player: {profile.username}</p>
          </div>
          <div className="flex gap-4">
            <Link href={`/${profile.username}`} className="nes-btn is-primary">
              View Public
            </Link>
          </div>
        </header>

        <section className="nes-container with-title bg-white text-black">
          <p className="title">Active Quest</p>
          <h2 className="text-2xl mb-8 text-center">{promise.title}</h2>

          <div className="flex flex-col md:flex-row justify-around items-center gap-8 mb-12">
            <div className="text-center">
              <p className="text-gray-500 text-sm mb-4">Current Streak</p>
              <p className="text-5xl text-red-500" data-testid="current-streak">
                {promise.currentStreak}
              </p>
            </div>

            <div className="flex flex-col items-center">
              <i
                className={`nes-mario ${
                  promise.currentStreak > 0 && !promise.checkedInToday ? 'is-moving' : ''
                } mb-4`}
                style={{ transform: 'scale(2)' }}
              />
              <p className="text-sm mt-4">Lvl {profile.avatarLevel}</p>
            </div>

            <div className="text-center">
              <p className="text-gray-500 text-sm mb-4">Best Streak</p>
              <p className="text-5xl" data-testid="best-streak">
                {promise.bestStreak}
              </p>
            </div>
          </div>

          <p className="text-center text-sm text-gray-500 mb-8">
            Streak freezes:{' '}
            <span data-testid="freeze-balance">{promise.freezeBalance}</span> /{' '}
            {MAX_FREEZE_BALANCE} — one is earned every 7 days and spent
            automatically on a missed day.
          </p>

          <form action={checkInAction} className="flex justify-center">
            <button
              type="submit"
              className={`nes-btn is-large text-xl px-12 py-4 ${
                promise.checkedInToday ? 'is-disabled' : 'is-success'
              }`}
              disabled={promise.checkedInToday}
            >
              {promise.checkedInToday ? 'DONE FOR TODAY' : 'CHECK IN TODAY'}
            </button>
          </form>
        </section>
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Проверить компиляцию и сборку**

Run: `npx tsc --noEmit && npm run lint`
Expected: без ошибок в `src/app/dashboard/`.

- [ ] **Step 5: Проверить вручную**

Run: `npm run dev`

Открыть `http://localhost:3000/dashboard` под существующим пользователем. Ожидается: экран отрисован, кнопка чек-ина активна, нажатие увеличивает текущий стрик на 1, кнопка становится `DONE FOR TODAY`. Повторная перезагрузка стрик не меняет.

- [ ] **Step 6: Коммит**

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
  - `type OnboardingError = 'invalid_username' | 'reserved_username' | 'username_taken' | 'empty_promise' | 'unknown'`
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

  const title = input.promiseTitle.trim()
  if (title.length === 0) return 'empty_promise'

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
import { validateUsername } from '@/lib/validation'
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

export interface OnboardingState {
  error?: string
}

const MESSAGES: Record<OnboardingError, string> = {
  invalid_username:
    'Username must be 3-20 characters: letters, digits, underscore.',
  reserved_username: 'That username is reserved. Pick another one.',
  username_taken: 'This username is already taken.',
  empty_promise: 'Describe what you are committing to.',
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

import { useActionState, useEffect, useRef } from 'react'
import { completeOnboarding, type OnboardingState } from './actions'

const INITIAL_STATE: OnboardingState = {}

export default function OnboardingForm() {
  const [state, action, pending] = useActionState(
    completeOnboarding,
    INITIAL_STATE,
  )
  const timezoneRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (timezoneRef.current) {
      timezoneRef.current.value =
        Intl.DateTimeFormat().resolvedOptions().timeZone
    }
  }, [])

  return (
    <form action={action} className="flex flex-col gap-6">
      {state.error && (
        <p className="nes-text is-error" aria-live="polite">
          {state.error}
        </p>
      )}

      <div className="nes-field">
        <label htmlFor="username">Choose a Username</label>
        <input
          type="text"
          id="username"
          name="username"
          className="nes-input"
          required
          minLength={3}
          maxLength={20}
          pattern="[a-zA-Z0-9_]+"
          title="Letters, digits and underscores, 3-20 characters"
        />
        <span className="text-xs text-gray-500 block mt-2">
          never-give.app/username
        </span>
      </div>

      <div className="nes-field">
        <label htmlFor="promise">Your Main Promise</label>
        <input
          type="text"
          id="promise"
          name="promise"
          className="nes-input"
          placeholder="e.g. Code every day"
          required
          maxLength={255}
        />
      </div>

      <div className="nes-field">
        <label htmlFor="visibility">Profile Visibility</label>
        <div className="nes-select">
          <select required id="visibility" name="visibility" defaultValue="public">
            <option value="public">Public (Recommended)</option>
            <option value="unlisted">Unlisted (Link only)</option>
          </select>
        </div>
      </div>

      <input type="hidden" name="timezone" ref={timezoneRef} defaultValue="UTC" />

      <button
        type="submit"
        className={`nes-btn is-primary w-full mt-4 ${pending ? 'is-disabled' : ''}`}
        disabled={pending}
      >
        {pending ? 'Starting...' : 'Start Game'}
      </button>
    </form>
  )
}
```

Таймзона проставляется в `useEffect`, а не инлайновым `<script>`: прежний вариант зависел от порядка выполнения скрипта и молча оставлял пустое значение, если форма отправлялась раньше.

- [ ] **Step 4: Переписать страницу**

Заменить содержимое `src/app/onboarding/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
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
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-[#212529]">
      <div className="nes-container is-rounded bg-white max-w-lg w-full text-black">
        <h2 className="title text-center mb-6 text-xl">Welcome, Player 1!</h2>
        <OnboardingForm />
      </div>
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
- Consumes: `getPublicProfile` из `src/lib/dal/user.ts`; `getPublicPromiseView` из `src/lib/dal/promise.ts`
- Produces: атрибуты `data-testid="current-streak"`, `data-testid="best-streak"` — те же, что на дашборде

**Контекст.** Чинятся дефекты 1.2, 1.3, 1.6 из [known-issues.md](../../known-issues.md). Копия `calculateStreak` удаляется вместе с UTC-расчётом; подмена фиктивными данными (`test` / `Read 10 pages`) убирается; `notFound()` выносится из `try`/`catch`.

Метаданные OG переезжают на файловую конвенцию `opengraph-image.tsx` в задаче 13, поэтому здесь блок `openGraph.images` не пишется вручную.

- [ ] **Step 1: Написать страницу 404**

Создать `src/app/[username]/not-found.tsx`:

```tsx
import Link from 'next/link'

export default function ProfileNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-[#212529]">
      <div className="nes-container with-title is-centered max-w-lg w-full bg-white text-black">
        <p className="title">404</p>
        <p className="mb-8">No player found at this address.</p>
        <Link href="/" className="nes-btn is-primary">
          Start Your Own Quest
        </Link>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Переписать страницу профиля**

Заменить содержимое `src/app/[username]/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicProfile } from '@/lib/dal/user'
import { getPublicPromiseView } from '@/lib/dal/promise'

interface PageProps {
  params: Promise<{ username: string }>
}

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

  return (
    <main className="min-h-screen p-4 md:p-8 bg-[#212529] text-white">
      <div className="max-w-3xl mx-auto">
        <div className="nes-container is-rounded bg-white text-black mb-8 p-8 flex flex-col items-center">
          <h1 className="text-3xl mb-2">{profile.username}</h1>
          <p className="text-gray-500 mb-8">is committing to:</p>
          <h2 className="text-2xl text-center font-bold mb-12">
            &ldquo;{promise.title}&rdquo;
          </h2>

          <div className="flex flex-col md:flex-row justify-around w-full items-center gap-8 mb-8">
            <div className="text-center">
              <p className="text-gray-500 text-sm mb-4">Current Streak</p>
              <p className="text-6xl text-red-500" data-testid="current-streak">
                {promise.currentStreak}
              </p>
            </div>

            <div className="flex flex-col items-center">
              <i
                className={`nes-mario ${promise.currentStreak > 0 ? 'is-moving' : ''}`}
                style={{ transform: 'scale(2.5)', margin: '2rem' }}
              />
              <p className="text-sm mt-4">Lvl {profile.avatarLevel}</p>
            </div>

            <div className="text-center">
              <p className="text-gray-500 text-sm mb-4">Best Streak</p>
              <p className="text-6xl" data-testid="best-streak">
                {promise.bestStreak}
              </p>
            </div>
          </div>
        </div>

        <div className="text-center">
          <a href="/" className="nes-btn is-primary">
            Start Your Own Quest
          </a>
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Проверить компиляцию**

Run: `npx tsc --noEmit && npm run lint`
Expected: без ошибок.

- [ ] **Step 4: Проверить вручную**

Run: `npm run dev`

Открыть `http://localhost:3000/<свой_username>` в приватном окне (без сессии). Ожидается: профиль виден, стрик совпадает с дашбордом. Открыть `http://localhost:3000/nosuchuser` — страница 404 из шага 1.

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
- Consumes: `getPublicProfile` из `src/lib/dal/user.ts`; `getPublicPromiseView` из `src/lib/dal/promise.ts`
- Produces: OG-картинка 1200×630 по маршруту, который Next подставляет в метаданные автоматически

**Контекст.** Чинятся дефекты 1.10 и 1.11 из [known-issues.md](../../known-issues.md). Расшариваемая картинка — главный канал распространения продукта, а сейчас она рисуется системным моноширинным шрифтом.

Переход на файловую конвенцию `opengraph-image.tsx` вместо ручного роута `/api/og` даёт автоматическую простановку `og:image`, `og:image:width` и `og:image:height` — руками их поддерживать больше не нужно.

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

export const alt = 'never-give.app streak'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const pressStart2P = await readFile(
  join(process.cwd(), 'assets/PressStart2P-Regular.ttf'),
)

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

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#212529',
          padding: 40,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'white',
            border: '8px solid black',
            boxShadow: '16px 16px 0px 0px rgba(0,0,0,1)',
            width: '100%',
            height: '100%',
            padding: 60,
          }}
        >
          <div style={{ fontSize: 36, color: '#000' }}>{displayName}</div>
          <div style={{ fontSize: 20, color: '#666', marginTop: 24 }}>
            is committing to
          </div>
          <div
            style={{
              fontSize: 40,
              color: '#000',
              marginTop: 32,
              textAlign: 'center',
              // Satori has no line clamping, so keep long titles from
              // pushing the streak out of frame.
              maxWidth: 900,
            }}
          >
            {title.length > 48 ? `${title.slice(0, 45)}...` : title}
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginTop: 56,
            }}
          >
            <span style={{ fontSize: 18, color: '#666' }}>CURRENT STREAK</span>
            <span style={{ fontSize: 96, color: '#e52521', marginTop: 16 }}>
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

### Task 14: E2E-тесты

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/fixtures.ts`
- Create: `e2e/streak.spec.ts`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `data-testid="current-streak"`, `data-testid="best-streak"` из задач 10 и 12
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

- [ ] **Step 7: Запустить E2E**

Run: `npm run test:e2e`
Expected: PASS — 3 теста. Первый запуск дольше остальных: Playwright собирает продовый билд.

- [ ] **Step 8: Коммит**

```bash
git add playwright.config.ts e2e/ package.json package-lock.json .gitignore
git commit -m "test: add Playwright end-to-end coverage for the streak flow"
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

Пункты 1.14 (`avatar_level` не растёт) и 1.15 (`private` не выбирается в онбординге) **не** трогать: они остаются как есть и уже описаны в части 2 как осознанные решения.

- [ ] **Step 4: Проверить, что документация не разошлась с кодом**

Пройти по чек-листу [docs/product-spec.md §7](../../product-spec.md) и отметить выполненные пункты. Любой невыполненный пункт — либо недоделанная задача, либо ошибка в спецификации; разобраться до коммита.

- [ ] **Step 5: Коммит**

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
| Vitest + Playwright | 1–4, 14 |
| Хостинг Vercel, без cron | архитектурная документация, §10 |
| Зарезервированные поля остаются в схеме | 5, документация |

**Покрытие дефектов из known-issues.md:** 1.1 → 10 · 1.2 → 1, 2 · 1.3 → 2, 10, 12 · 1.4 → 11 · 1.5 → 6, 11 · 1.6 → 10, 12 · 1.7 → 5 · 1.8 → 6, 7 · 1.9 → 3, 5, 9 · 1.10 → 13 · 1.11 → 13 · 1.12 → 1–4, 14 · 1.13 → выполнено при подготовке документации. Пункты 1.14 и 1.15 намеренно оставлены, зафиксированы в части 2.

**Согласованность имён между задачами:** `LocalDate`, `localDateOf`, `addDays`, `datesBetween`, `daysBetween` (задача 1) · `calculateStreak`, `coveredDays`, `planFreezes`, `earnedFreezeBalance`, `FREEZE_EARN_INTERVAL`, `MAX_FREEZE_BALANCE` (задачи 2, 3) · `validateUsername` (задача 4) · `streak_freezes` (задача 5) · `withUser`, `withAnon`, `DbTransaction` (задача 7) · `getSessionUser`, `requireSessionUser`, `getProfile`, `getPublicProfile`, `Profile`, `PublicProfile` (задача 8) · `getOwnPromiseView`, `getPublicPromiseView`, `checkIn`, `createProfileAndPromise` (задачи 9, 11) · `data-testid="current-streak"`, `data-testid="best-streak"` (задачи 10, 12, 14).
