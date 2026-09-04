# Atelier — checklist de produção

## 1. Aplicação
- [ ] `npm install` termina sem erro na Vercel.
- [ ] `npm run build` termina com Prisma Generate + TypeScript sem erro.
- [ ] `npm test` passa a partir da raiz do repositório.
- [ ] `npm run e2e` passa quando o ambiente de teste tiver o backend, PostgreSQL e Chromium disponíveis.
- [ ] `public/index.html` e `frontend/index.html` estão sincronizados.
- [ ] `public/js/app.js` e `frontend/js/app.js` estão sincronizados.

## 2. Neon / PostgreSQL
- [ ] `DATABASE_URL` aponta para a base Neon de produção.
- [ ] `npx prisma migrate deploy` foi executado na base de produção.
- [ ] A migração `20260904060000_production_reconciliation` foi aplicada.
- [ ] Produtos, stock, pedidos, pagamentos, auditoria e sessões existem na base.
- [ ] Não apagar dados existentes para resolver erros de deploy.

## 3. Vercel
- [ ] Framework Preset: `Other`.
- [ ] Root Directory: `.`.
- [ ] Build Command: `npm run build`.
- [ ] Output Directory: `public`.
- [ ] Install Command: `npm install` enquanto o repositório não tiver `package-lock.json` versionado.
- [ ] `NODE_ENV=production`.
- [ ] `FRONTEND_ORIGIN` usa HTTPS e corresponde ao domínio da loja.
- [ ] `COOKIE_SECURE=true`.
- [ ] `TRUST_PROXY=true` quando aplicável.
- [ ] `TOTP_ENCRYPTION_KEY` é uma chave hex de 64 caracteres e não está no GitHub.

## 4. Imagens
A produção usa **Vercel Blob** para os ficheiros e **Neon** para as URLs dos produtos.

- [ ] O Blob Store está criado com acesso **Public**.
- [ ] O Blob Store está ligado ao projeto Vercel.
- [ ] A função consegue autenticar no Blob através das variáveis/credenciais fornecidas pela Vercel.
- [ ] Um upload de teste pequeno termina com sucesso.
- [ ] A URL devolvida começa por `https://...public.blob.vercel-storage.com/`.
- [ ] A URL fica guardada em `Product.imageUrl` e `Product.images` no Neon.
- [ ] Cada fotografia enviada pelo painel tem no máximo **4 MB**. O limite de 4 MB é deliberado para ficar abaixo do limite de payload de funções da Vercel.
- [ ] Não usar `/tmp/uploads` como armazenamento permanente.

## 5. Pagamentos
- [ ] `PAYMENT_PROVIDER=clicpay` em produção.
- [ ] `CLICPAY_BASE_URL` está correto para o ambiente usado.
- [ ] `CLICPAY_TOKEN`, `CLICPAY_WALLET_ID` e `PAYMENT_WEBHOOK_SECRET` estão configurados como secrets.
- [ ] O webhook aponta para `/api/payments/webhook` no domínio HTTPS final.
- [ ] Foi testado um pagamento M-Pesa de sandbox ponta a ponta.
- [ ] Foi testado um pagamento e-Mola de sandbox ponta a ponta.
- [ ] A confirmação por webhook e a consulta de estado funcionam.

## 6. Segurança
- [ ] Login, sessão, CSRF, rate limiting e 2FA foram testados.
- [ ] O 2FA só é ativado depois de validar um código.
- [ ] Os códigos de recuperação são guardados apenas em hash.
- [ ] O caminho de recuperação da palavra-passe usa um fornecedor de e-mail/webhook real.
- [ ] Nenhum token ou password real está no repositório.

## 7. Antes de abrir ao público
- [ ] Fazer backup da base de dados e testar o restore.
- [ ] Fazer um pedido de teste com retirada.
- [ ] Fazer um pedido de teste com entrega e localização permitida.
- [ ] Confirmar que stock é decrementado uma vez e é restaurado quando o pedido é cancelado/rejeitado.
- [ ] Confirmar que uma imagem nova continua acessível depois de um novo deploy.
