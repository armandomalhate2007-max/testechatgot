# Atelier — correções consolidadas de deploy

Este documento reúne apenas o estado atual; versões antigas desta explicação tinham diagnósticos que já foram corrigidos.

## Pontos corrigidos

1. Dependências usadas pelo servidor estão disponíveis no `package.json` da raiz, que é o package instalado pela Vercel.
2. O projeto usa ESM + TypeScript `NodeNext`, compatível com os imports e top-level await atuais.
3. `vercel.json` publica `public/` e encaminha `/api/*` para `api/index.ts`.
4. O Prisma usa `binaryTargets` para o ambiente da Vercel.
5. As imagens de produção não dependem do filesystem efémero da Vercel: usam Vercel Blob.
6. `Product.images` suporta até seis URLs e `imageUrl` mantém a primeira como imagem principal.
7. A interface de produção foi alinhada com o `app.js` atual; `public/` é a fonte publicada.
8. A cadeia de migrations recebeu uma migração de reconciliação para bases históricas que não tinham todos os objetos do schema atual.
9. O limite de fotografia passou para 4 MB por ficheiro, abaixo do limite de payload de função de 4.5 MB documentado pela Vercel.
10. Os comandos `test`/`e2e` foram corrigidos para o diretório esperado pelos testes.

## O que não fazer

- Não apagar a Neon para “começar de novo”.
- Não guardar imagens de produção em `/tmp`.
- Não colocar tokens de Blob ou pagamento no browser/GitHub.
- Não trocar `npm install` por `npm ci` sem `package-lock.json` versionado.
- Não substituir `public/index.html` por uma versão antiga só porque um ZIP anterior parecia mais bonito: o HTML tem de corresponder ao `app.js` atual.
