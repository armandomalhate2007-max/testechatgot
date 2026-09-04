# Atelier v24

Consolidação all-in do Atelier: segurança, checkout, inventário, auditoria, 2FA com recovery codes, password reset, Docker, CI/E2E e operações de backup.

## Backend

```bash
cd backend/backend
npm ci
npx prisma migrate deploy
npm run build
npm test
npm run e2e
```

## Operações

```bash
npm run backup -- ./atelier-backup.dump
npm run restore -- ./atelier-backup.dump
npm run cleanup:uploads
```

## Produção

Leia `PRODUCTION-CHECKLIST.md` antes do deploy.

### Nota de validação

O ambiente de construção usado para esta entrega não conseguiu aceder ao registry npm, por isso não foi possível gerar um `package-lock.json` nem executar a instalação completa. Não declarar a pipeline verde até ela ser executada em CI com PostgreSQL e Chromium.


### Pagamentos

Para produção, configure um fornecedor e credenciais no ambiente. O modo `mock` é o único recomendado para desenvolvimento local. Para ClicPay, configure `PAYMENT_PROVIDER=clicpay`, `CLICPAY_TOKEN`, `CLICPAY_WALLET_ID` e `PAYMENT_WEBHOOK_SECRET`; a API documenta C2B M-Pesa/e-Mola, consulta de estado e webhooks. citeturn1view0turn2view0

Nunca coloque tokens de pagamento no frontend.

## Vercel + pagamentos automáticos

O frontend pode ser servido pela Vercel e a API exposta por `api/index.ts`. Para produção, configure um PostgreSQL externo e as variáveis de ambiente da Vercel. O checkout usa ClicPay para iniciar C2B M-Pesa/e-Mola e confirma o pedido através de webhook/consulta de estado.

No painel **Configurações → Pagamentos**, o administrador pode ativar/desativar M-Pesa/e-Mola e atualizar Wallet ID, token API e segredo do webhook. Tokens e segredos são cifrados antes de serem guardados na base de dados.

Webhook a configurar no gateway: `https://SEU-DOMINIO/api/payments/webhook`.

### Pagamento automático
O checkout de produção usa apenas M-Pesa/e-Mola automáticos via ClicPay. O cliente fornece o MSISDN e o backend inicia C2B; a confirmação final depende do webhook/consulta do gateway. A configuração pode ser administrada em `Configurações → Pagamentos`.
