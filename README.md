# Atelier v28

Aplicação de e-commerce/admin consolidada para produção na Vercel, com Neon/PostgreSQL, Vercel Blob, inventário, checkout, pagamentos, auditoria, 2FA e recuperação de palavra-passe.

## Arquitetura atual

- **Vercel**: frontend estático em `public/` e função API em `api/index.ts`.
- **Neon/PostgreSQL**: produtos, stock, pedidos, utilizadores, sessões, configurações, pagamentos, eventos e auditoria.
- **Vercel Blob público**: ficheiros das fotografias dos produtos. O Neon guarda apenas as URLs.
- **`frontend/`**: cópia sincronizada de `public/` para desenvolvimento; a Vercel publica `public/`.

## Desenvolvimento

```bash
npm install
npm run build
npm test
npm run e2e
```

Para trabalhar diretamente no backend:

```bash
cd backend/backend
npm install
npx prisma migrate deploy
npm run build
npm test
npm run e2e
```

## Deploy Vercel

- Framework Preset: `Other`
- Root Directory: `.`
- Build Command: `npm run build`
- Output Directory: `public`
- Install Command: `npm install`

O projeto não usa `npm ci` enquanto não existir um `package-lock.json` versionado.

## Neon / Prisma

Antes de usar admin, checkout ou pagamentos em produção, aplicar as migrações:

```bash
cd backend/backend
npx prisma migrate deploy
```

A migração `20260904060000_production_reconciliation` reconcilia a cadeia histórica: garante `Product.images` e as estruturas de pagamentos/eventos quando uma base antiga já tinha objetos criados fora da cadeia de migrations.

**Não apagar a base Neon para corrigir um erro de deploy.**

## Fotografias dos produtos

O painel suporta **1 a 6 fotografias por produto**. A primeira é a principal.

- JPG, PNG e WebP.
- Máximo **4 MB por fotografia**.
- Em produção, o ficheiro vai para Vercel Blob.
- A URL pública é guardada em `Product.imageUrl` e `Product.images`.
- `/tmp` nunca é tratado como armazenamento permanente.

O limite de 4 MB é deliberado para ficar abaixo do limite de payload de 4.5 MB das funções Vercel. citeturn0search6

## Pagamentos

O checkout de produção apresenta M-Pesa e e-Mola. O backend inicia o pagamento e trata a confirmação por webhook/consulta.

Para ClicPay, configure:

- `PAYMENT_PROVIDER=clicpay`
- `CLICPAY_BASE_URL`
- `CLICPAY_TOKEN`
- `CLICPAY_WALLET_ID`
- `PAYMENT_WEBHOOK_SECRET`

Nunca colocar tokens no frontend ou no GitHub.

## Segurança

Inclui sessões com cookie, CSRF, rate limiting, Argon2id, 2FA com códigos de recuperação de utilização única, password reset e auditoria.

## Documentação operacional

- `VERCEL-DEPLOY.md` — configuração da Vercel, Neon, Blob e variáveis.
- `PRODUCTION-CHECKLIST.md` — checklist de go-live.
- `PAYMENTS-V26.md` — histórico e fluxo de pagamentos.
- `AUDIT-FINAL.md` — auditoria histórica; não substitui o checklist atual.

## Nota de validação

O ambiente desta revisão não teve acesso confiável ao registry npm, por isso não é correto declarar que `npm run build`, a suíte completa e os E2E foram executados aqui. Foi feita validação estática e correção da integração entre frontend, backend, Prisma, migrations e Vercel. A validação final deve ocorrer na Vercel/CI com as dependências instaladas e uma base PostgreSQL disponível.
