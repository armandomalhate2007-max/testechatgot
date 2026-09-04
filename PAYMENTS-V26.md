# Atelier v26 — Payments & Commerce

O checkout cria o pedido no backend e inicia o pagamento no backend; segredos nunca vão para o browser.

## Providers
- `mock`: desenvolvimento/testes (`MOCK_PAYMENT_AUTO_SUCCESS=true` simula sucesso).
- `mpesa`: M-Pesa C2B direto, com API Key, Public Key e Service Provider Code.
- `clicpay`: M-Pesa/e-Mola via API v2 e wallet.
- `pagar`: adaptador configurável existente.

## Fluxo
1. `POST /api/orders` cria pedido e reserva stock.
2. `POST /api/orders/:id/payments` inicia pagamento idempotente.
3. `PAID` confirma automaticamente pedido `PENDING`.
4. Webhook assinado atualiza estados assíncronos.
5. Back office mantém correção manual auditada.

## Go-live
Comece com `PAYMENT_PROVIDER=mock`, depois use sandbox. Só passe a produção após validar sucesso, recusa, timeout, retry, idempotência, webhook, expiração, reversão/reembolso e reconciliação. Nunca faça commit de credenciais reais.


## v27 hardening

- O checkout pode consultar o estado de um pagamento pendente em `POST /api/payments/:id/refresh`.
- ClicPay usa a consulta oficial de estado `GET /api/v2/transactions/{clicpay_reference}/status` como fallback ao webhook.
- Webhooks ClicPay aceitam `X-ClicPay-Signature`, `X-Webhook-ID` e `X-Event-Type`; eventos com o mesmo ID são deduplicados.
- O webhook extrai a transação de `data` quando o fornecedor usa o envelope ClicPay e valida valor/moeda antes de marcar o pagamento como pago.
- A documentação atual da ClicPay lista C2B para M-Pesa/e-Mola, consulta de estado e webhooks assinados. citeturn1view0turn2view0
