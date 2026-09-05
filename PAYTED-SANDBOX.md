# PayTED Sandbox — Atelier v28

Integração adicionada para PayTED com e-Mola/M-Pesa. O segredo fica no backend/BD encriptado; nunca no frontend.

## Configuração no ADM
- Gateway: PayTED
- App ID: ID da App PayTED
- API Key / Secret Key: Secret Key (Sandbox)
- Webhook Secret: Webhook Secret da PayTED
- Base URL Sandbox: `https://pay.ted.co.mz/api`
- e-Mola: ativo

## Webhook
`https://testechatgot.vercel.app/api/payments/webhook`

## Teste e-Mola
A documentação/SDK oficial da PayTED usa débito directo com `app_id`, `valor_total`, `referencia_externa`, `metodo` e `numero_cliente`. O SDK indica `emola` como método suportado e consulta por ID/referência.

O projecto mantém os caminhos configuráveis por variáveis de ambiente `PAYTED_DEBIT_PATH` e `PAYTED_STATUS_PATH` caso a conta PayTED apresente rotas diferentes.
