# Deploy Atelier v28 on Vercel

## 1. GitHub
Upload the CONTENTS of this folder to the repository root. `package.json` and `vercel.json` must be at the repository root.

## 2. Vercel
Import the GitHub repository.

Use:
- Framework Preset: Other
- Root Directory: `.`
- Build Command: `npm run build`
- Output Directory: `public`
- Install Command: `npm ci`

## 3. Required environment variables
Set these in Vercel Project Settings → Environment Variables:

- DATABASE_URL
- NODE_ENV=production
- FRONTEND_ORIGIN (your HTTPS Vercel URL, e.g. https://your-app.vercel.app)
- COOKIE_SECURE=true
- TOTP_ENCRYPTION_KEY (64 hexadecimal characters)
- PAYMENT_PROVIDER=clicpay
- CLICPAY_BASE_URL=https://clicpay.co.mz
- CLICPAY_TOKEN
- CLICPAY_WALLET_ID
- PAYMENT_WEBHOOK_SECRET

Note: the app reads `CLICPAY_TOKEN` and `PAYMENT_WEBHOOK_SECRET` (not `CLICPAY_API_TOKEN` /
`CLICPAY_WEBHOOK_SECRET` — those names don't exist in the code and were a documentation mistake
in earlier versions of this file). `PAYMENT_PROVIDER` must be explicitly set to `clicpay`,
otherwise the app silently falls back to the `mock` payment provider. There is no
`CLICPAY_ENVIRONMENT` variable; use `CLICPAY_BASE_URL` pointed at ClicPay's sandbox or
production URL instead.

Optional but recommended:
- UPLOAD_DIR — on Vercel the deployed bundle is read-only, so the app defaults uploads to
  `/tmp/uploads` automatically when it detects it's running on Vercel. `/tmp` is not persistent
  or shared across invocations, so product images uploaded in production will not survive a
  cold start or a redeploy. For real production use, point uploads at external storage
  (e.g. Vercel Blob, S3, or R2) instead of the local filesystem.

Never commit `.env` or real credentials to GitHub.

## 4. Database
Run Prisma migrations against the production PostgreSQL database before using the admin or checkout.

## 5. Payment webhook
After the Vercel deployment has a stable HTTPS URL, configure the ClicPay webhook to point to the payment webhook endpoint exposed by the application.

## 6. Important
Do not consider payments production-ready until one real sandbox M-Pesa transaction and one real sandbox e-Mola transaction have been completed end-to-end and the webhook/reconciliation path has been verified.
