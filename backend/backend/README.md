# Atelier v16

Hardening financeiro e de inventário sobre a base v15.

## Principais mudanças
- Totais de pedidos calculados em **cêntimos inteiros**, evitando acumulação de floating point.
- Preço, subtotal, entrega e total são normalizados para 2 casas decimais antes de persistir.
- Cotação de entrega também usa cêntimos.
- Stock continua protegido por decremento condicional dentro de transação.
- Regressões v16 cobrem aritmética monetária e proteção de stock.

## Validação
Foi feita validação estática do código. A suíte completa continua dependente da instalação das dependências e de PostgreSQL/Chromium no ambiente de execução.
