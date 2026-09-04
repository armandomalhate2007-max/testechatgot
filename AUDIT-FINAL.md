# Atelier — auditoria consolidada v28

Este ficheiro substitui as conclusões operacionais antigas deste documento.

## Estado atual

**Pré-produção avançada.** O código foi consolidado para uma arquitetura Vercel + Neon + Vercel Blob. Ainda é necessária validação operacional no ambiente real.

## Correções/consolidações desta revisão

- Frontend de produção (`public/`) e cópia `frontend/` sincronizados.
- Contrato de IDs HTML alinhado com `app.js`, incluindo painel, checkout, segurança, definições e modal de produto.
- Suporte de 1–6 fotografias alinhado entre UI, frontend, API e Prisma.
- Upload de produção usa Vercel Blob público; Neon guarda URLs.
- Limite de imagem reduzido para 4 MB para não encostar ao limite de payload das funções Vercel.
- Migração de reconciliação criada para `Product.images`, `Payment` e `PaymentEvent`.
- Scripts `test`/`e2e` da raiz passam a executar a partir de `backend/backend`, onde os testes esperam estar.
- Documentação Vercel/produção atualizada para não recomendar filesystem persistente em `/tmp` nem `npm ci` sem lockfile.
- Limpeza de uploads locais passou a considerar também `Product.images`.

## Validação que ainda deve ser feita fora deste ambiente

1. `npm install`/lockfile e build real na Vercel.
2. `npx prisma migrate deploy` numa cópia da base e na Neon de produção.
3. Login/admin/checkout E2E.
4. Upload de fotografia e leitura da URL pública do Blob.
5. M-Pesa/e-Mola sandbox ponta a ponta.
6. Backup e restore PostgreSQL.

## Veredito

Não declarar “100% pronto” apenas pela inspeção do ZIP. O código está estruturado para a arquitetura escolhida, mas o GO final depende dos testes reais acima.
