# O que estava a impedir o deploy na Vercel — e o que corrigi

Analisei o zip inteiro (backend, api/, vercel.json, prisma, docs) e encontrei 5 problemas
concretos. Os dois primeiros, sozinhos, já chegam para o build falhar sempre na Vercel.

## 1. `dotenv` usado mas nunca instalado (causa mais provável do build falhar)
`backend/backend/src/server.ts` e `create-admin.ts` têm `import 'dotenv/config'`, mas o pacote
`dotenv` nunca estava listado nem no `package.json` da raiz nem no do backend. O comando de
build (`npm run build` → `tsc`) falhava com "Cannot find module 'dotenv/config'" e a Vercel
abortava o deploy antes de sequer chegar à fase de publicar.
**Corrigido:** adicionei `"dotenv": "latest"` às dependências dos dois `package.json`.

## 2. Erro de tipo genuíno em `payments.ts` (também fazia o `tsc` falhar)
Em `MpesaProvider.createCharge`, o campo `status` era devolvido como `string` simples
(`ok?'PAID':'FAILED'`) em vez do tipo `ProviderStatus`, o que a interface `PaymentProvider`
exige. Com `strict: true` no `tsconfig.json`, isto é erro de compilação, não aviso.
**Corrigido:** `status:(ok?'PAID':'FAILED') as ProviderStatus`.

## 3. Uploads a tentar escrever num filesystem só-de-leitura
`UPLOAD_DIR` apontava por defeito para uma pasta dentro do próprio bundle da aplicação. Na
Vercel (ambiente serverless/Lambda) esse filesystem é só-de-leitura — só `/tmp` é gravável. Como
o `mkdir` dessa pasta corre logo no arranque do módulo (top-level await), a função da API
rebentava em **todos** os pedidos (erro 500), mesmo que o build passasse.
**Corrigido:** por defeito, quando `process.env.VERCEL` está definido, usa `/tmp/uploads`.
⚠️ Nota importante: `/tmp` não é persistente nem partilhado entre execuções — para uploads de
produção a sério, precisas de um storage externo (Vercel Blob, S3, R2, etc.). Isto resolve o
deploy, não resolve "guardar imagens para sempre" em serverless.

## 4. Prisma sem `binaryTargets` para o ambiente da Vercel
O `schema.prisma` só gerava o engine "native" (o do teu computador/CI). Isto costuma causar o
clássico erro "Prisma Client could not locate the Query Engine" em produção na Vercel.
**Corrigido:** `binaryTargets = ["native", "rhel-openssl-3.0.x"]`.

## 5. `vercel.json` e documentação
- Troquei o `routes` (formato antigo, mais propenso a conflitos) por `rewrites` (recomendado
  atualmente), mantendo o mesmo comportamento: tudo em `/api/*` vai para `api/index.ts`, o resto
  serve os ficheiros estáticos de `public/` automaticamente.
- Adicionei `installCommand: npm ci` explícito.
- `engines.node` estava como `">=20"`, que a Vercel nem sempre reconhece bem; passei para
  `"20.x"`.
- `VERCEL-DEPLOY.md` listava variáveis de ambiente **que não existem no código**
  (`CLICPAY_API_TOKEN`, `CLICPAY_WEBHOOK_SECRET`, `CLICPAY_ENVIRONMENT`). O código real lê
  `CLICPAY_TOKEN`, `PAYMENT_WEBHOOK_SECRET` e precisa de `PAYMENT_PROVIDER=clicpay` explícito
  (senão cai sempre no provider "mock"). Corrigi a lista para bater certo com `payments.ts`.

## 6. `npm ci` sem `package-lock.json`
Tinha posto `"installCommand": "npm ci"` no `vercel.json`, mas `npm ci` exige um
`package-lock.json` já commitado no repositório — este projeto nunca teve um. Sem acesso à
internet não consigo gerar um lockfile real aqui, por isso a correção é usar `npm install`
(que não depende de lockfile existente) até criares e commitares um `package-lock.json` a
partir de um `npm install` feito localmente ou no CI.
**Corrigido:** `"installCommand": "npm install"` no `vercel.json`.

## 7. `"latest"` em todas as dependências — bug real do npm
O erro `npm error Cannot read properties of null (reading 'edgesOut')` que apareceu depois é um
bug conhecido do próprio npm CLI (reportado em npm/cli#9787 e npm/cli#8261), não é nada que
tenhas feito errado. Acontece com mais frequência quando **todas** as dependências apontam para
`"latest"` ao mesmo tempo — o resolvedor de peer-dependencies do npm ("Arborist") entra num
caminho de código instável.
**Corrigido:** troquei `"latest"` por intervalos de versão fixos (ex: `"^5.0.0"`) em todas as
dependências dos dois `package.json`. Isto também tem a vantagem de tornares os builds
reprodutíveis — "latest" muda sempre que uma dependência lança uma versão nova, o que pode
partir o build sem tu teres mudado nada.

## 8. `generator`/`datasource` com duas propriedades na mesma linha
Ao adicionar `binaryTargets` (correção #4), pus `provider` e `binaryTargets` na mesma linha do
bloco `generator`. O parser do Prisma exige uma propriedade por linha dentro dos blocos
`generator`/`datasource` (ao contrário dos blocos `model`, que toleram vários campos na mesma
linha). Isto desalinhou o parser e fez com que o ficheiro inteiro fosse lido como se estivesse
sempre dentro do bloco `generator`, gerando uma cascata de 27 erros. O mesmo padrão já existia
por acaso no bloco `datasource` original (`provider` e `url` na mesma linha) — corrigi os dois.
**Corrigido:** cada propriedade agora na sua própria linha nos dois blocos.

## 9. Aviso: Node.js 20.x fica obsoleto na Vercel a partir de outubro de 2026
A Vercel avisou que builds em Node 20.x vão deixar de funcionar depois de 2026-10-01.
**Corrigido:** `engines.node` passou de `"20.x"` para `"24.x"`.

## Próximos passos para publicares
1. Sobe o conteúdo deste zip para a raiz do teu repositório GitHub (substitui os ficheiros).
2. Confirma no painel da Vercel: Framework Preset = Other, Root Directory = `.`.
3. Em Project Settings → Environment Variables, define pelo menos:
   `DATABASE_URL`, `NODE_ENV=production`, `FRONTEND_ORIGIN` (o teu domínio `https://...vercel.app`),
   `COOKIE_SECURE=true`, `TOTP_ENCRYPTION_KEY` (64 caracteres hex), e se fores usar pagamentos:
   `PAYMENT_PROVIDER=clicpay`, `CLICPAY_BASE_URL`, `CLICPAY_TOKEN`, `CLICPAY_WALLET_ID`,
   `PAYMENT_WEBHOOK_SECRET`.
4. Faz redeploy. Com o `dotenv` e o erro de tipo corrigidos, o `npm run build` deve passar.
5. Corre as migrations do Prisma contra a base de dados de produção antes de usar o admin/checkout.
