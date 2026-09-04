# Deploy do Atelier na Vercel

## 1. Repositório GitHub
Na raiz do repositório devem existir:

- `package.json`
- `vercel.json`
- `api/index.ts`
- `public/index.html`
- `public/js/app.js`
- `public/js/api.js`
- `backend/backend/...`

A Vercel publica a pasta `public`. A pasta `frontend` é mantida como cópia de trabalho e deve permanecer sincronizada com `public`.

## 2. Configuração da Vercel
- Framework Preset: **Other**
- Root Directory: `.`
- Build Command: `npm run build`
- Output Directory: `public`
- Install Command: `npm install`

Não trocar para `npm ci` enquanto não existir um `package-lock.json` versionado no repositório.

## 3. Variáveis obrigatórias
### Aplicação
- `DATABASE_URL`
- `NODE_ENV=production`
- `FRONTEND_ORIGIN=https://SEU-DOMINIO`
- `COOKIE_SECURE=true`
- `TOTP_ENCRYPTION_KEY`

### Imagens
O projeto usa Vercel Blob público para imagens. Ligue o Blob Store ao projeto Vercel. A função usa o `@vercel/blob` e aceita o identificador do store através de `BLOB_STORE_ID`; também reconhece os nomes `imagem_STORE_ID`/`IMAGEM_STORE_ID` caso o store tenha sido criado com esse prefixo.

Não colocar `BLOB_READ_WRITE_TOKEN` no frontend e nunca o commitar no GitHub.

### Pagamentos, se forem ativados
- `PAYMENT_PROVIDER=clicpay`
- `CLICPAY_BASE_URL`
- `CLICPAY_TOKEN`
- `CLICPAY_WALLET_ID`
- `PAYMENT_WEBHOOK_SECRET`

O código não usa `CLICPAY_API_TOKEN`, `CLICPAY_WEBHOOK_SECRET` nem `CLICPAY_ENVIRONMENT`.

## 4. Neon / Prisma
Depois de ligar o `DATABASE_URL`, aplicar as migrações:

```bash
cd backend/backend
npx prisma migrate deploy
```

A migração final de reconciliação é `20260904060000_production_reconciliation`. Ela garante a coluna `Product.images` e as estruturas de pagamentos/eventos quando a cadeia histórica estiver incompleta.

Não apagar a base Neon para corrigir um erro de deploy.

## 5. Imagens
O upload do painel envia cada imagem para `/api/uploads/image`.

- Formatos: JPG, PNG e WebP.
- Limite por imagem: 4 MB.
- Em produção: ficheiro no Vercel Blob, URL no Neon.
- O filesystem `/tmp` não é usado como armazenamento permanente.

O limite de 4 MB é intencional: a Vercel documenta um limite de 4.5 MB para payload de funções, por isso o painel fica abaixo desse teto. citeturn0search6

## 6. Webhook de pagamentos
Depois do domínio HTTPS final estar ativo, configure no gateway:

`https://SEU-DOMINIO/api/payments/webhook`

O webhook deve enviar a assinatura esperada pelo backend.

## 7. Teste final
1. Abrir a loja.
2. Entrar no Admin.
3. Criar um produto com referência, preço e stock.
4. Adicionar 1–6 fotografias pequenas.
5. Guardar.
6. Confirmar a imagem na loja.
7. Editar o produto e confirmar que todas as fotografias continuam listadas.
8. Fazer um pedido de teste.
9. Confirmar stock e estado do pedido.
