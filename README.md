# Base Fairplay

Sistema base reutilizable: usuarios, roles y perfiles; multi login (local, Google, Facebook, Apple vía Amazon Cognito); mantenedores de configuración; seguridad OWASP ASVS nivel 2.

Las especificaciones están en [`specs/`](specs/) y se escriben antes del código.

## Estructura

```
apps/
  api/        Lambdas TypeScript (Serverless Framework)
  web/        Vue 3 + Vite + Vuetify                         — fase 3
  mobile/     Flutter (solo usuario cliente)                 — fase 5
packages/
  shared/     validaciones compartidas: RUT, permisos, contraseñas, plantillas
  ui/         componentes Vue reutilizables                  — fase 3
supabase/
  migrations/ SQL estándar de PostgreSQL
  seed.sql    roles, menús, perfiles y configuración base (todos los entornos)
  seed.local.sql  solo contenedor local: superusuario y login de app_api/app_auth
  tests/      pruebas pgTAP
specs/        especificaciones (SDD)
```

## Requisitos

- Node.js 24 LTS (`.nvmrc`) y pnpm 10 (`corepack enable`)
- Docker Desktop: la base de datos corre **solo en contenedores**

## Base de datos local

Supabase CLI se usa únicamente para el contenedor de PostgreSQL 17, las migraciones y las pruebas. Auth, Storage, Realtime, PostgREST y Studio están desactivados en [`supabase/config.toml`](supabase/config.toml).

```bash
pnpm install
pnpm db:start     # levanta el contenedor de Postgres (puerto 54322) y aplica migraciones + semilla
pnpm db:test      # pruebas pgTAP
pnpm db:reset     # recrea la BD desde cero (migraciones + semilla)
pnpm db:stop
```

Conexión local: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Esquema: `app`.

Nueva migración: `pnpm exec supabase migration new <nombre>`.

## Pruebas

```bash
pnpm test         # Vitest con cobertura mínima 80% en todos los paquetes
pnpm typecheck
pnpm db:test      # pgTAP
```

## Roles de base de datos

| Rol | Uso |
|---|---|
| dueño de migraciones | DDL; dueño de tablas y funciones `SECURITY DEFINER` |
| `app_api` | Lambdas autenticadas; antes de cada consulta ejecutan `select set_config('app.user_id', '<uuid>', true)` |
| `app_auth` | flujos sin sesión: triggers de Cognito, login fallido, aceptar invitación |

Las migraciones crean `app_api` y `app_auth` como `NOLOGIN`. En cada entorno se habilitan con `ALTER ROLE app_api LOGIN PASSWORD '...'` y `sslmode=require`. La contraseña se guarda en AWS Secrets Manager.
