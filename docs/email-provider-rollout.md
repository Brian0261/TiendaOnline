# Rollout de proveedor de correo (Recovery/Auth)

## Objetivo

Estandarizar el envío transaccional de auth (`forgot-password`, verificación de correo) por entorno:

- **Local**: Mailpit (SMTP)
- **Staging**: Mailtrap (SMTP y fallback API opcional)
- **Producción**: Resend API

## Variables de entorno por entorno

### Local

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_REQUIRE_AUTH=false
MAIL_FROM=no-reply@minimarket.local
MAIL_FROM_NAME=Minimarket Express
DEV_EMAIL_LINKS=1
```

### Staging

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=<smtp.mailtrap.io>
SMTP_PORT=<2525|587|465>
SMTP_SECURE=false
SMTP_REQUIRE_AUTH=true
SMTP_USER=<mailtrap_user>
SMTP_PASS=<mailtrap_pass>
SMTP_FALLBACK_PORTS=2525,587,465

MAILTRAP_API_FALLBACK_ENABLED=true
MAILTRAP_API_TOKEN=<mailtrap_api_token>
MAILTRAP_INBOX_ID=<mailtrap_inbox_id>
MAILTRAP_API_TIMEOUT_MS=10000

MAIL_FROM=<dominio_staging_verificado>
MAIL_FROM_NAME=Minimarket Express
DEV_EMAIL_LINKS=0
```

### Producción

```env
EMAIL_PROVIDER=resend
RESEND_API_KEY=<re_...>
RESEND_API_BASE_URL=https://api.resend.com
RESEND_API_TIMEOUT_MS=10000
RESEND_SMTP_FALLBACK_ENABLED=false

MAIL_FROM=no-reply@<tu-dominio-verificado>
MAIL_FROM_NAME=Minimarket Express
DEV_EMAIL_LINKS=0
```

## Comportamiento implementado

- `EMAIL_PROVIDER=resend`: envía vía Resend API.
- Si falla Resend y `RESEND_SMTP_FALLBACK_ENABLED=true` + SMTP configurado, aplica fallback a SMTP.
- `EMAIL_PROVIDER=smtp`: envía vía SMTP con fallback de puertos (`SMTP_FALLBACK_PORTS`) y luego fallback Mailtrap API (si está activo y configurado).
- Sin proveedor válido: cae a modo `console` (no envío real).

## Pasos manuales para producción (Resend)

1. Crear API key en Resend (scope mínimo para envío transaccional).
2. Verificar dominio de envío en Resend (`SPF` + `DKIM`; opcional `DMARC`).
3. Configurar `MAIL_FROM` con un remitente del dominio verificado (ej: `no-reply@midominio.com`).
4. Cargar variables en Railway (servicio API) y redeploy.
5. Validar endpoint `POST /api/auth/forgot-password` con usuario real de prueba.
6. Confirmar recepción, contenido y enlace de reset funcional en web.

## Checklist de validación rápida

- Forgot password responde siempre mensaje genérico (anti-enumeración).
- Se recibe correo en menos de 60s.
- El enlace contiene `token` y abre pantalla de reset correcta.
- Token de reset es de un solo uso.
- Token expirado devuelve error esperado.
- Logs no exponen token completo ni secretos.

## Comandos de validación local

Desde raíz del repositorio:

```bash
npm run api:test
```
