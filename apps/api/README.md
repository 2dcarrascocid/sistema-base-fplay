# API (AWS Lambda + API Gateway + Cognito)

Spec: [specs/02-autenticacion-y-seguridad-backend.md](../../specs/02-autenticacion-y-seguridad-backend.md).

| Lambda | Rol de BD | Qué hace |
|---|---|---|
| `auth` | `app_auth` | login, desafíos (MFA, cambio de contraseña), refresh/logout, federado, recuperación, invitaciones, registro |
| `me` | `app_api` | Mi cuenta: datos, contraseña, sesiones, MFA, foto |
| `preSignUp`, `preAuthentication`, `postAuthentication`, `customMessage` | `app_auth` | triggers de Cognito: cuentas vinculadas, bloqueo por intentos, auditoría, emails |

## Desarrollo y pruebas

Las pruebas usan la BD real del contenedor local, conectándose como `app_api` y `app_auth`. Cognito, SES, S3, Turnstile e HIBP se reemplazan por dobles.

```bash
pnpm db:start                          # desde la raíz
pnpm --filter @base/api test           # Vitest + cobertura (mínimo 80%)
pnpm --filter @base/api typecheck
pnpm --filter @base/api bundle:check   # empaqueta las Lambdas con esbuild (sin AWS)
```

## Despliegue (dev / prod)

Serverless Framework v4 exige iniciar sesión (`serverless login`) o una licencia según el tamaño de la organización.

### 1. Requisitos previos por stage (una vez)

1. **Base de datos (Supabase alojado, Data API desactivada).**
   - Aplica las migraciones con `supabase db push` (**nunca** con `--include-seed`: cargaría también `seed.local.sql`, con el superusuario y las contraseñas locales).
   - Carga la configuración base una sola vez: `psql "<url de conexión>" -v ON_ERROR_STOP=1 -f supabase/seed.sql`.
   - Habilita los roles con contraseñas generadas:
     ```sql
     alter role app_api with login password '<generada>';
     alter role app_auth with login password '<generada>';
     ```
2. **Secrets Manager:**

   | Secreto | Contenido |
   |---|---|
   | `base-fairplay/<stage>/db-api` | `{"username":"app_api","password":"…","ca":"<PEM del servidor>"}` |
   | `base-fairplay/<stage>/db-auth` | `{"username":"app_auth","password":"…","ca":"…"}` |
   | `base-fairplay/<stage>/app` | `{"turnstileSecret":"…","encryptionKey":"<≥32 caracteres aleatorios>"}` |
   | `base-fairplay/<stage>/identity-providers` | `googleClientId`, `googleClientSecret`, `facebookAppId`, `facebookAppSecret`, `appleServicesId`, `appleTeamId`, `appleKeyId`, `applePrivateKey` (solo los proveedores habilitados) |

3. **SES:** identidad verificada (dominio) para `emailFrom`, fuera del sandbox en prod.

### 2. Parámetros del stage (Serverless Dashboard o `--param`)

`webUrl`, `cognitoDomainPrefix`, `mobileRedirectUri`, `emailFrom`, `sesIdentityArn`, `turnstileHostname`, `dbHost`, `dbPort`, `dbName`, `apiDbSecretArn`, `authDbSecretArn`, `appSecretArn`, `idpSecretName`, `googleEnabled`, `facebookEnabled`, `appleEnabled`.

### 3. Desplegar y crear el superusuario

```bash
pnpm --filter @base/api deploy:dev
DATABASE_URL=… COGNITO_USER_POOL_ID=… WEB_URL=… AWS_REGION=… \
  pnpm --filter @base/api create-superuser -- --email ana@empresa.cl --first-name Ana --last-name Pérez
```

El script imprime un enlace de activación de un solo uso, válido 72 h. Entrégalo por un canal seguro.

En cada proveedor (Google, Facebook, Apple) registra como URL de redirección:
`https://<cognitoDomainPrefix>.auth.<region>.amazoncognito.com/oauth2/idpresponse`

### Web (Fase 3)

Requisitos adicionales por stage:
- certificado ACM en us-east-1 para `webDomain`;
- secreto `base-fairplay/<stage>/origin` con `{"value":"<≥32 caracteres aleatorios>"}`;
- parámetros `webDomain`, `certificateArn` y `originSecretArn`.

El stack debe desplegarse en us-east-1, porque el WAF de CloudFront y el certificado viven ahí.

```bash
pnpm --filter @base/api deploy:dev
VITE_TURNSTILE_SITE_KEY=<site key> pnpm --filter @base/web build
aws s3 sync apps/web/dist s3://<WebBucketName> --delete
aws cloudfront create-invalidation --distribution-id <WebDistributionId> --paths '/*'
```

Por último, apunta el DNS de `webDomain` a `WebDistributionDomain` (salida del stack).
