# Atelier — auditoria de pré-produção (v23)

## Estado
**Beta avançado / pré-produção.**

## Correções desta ronda

- Corrigida uma falha de inicialização causada por `COOKIE_SAME_SITE` ser consultado antes da sua declaração.
- Produção agora exige `COOKIE_SECURE=true` e `FRONTEND_ORIGIN` em HTTPS.
- Webhook de recuperação de password tem timeout de 5 segundos.
- Uploads validam não apenas MIME declarado, mas também assinatura/magic bytes de JPEG, PNG e WebP.
- Upload passa a gravar o buffer validado de forma exclusiva.

## Bloqueios restantes para produção real

1. Executar a suíte completa com dependências reais, PostgreSQL e Chromium.
2. Versionar `package-lock.json` e migrar CI para `npm ci`.
3. Configurar reverse proxy/TLS/secret manager.
4. Migrar imagens para object storage quando houver mais de uma instância da API.
5. Integrar fornecedor de e-mail real e confirmar entrega/retry/bounces.
6. Adicionar recovery codes para 2FA.
7. Testar backup + restore de PostgreSQL e uploads.
8. Fazer teste de carga realista além do smoke test.
9. Rever CSP/self-hosting do Tailwind CDN antes de produção pública.
10. Completar UX/a11y e os fluxos de checkout/admin em E2E.

## Veredito
Não há um bloqueador arquitetural óbvio identificado por inspeção. O principal risco agora é **validação operacional real** e configuração segura da infraestrutura de produção.

## v24 final consolidation

### Implemented
- 2FA recovery codes are generated on activation, stored only as Argon2id hashes, and consumed once.
- Recovery codes can be regenerated after a valid current TOTP code.
- Password reset UI only exposes the reset form when a reset token exists in the URL.
- PostgreSQL backup/restore scripts added (`npm run backup`, `npm run restore`).
- Orphan upload cleanup script added (`npm run cleanup:uploads`).
- End-to-end admin product flow added.
- Production checklist added.

### Remaining environment-dependent GO/NO-GO
- No package-lock could be generated because the npm registry is unavailable from this build environment.
- Full PostgreSQL + Chromium E2E execution still requires a network-enabled/CI environment.
- Tailwind is still loaded from the CDN in the current frontend; vendor/bundle it before a strict offline production deployment.
- S3/R2 object storage remains an operational deployment decision; local persistent volume is supported for single-node deployments.
