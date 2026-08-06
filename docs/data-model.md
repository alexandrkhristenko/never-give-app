# Модель данных

Диалект: PostgreSQL (Supabase). Источники истины:

- **таблицы, колонки, индексы, ограничения** — `src/db/schema.ts` (Drizzle),
  миграции генерируются из него
- **политики RLS и гранты** — `drizzle/0001_rls_policies.sql`, написана вручную

Разделение намеренное: у грантов нет представления в Drizzle, а держать
политики рядом с грантами, от которых они зависят, надёжнее, чем разносить
защиту по двум механизмам. Это безопасно, потому что проект использует
`db:generate` + `db:migrate` (сравнение со снапшотом), а не `db:push`
(сравнение с живой БД, которое снесло бы неизвестные ему политики).

Легенда статуса поля:

- **живое** — читается и пишется приложением
- **зарезервировано** — есть в схеме, но приложение его не использует;
  оставлено под будущие фичи, см. [product-spec.md §2](./product-spec.md)

---

## Соглашения

- Первичные ключи — `uuid`
- Имена колонок — `snake_case`
- Временные метки — `timestamp` с `defaultNow()`
- Локальные даты — тип `date`, строка `YYYY-MM-DD` в таймзоне пользователя
- Все таблицы в схеме `public` и обязаны иметь включённую RLS

---

## `users`

Профиль приложения. **`users.id` всегда равен `auth.users.id`** из Supabase Auth —
на этом держится вся авторизация: политики RLS сравнивают `auth.uid()` с `users.id`.

| Колонка | Тип | Статус | Описание |
|---|---|---|---|
| `id` | `uuid` PK | живое | Равен `auth.users.id`. FK на `auth.users` с `ON DELETE CASCADE` |
| `email` | `varchar(255)` UNIQUE | живое | Дублируется из Supabase Auth. Не отдаётся анониму |
| `username` | `varchar(255)` UNIQUE | живое | Публичный идентификатор, путь `/<username>` |
| `timezone` | `varchar(255)` | живое | IANA-идентификатор, по умолчанию `UTC`. Определяет границу суток |
| `avatar_level` | `integer` | частично | Отображается на дашборде и в профиле, но **никогда не растёт**. Прокачка зарезервирована |
| `total_score` | `integer` | зарезервировано | Очки за активность |
| `streak_freezes_balance` | `integer` | живое | Баланс заморозок, потолок 3. См. [product-spec.md §4.5](./product-spec.md) |
| `is_premium` | `boolean` | зарезервировано | Платный тариф |
| `created_at` | `timestamp` | живое | |

**Инварианты:**

- `id` совпадает с id пользователя в Supabase Auth. Нарушение = пользователь
  теряет доступ к своим данным под RLS
- `username` уникален регистронезависимо (уникальный индекс по `lower(username)`)
- `0 <= streak_freezes_balance <= 3` (CHECK-ограничение)

## `promises`

Обещание. В MVP приложение показывает **первое** обещание пользователя.

| Колонка | Тип | Статус | Описание |
|---|---|---|---|
| `id` | `uuid` PK | живое | |
| `user_id` | `uuid` FK → `users.id` `ON DELETE CASCADE` | живое | Владелец |
| `title` | `varchar(255)` | живое | Текст обещания |
| `visibility` | `varchar(50)` | живое | `public` \| `unlisted` \| `private`. См. [product-spec.md §5](./product-spec.md) |
| `cadence` | `varchar(50)` | зарезервировано | Всегда `daily`. `weekly` не реализован |
| `cadence_count` | `integer` | зарезервировано | Всегда `1` |
| `status` | `varchar(50)` | зарезервировано | Всегда `active`. Архивация не реализована |
| `created_at` | `timestamp` | живое | |
| `updated_at` | `timestamp` | живое | |

**Индексы:** `promises_user_id_idx` на `user_id` — нужен политикам RLS,
которые фильтруют по владельцу.

## `checkins`

Отметка «сделал сегодня».

| Колонка | Тип | Статус | Описание |
|---|---|---|---|
| `id` | `uuid` PK | живое | |
| `promise_id` | `uuid` FK → `promises.id` `ON DELETE CASCADE` | живое | |
| `local_date` | `date` | живое | `YYYY-MM-DD` в таймзоне пользователя на момент отметки |
| `note` | `text` | зарезервировано | Заметка к чек-ину |
| `created_at` | `timestamp` | живое | |

**Инварианты:**

- `UNIQUE (promise_id, local_date)` — не больше одной отметки в сутки.
  Ограничение `checkin_promise_date_unique`. Вставка идёт через
  `onConflictDoNothing()`, поэтому двойной клик безвреден
- Уникальный индекс покрывает и запросы RLS по `promise_id`

## `streak_freezes`

**Новая таблица.** Журнал списанных заморозок. Без него ленивое списание не
идемпотентно: при каждой загрузке дашборда пропуск считался бы заново и
съедал новую заморозку.

| Колонка | Тип | Статус | Описание |
|---|---|---|---|
| `id` | `uuid` PK | живое | |
| `promise_id` | `uuid` FK → `promises.id` `ON DELETE CASCADE` | живое | |
| `local_date` | `date` | живое | Закрытый заморозкой день |
| `created_at` | `timestamp` | живое | Когда заморозка была фактически списана |

**Инварианты:**

- `UNIQUE (promise_id, local_date)` — ограничение `streak_freeze_promise_date_unique`
- Дата не может одновременно быть в `checkins` и `streak_freezes` для одного
  обещания. Гарантируется логикой: замораживаются только незакрытые дни
- Списание заморозки и декремент `users.streak_freezes_balance` происходят
  **в одной транзакции**

## `followers`

**Зарезервирована целиком.** Приложение к ней не обращается. RLS включена,
политик нет — то есть доступа нет ни у кого, кроме сервисной роли. Это
намеренный безопасный дефолт до появления фичи подписок.

| Колонка | Тип | Описание |
|---|---|---|
| `follower_id` | `uuid` FK → `users.id` | Кто подписан |
| `following_id` | `uuid` FK → `users.id` | На кого |
| `created_at` | `timestamp` | |

PK — составной `(follower_id, following_id)`.

---

## Row Level Security

Все запросы приложения идут через Drizzle по `DATABASE_URL`, но **не** под
привилегированной ролью: каждый запрос обёрнут в транзакцию, где выставлены
`role` и `request.jwt.claims`. Детали — в [architecture.md §5](./architecture.md).

Принципы политик (взяты из `.agents/skills/supabase-postgres-best-practices`):

- Роль указывается в `TO`, а не через `auth.role()` — тот устарел и ломается
  при включённых анонимных входах
- `TO authenticated` сам по себе — это аутентификация без авторизации.
  Всегда добавляется предикат владения
- `UPDATE` требует и `USING`, и `WITH CHECK` — иначе пользователь может
  переписать `user_id` на чужой
- `auth.uid()` оборачивается в `(select auth.uid())` — иначе функция вызывается
  на каждую строку
- Колонки, которые не должны видеть анонимы (`email`), закрываются
  **колоночными грантами**, потому что RLS фильтрует строки, а не колонки

### Сводка политик

| Таблица | Роль | Операция | Условие |
|---|---|---|---|
| `users` | `anon`, `authenticated` | SELECT | `true` (колонки ограничены грантами) |
| `users` | `authenticated` | INSERT | `WITH CHECK ((select auth.uid()) = id)` |
| `users` | `authenticated` | UPDATE | `USING` и `WITH CHECK`: `(select auth.uid()) = id` |
| `promises` | `anon` | SELECT | `visibility <> 'private'` |
| `promises` | `authenticated` | SELECT | `visibility <> 'private' OR (select auth.uid()) = user_id` |
| `promises` | `authenticated` | INSERT | `WITH CHECK ((select auth.uid()) = user_id)` |
| `promises` | `authenticated` | UPDATE | `USING` и `WITH CHECK`: `(select auth.uid()) = user_id` |
| `checkins` | `anon` | SELECT | обещание существует и не `private` |
| `checkins` | `authenticated` | SELECT | обещание видимо или своё |
| `checkins` | `authenticated` | INSERT | обещание принадлежит вызывающему |
| `streak_freezes` | `anon` | SELECT | обещание существует и не `private` |
| `streak_freezes` | `authenticated` | SELECT | обещание видимо или своё |
| `streak_freezes` | `authenticated` | INSERT | обещание принадлежит вызывающему |
| `followers` | — | — | RLS включена, политик нет → доступа нет |

`DELETE` не разрешён нигде: MVP не удаляет данные.

### Колоночные гранты на `users`

```sql
revoke all on public.users from anon, authenticated;

grant select (id, username, timezone, avatar_level, created_at)
  on public.users to anon;

grant select (id, username, timezone, avatar_level,
              total_score, streak_freezes_balance, is_premium, created_at)
  on public.users to authenticated;

grant insert on public.users to authenticated;
grant update (username, timezone, streak_freezes_balance)
  on public.users to authenticated;
```

**`email` не выдан на чтение никому.** Политика `users_select_public`
разрешает читать все строки — это нужно для публичных профилей. Значит любая
колонка, доступная роли на `select`, доступна для всех пользователей сразу.
Приложению `email` из `public.users` не нужен: он берётся из сессии Supabase.
На запись колонка доступна через `grant insert`, которым онбординг и
заполняет её.

Побочное следствие: залогиненный пользователь может прочитать чужие
`total_score`, `streak_freezes_balance` и `is_premium`. Это не считается
чувствительным — сам стрик и так публичен.

---

## Что осознанно не сделано

- **Нет FK `checkins.local_date` → календаря.** Даты валидируются кодом
- **Нет истории смены таймзоны.** Если пользователь переедет в другой часовой
  пояс, прошлые `local_date` останутся посчитанными по старой зоне. Стрик может
  сдвинуться на день. Для MVP приемлемо, зафиксировано в
  [known-issues.md](./known-issues.md)
- **Нет мягкого удаления.** `ON DELETE CASCADE` от `auth.users` вниз по графу
