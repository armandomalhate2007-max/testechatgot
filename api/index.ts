import type { VercelRequest, VercelResponse } from '@vercel/node';

let appPromise: Promise<any> | undefined;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  appPromise ??= import('../backend/backend/src/server.js').then((m) => m.app);
  const app = await appPromise;
  await app.ready();
  app.server.emit('request', req, res);
}
