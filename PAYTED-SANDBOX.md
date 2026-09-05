# PayTED + e-Mola Sandbox

## Configuração no ADM

ADM → Configurações → Pagamentos:
- Gateway: PayTED
- Ambiente: Sandbox
- App ID: 1 por padrão. Se a PayTED fornecer outro identificador, substitua.
- Secret Key / API Token: usar a Secret Key Sandbox da PayTED (`sk_sandbox_...`)
- Webhook Secret: usar o Webhook Secret da PayTED
- e-Mola: ativo

A Publishable Key não é necessária no backend para este fluxo.

## Webhook

URL pública configurada na PayTED:
`https://testechatgot.vercel.app/api/payments/webhook`

## Observação importante

A documentação/SDK público da PayTED confirma que o débito direto usa `app_id`, `valor_total`, `referencia_externa`, `metodo` e `numero_cliente`, e que o método e-Mola usa o código `emola`. O painel mostrado pelo comerciante pode não exibir o App ID. O projeto usa `1` como padrão para permitir o primeiro teste; se a API responder que o `app_id` está incorreto, será necessário usar o identificador fornecido pela PayTED.

## Segurança

Nunca colocar Secret Key ou Webhook Secret no frontend, GitHub ou chat.
