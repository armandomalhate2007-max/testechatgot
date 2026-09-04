import type { VercelRequest, VercelResponse } from '@vercel/node';
import { app } from '../backend/backend/src/server.js';

let ready: Promise<void> | undefined;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  ready ??= Promise.resolve(app.ready());
  await ready;
  app.server.emit('request', req, res);
}
