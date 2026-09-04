const base = process.env.API_URL || 'http://127.0.0.1:3000';
const total = Number(process.env.LOAD_REQUESTS || 100);
const concurrency = Number(process.env.LOAD_CONCURRENCY || 10);
let next = 0, ok = 0, fail = 0;
async function worker() {
  while (true) {
    const i = next++; if (i >= total) return;
    try { const r = await fetch(`${base}/api/health`); if (r.ok) ok++; else fail++; }
    catch { fail++; }
  }
}
await Promise.all(Array.from({length: Math.min(concurrency,total)}, worker));
console.log(JSON.stringify({total, concurrency, ok, fail}));
if (fail) process.exit(1);
