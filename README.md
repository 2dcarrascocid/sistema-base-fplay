# Base Fairplay

Sistema base reutilizable: usuarios, roles y perfiles; multi login (local, Google, Facebook, Apple vía Amazon Cognito); mantenedores de configuración; seguridad OWASP ASVS nivel 2.

Las especificaciones están en [`specs/`](specs/) y se escriben antes del código.

## Estructura

```
apps/
  api/        Lambdas TypeScript (Serverless Framework)
  web/        Vue 3 + Vite + Vuetify 3 + Pinia + vue-i18n (es/en)
  mobile/     Flutter (solo usuario cliente)                 — fase 5
packages/
  shared/     validaciones compartidas: RUT, permisos, contraseñas, plantillas
  ui/         componentes Vue reutilizables
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

## Entorno local navegable (sin AWS)

En un equipo nuevo basta con clonar, abrir Docker Desktop y ejecutar:

```bash
corepack enable   # una vez por equipo: deja disponible pnpm
pnpm dev          # BD en contenedor + API local (:3000) + web (http://localhost:5173)
```

Antes de levantar la API y la web, `pnpm dev` ejecuta [`scripts/db-ensure.mjs`](scripts/db-ensure.mjs) (también disponible como `pnpm db:ensure`):

1. Instala las dependencias si faltan.
2. Verifica que Docker esté corriendo.
3. Inicia el contenedor de PostgreSQL. La primera vez descarga la imagen y crea la BD con migraciones y semillas.
4. Aplica las migraciones pendientes (por ejemplo, las que llegaron con un `git pull`).
5. Carga `seed.sql` y `seed.local.sql` si sus datos no existen.

Todos los pasos se pueden repetir sin efecto: si todo está listo, no cambia nada.

- Usuario: `superadmin@local.test` · contraseña `Local-Dev-2026!` · código MFA `123456`.
- La API local (`apps/api/dev/server.ts`) usa las mismas rutas que las Lambdas, sobre la BD del contenedor, con Cognito, SES y S3 simulados. Los emails (invitaciones, códigos) aparecen en la consola. Google, Facebook y Apple se simulan con una pantalla donde eliges el usuario.
- El servidor de desarrollo nunca se despliega y se niega a arrancar con `NODE_ENV=production`.

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
