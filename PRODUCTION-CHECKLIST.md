# Atelier — Production checklist

## GO antes de abrir ao público
- [ ] Executar `npm ci` com lockfile versionado.
- [ ] `prisma migrate deploy` contra uma BD nova e contra uma cópia de produção.
- [ ] `npm run build && npm test && npm run e2e` verdes.
- [ ] Teste de concorrência de stock verde.
- [ ] Teste de restore PostgreSQL realizado e verificado.
- [ ] HTTPS no frontend/reverse proxy.
- [ ] `COOKIE_SECURE=true` e `TRUST_PROXY=true` quando aplicável.
- [ ] `TOTP_ENCRYPTION_KEY` guardada num secret manager.
- [ ] `POSTGRES_PASSWORD` guardada num secret manager.
- [ ] Webhook de password reset ligado a um fornecedor de e-mail.
- [ ] Backups automáticos e retenção definidos.
- [ ] Imagens persistentes e backup do volume/uploads.
- [ ] Alertas de saúde, erros e espaço configurados.

## NO-GO se
- [ ] Dependências não estão reproduzivelmente instaladas.
- [ ] Não existe backup testado.
- [ ] HTTPS não está ativo.
- [ ] Secrets estão no repositório.
- [ ] CI/E2E está vermelho ou não executado.
- [ ] Não existe caminho operacional para recuperar o acesso 2FA.

## Nota
O Atelier continua com armazenamento local de imagens por padrão. Para multi-node, mover `UPLOAD_DIR` para um volume partilhado ou adicionar um adapter S3/R2 antes de escalar horizontalmente.
