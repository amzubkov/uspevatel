# Uspevatel App

Personal productivity app (GTD-based) with health tracking, travel planning, sports logging, nutrition tracking, money/payments, AI assistance and document management.

## Tech Stack

- **Mobile:** React Native 0.83 + Expo 55, TypeScript
- **Desktop:** Tauri v2 (Rust) + React + Vite — STALE: stuck at schema v20, mobile is far ahead; do not assume it runs against current DBs
- **State:** Zustand stores (mobile), React Context (desktop)
- **DB:** SQLite (expo-sqlite), SCHEMA_VERSION=47
- **Navigation:** React Navigation (bottom tabs + stack modals)
- **AI:** Ollama Cloud via `src/services/ollamaClient.ts`. Text default `glm-5.2`, vision `gemma4` (`DEFAULT_MODEL`/`VISION_MODEL`). `getOllamaModel()` auto-heals retired/paid saved models (kimi-k2.6, gemma3:27b, glm-5, deepseek-v4-*, qwen3.5:397b, gpt-oss:120b) → default. `ollamaChatJson` has a 120s abort timeout. Features: workout planner, lab-test advisor, lab report photo parser, travel doc photo parser, food photo/name recognition, diet menu generation
- **Secrets:** bot token and AI keys live in Android Keystore (`expo-secure-store`, `src/services/secrets.ts`), NOT in the settings table
- **Notifications:** `expo-notifications` (daily/weekly/task/flight/payment reminders) in `src/utils/notifications.ts`; `expo-audio` for the rest-timer beep (`assets/beep.wav`)
- **Telegram:** Bot API integration for adding tasks/flights/health/docs via commands; trusted-chat allowlist (first seen chat)

## Project Structure

```
App.tsx                  # Entry point, loads all stores in parallel
src/
  screens/               # App screens; big ones are split into subdirs
    health/              # HealthScreen modules (Metrics/Doctors/Contacts/Archive/AiAdvisor)
    planner/             # PlannerTab modules (FlightForm/Calendar/History/Import)
    nutrition/           # NutritionScreen sub-tabs (MenuPlan, ShoppingList)
    money/               # MoneyScreen sub-tab (UpcomingPayments)
    WorkoutPlanScreen.tsx# Date-based workout planning (Sport -> План tab)
    NutritionScreen.tsx  # Питание: tabs Дневник/Меню/Покупки; rings, diets, food scan/search
    MoneyScreen.tsx      # Деньги: tabs Счета/Платежи (accounts + recurring payments)
    DayReviewScreen.tsx  # Обзор дня: sleep/ratings/sport/food(kcal+БЖУ+fasting window)/goals
  store/                 # Zustand stores (20+)
  db/
    database.ts          # SQLite schema, migrations (v0-v47), queries
    migrate.ts           # AsyncStorage -> SQLite one-time migration
    seed.ts              # Preset data (exercises)
    healthPresets.ts     # Health metric presets
    foodCatalog.ts       # Bundled offline food catalog seed (~110 RU+USDA, per-100g macros)
  services/
    ollamaClient.ts      # Shared Ollama Cloud client (models, key, JSON extraction, timeout, legacy-model heal)
    aiPlannerService.ts  # AI workout plan (history, recovery, priorities, sleep, goal, programs)
    aiHealthService.ts   # Lab-test advisor + lab report photo parser (vision)
    aiTravelService.ts   # Ticket/booking photo parser (vision), incl. hotel address
    aiNutritionService.ts# Food photo/name recognition + diet menu generation (with ingredients)
    foodDatabase.ts      # Food search: offline food_catalog + Open Food Facts (online, no key)
    secrets.ts           # SecureStore-backed secrets with lazy migration from settings
    telegramService.ts   # Telegram Bot API wrapper (fetch, sendMessage)
    telegramParser.ts    # /task, /flight, /hotel, /doc, /health, /ref commands
  components/            # Reusable UI components (ZoomableImage, TelegramSync, ProgressRing, ...)
  types/index.ts         # TypeScript types and constants
  navigation/index.tsx   # Tab + stack navigation config
  utils/
    date.ts              # toDateStr/todayStr/shiftDateStr/WEEKDAYS_* (local-tz, use these!)
    workoutParser.ts     # Free-text workout parsing ("Жим 70х8") — pure, unit-testable
    calories.ts          # kcal formulas (physics-based for lifted weight, MET-based otherwise)
    nutrition.ts         # Per-100g macro math (kcal/protein/fat/carbs) — pure, unit-tested
    diets.ts             # Diet presets (macro split %) → gram goals from kcal
    notifications.ts     # expo-notifications schedulers (daily/weekly/task/flight/payment)
scripts/
  db-pull.sh             # Pull live SQLite from phone via adb run-as (WAL-aware)
  db-push.sh             # Push modified DB back (integrity check + force-stop)
desktop/                 # Tauri app — outdated, see Tech Stack note
android/                 # Android native build (com.uspevatel.app; versionCode in app.json + build.gradle)
modules/expo-file-copy/  # Custom Expo module
```

## Key Domain Concepts

- **Task categories (GTD):** IN (inbox) -> DAY / LATER / CONTROL / MAYBE. Priority: super/high/normal/low
- **Recurring tasks:** Days of week as array `[1,3,5]` = Mon/Wed/Fri
- **Projects:** Uppercase names, `isCurrent` flag for active projects
- **Health:** Flexible metrics with multi-source reference ranges (WHO, MZ_RF, USPSTF, JP, CN, EU); per-person via `person_id`
- **Sport/Exercise:** Weight types (0=bodyweight, 10=dumbbells, 100=barbell), calories per rep, priority 1-10 (higher = prefer in plans), workout programs (programs -> days -> day_exercises)
- **Workout plan:** `workout_plan` table — exercises per date with optional targets (sets/reps/weight); done-state derived from workout_logs for that date
- **Exercise images:** files in `files/exercise_images/<id>.<ext>`, relative path stored in `exercises.image_data`; GIFs supported (expo.gif.enabled)
- **Travel:** Flights + hotels, multi-traveler support via M2M table; hotels carry `address` for Google Maps deep link
- **Documents:** Name + sorted images, attachments system for any entity
- **Nutrition:** `nutrition_entries` (diary, per-100g macros + portion), `nutrition_plan` (editable day menu with `ingredients` JSON), `food_catalog` (offline product DB). Daily goals + diet split in settings (`nutritionGoal*`, `nutritionDiet`). Shopping list aggregates plan ingredients across days; bought state in `shoppingChecked` setting (shoppingStore). Fasting window = last meal today → first meal next day
- **Money:** `accounts` + `transactions` (Счета), `recurring_payments` (Платежи tab): due date, recurrence once/weekly/monthly/quarterly/semiannual/yearly, optional linked account, 3-day/1-day reminders; currencies RUB/EUR/USD($)/USDT(₮)
- **AI settings (settings table):** ollamaModel, aiSex, aiGoal, aiBirthYear, aiRestrictions; keys are in SecureStore

## Store Pattern (Zustand)

All stores follow the same pattern:
- `loaded` guard prevents duplicate loads
- `load()` reads from SQLite on app start
- Mutations: optimistic state update, then async DB write (fire-and-forget)
- IDs: `Crypto.randomUUID()` (exerciseStore uses integer autoincrement PKs and writes DB-first)
- Images stored as BLOBs or relative file paths, resolved to file URIs at runtime

## Telegram Commands

- `/task [project:XXX] subject[, deadline]` - create task (optional photo)
- `/flight route, date [time][, arrive_date]` - add flight (optional price: `150EUR`)
- `/hotel city, name, check-in, check-out` - add hotel booking
- `/doc name` - create document (photo or PDF attachment)
- `/health` (multiline) - `name, value[, unit, refMin, refMax]` bulk import
- `/ref source:XXX` (multiline) - import reference ranges
- `/plan [сегодня|завтра|вчера|DD.MM|YYYY-MM-DD]` - bot replies with workout plan for the date (sent on next sync)
- Only the trusted chat is processed (`tgAllowedChatId` setting, auto-set to first chat seen)

## Build & Run

```bash
npm start          # Expo dev server
npm run android    # Run on Android
npm run web        # Web version
cd android && ./gradlew assembleRelease   # Release APK (what actually ships to phones)
scripts/db-pull.sh [out.db]               # Pull live DB from connected phone
scripts/db-push.sh [in.db]                # Push DB back (force-stops the app)
```

## Important Notes

- UI strings are in Russian
- Android: `com.uspevatel.app`; with `USPEVATEL_RELEASE_*` credentials release is production-signed and non-debuggable. Without them (personal devices) release falls back to debug-keystore signing and stays debuggable so `scripts/db-pull.sh`/`db-push.sh` (`run-as`) keep working. Plain `assembleDebug` does NOT embed the JS bundle (needs Metro) — ship `assembleRelease`.
- DB migrations are incremental (v0→v49); real failures propagate (schema_version only advances on success), duplicate-column re-runs are ignored
- `tsc --noEmit` is clean — keep it that way
- Two phones run this app (owner + family member); data is per-device, no sync between them. DB changes via scripts must respect whichever phone is connected
- Google Sheets sync is dead (removed v8.12); folder sync is disabled in current builds
