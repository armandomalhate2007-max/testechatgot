-- Stock reconciliation: every product gets the standard size rows when missing.
-- Existing stock values are never overwritten.
INSERT INTO "ProductSize" ("id", "productId", "size", "stock")
SELECT md5(random()::text || clock_timestamp()::text || p.id || s.size), p.id, s.size, 0
FROM "Product" p
CROSS JOIN (VALUES ('P'), ('M'), ('G'), ('GG')) AS s(size)
WHERE NOT EXISTS (
  SELECT 1 FROM "ProductSize" ps
  WHERE ps."productId" = p.id AND ps."size" = s.size
);
