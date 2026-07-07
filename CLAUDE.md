# Uspevatel App

Personal productivity app (GTD-based) with health tracking, travel planning, sports logging, and document management.

## Tech Stack

- **Mobile:** React Native 0.83 + Expo 55, TypeScript
- **Desktop:** Tauri v2 (Rust) + React + Vite
- **State:** Zustand stores (mobile), React Context (desktop)
- **DB:** SQLite (expo-sqlite mobile, tauri-plugin-sql desktop), SCHEMA_VERSION=20
- **Navigation:** React Navigation (bottom tabs + stack modals)
- **Sync:** HTTP sync with Google Sheets via Apps Script, manual conflict resolution
- **Telegram:** Bot API integration for adding tasks/flights/health/docs via commands

## Project Structure

```
App.tsx                  # Entry point, loads all stores in parallel
src/
  screens/               # All app screens (25+)
  store/                 # Zustand stores (15 stores)
  db/
    database.ts          # SQLite schema, migrations (v0-v20), queries
    migrate.ts           # AsyncStorage -> SQLite one-time migration
    seed.ts              # Preset data (exercises)
    healthPresets.ts     # Health metric presets
  services/
    telegramService.ts   # Telegram Bot API wrapper
    telegramParser.ts    # /task, /flight, /hotel, /doc, /health, /ref commands
    syncService.ts       # Remote sync logic (fetch, compute diff, push)
  components/            # Reusable UI components
  types/index.ts         # All TypeScript types and constants
  navigation/index.tsx   # Tab + stack navigation config
  utils/
desktop/
  src/                   # React frontend (mirrors mobile screens)
  src-tauri/             # Rust/Tauri backend config
android/                 # Android native build (com.uspevatel.app; versionCode in app.json + build.gradle)
modules/expo-file-copy/  # Custom Expo module
```

## Key Domain Concepts

- **Task categories (GTD):** IN (inbox) -> DAY / LATER / CONTROL / MAYBE. Priority: super/high/normal/low
- **Recurring tasks:** Days of week as array `[1,3,5]` = Mon/Wed/Fri
- **Projects:** Uppercase names, `isCurrent` flag for active projects
- **Health:** Flexible metrics with multi-source reference ranges (WHO, MZ_RF, USPSTF, JP, CN, EU)
- **Sport/Exercise:** Weight types (0=bodyweight, 10=dumbbells, 100=barbell), calories per rep, workout programs
- **Travel:** Flights + hotels, multi-traveler support via M2M table
- **Documents:** Name + sorted images, attachments system for any entity

## Store Pattern (Zustand)

All stores follow the same pattern:
- `loaded` guard prevents duplicate loads
- `load()` reads from SQLite on app start
- Mutations: optimistic state update, then async DB write (fire-and-forget)
- IDs: `Crypto.randomUUID()`
- Images stored as BLOBs, resolved to file URIs at runtime

## Telegram Commands

- `/task [project:XXX] subject[, deadline]` - create task (optional photo)
- `/flight route, date [time][, arrive_date]` - add flight (optional price: `150EUR`)
- `/hotel city, name, check-in, check-out` - add hotel booking
- `/doc name` - create document (photo or PDF attachment)
- `/health` (multiline) - `name, value[, unit, refMin, refMax]` bulk import
- `/ref source:XXX` (multiline) - import reference ranges
- `/plan [сегодня|завтра|вчера|DD.MM|YYYY-MM-DD]` - bot replies with workout plan for the date (sent on next sync)

## Build & Run

```bash
npm start          # Expo dev server
npm run android    # Run on Android
npm run web        # Web version
cd desktop && npm run tauri dev  # Desktop app
```

## Important Notes

- UI strings are in Russian
- Android: `com.uspevatel.app`, currently uses debug keystore for release signing
- DB migrations are incremental (v0->v20), with error handling per migration step
- Sync uses `knownSyncIds` to track deletions (append-only tracking)
