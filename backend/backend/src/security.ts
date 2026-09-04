import { createHash, timingSafeEqual } from 'node:crypto';

export const hashToken = (value: string) => createHash('sha256').update(value).digest('hex');

export function safeEqualHex(a: string, b: string): boolean {
  const aa = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

export function distanceKm(lat1:number, lon1:number, lat2:number, lon2:number) {
  const r = 6371;
  const toRad = (d:number) => d * Math.PI / 180;
  const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*r*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function parseMoneyCents(value: string|number) {
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) throw new Error('INVALID_MONEY');
  const [whole, fraction=''] = raw.split('.');
  const cents = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0,2));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('INVALID_MONEY');
  return Number(cents);
}

export function calculateDeliveryCostCents(method:'DELIVERY'|'PICKUP', latitude:number|undefined, longitude:number|undefined, originLat:number, originLng:number, maxKm:number, baseCostCents:number, perKmCents:number) {
  if (method === 'PICKUP') return 0;
  if (latitude === undefined || longitude === undefined) throw new Error('COORDINATES_REQUIRED');
  const km = distanceKm(originLat, originLng, latitude, longitude);
  if (km > maxKm) throw new Error('OUTSIDE_DELIVERY_RADIUS');
  return Math.max(0, baseCostCents + Math.round(km * perKmCents));
}

export const ORDER_STATUSES = ['PENDING','CONFIRMED','DELIVERED','CANCELLED','REJECTED'] as const;
export type OrderStatus = typeof ORDER_STATUSES[number];

export function canTransition(from:OrderStatus, to:OrderStatus): boolean {
  if (from === to) return true;
  if (from === 'CANCELLED' || from === 'REJECTED') return false;
  if (to === 'CANCELLED' || to === 'REJECTED') return true;
  const allowed: Record<OrderStatus, OrderStatus[]> = {
    PENDING: ['CONFIRMED'],
    CONFIRMED: ['DELIVERED'],
    DELIVERED: [],
    CANCELLED: [],
    REJECTED: []
  };
  return allowed[from].includes(to);
}
