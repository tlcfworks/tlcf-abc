import type { Quota } from '../types.ts';
export const percent = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100;
export function timestamp(n: unknown): string | null {
  if (n === null || n === undefined || n === '') return null;
  const ms = typeof n === 'number' ? n * 1000 : typeof n === 'string' ? Date.parse(n) : NaN;
  return Number.isFinite(ms) && ms > 0 && ms < 8640000000000000 ? new Date(ms).toISOString() : null;
}
export function codexQuotas(data: any): Quota[] {
  const buckets = data.rateLimitsByLimitId && Object.keys(data.rateLimitsByLimitId).length ? data.rateLimitsByLimitId : { codex: data.rateLimits };
  const result: Quota[] = [];
  for (const [id, bucket] of Object.entries<any>(buckets)) {
    if (!bucket) continue;
    for (const key of ['primary', 'secondary']) {
      const w = bucket[key];
      if (!w || !percent(w.usedPercent)) continue;
      const mins = w.windowDurationMins;
      const duration = typeof mins !== 'number' ? key : mins % 1440 === 0 ? `${mins / 1440}-day` : mins % 60 === 0 ? `${mins / 60}-hour` : `${mins}-minute`;
      result.push({ id: `${id}:${key}`, label: `${bucket.limitName || id} / ${duration}`, remainingPercent: 100 - w.usedPercent, resetsAt: timestamp(w.resetsAt) });
    }
    if (percent(bucket.individualLimit?.remainingPercent)) result.push({ id: `${id}:spend`, label: `${bucket.limitName || id} / spend limit`, remainingPercent: bucket.individualLimit.remainingPercent, resetsAt: timestamp(bucket.individualLimit.resetsAt) });
  }
  return result;
}
export function statusQuotas(provider: string, data: any): Quota[] {
  if (provider === 'claude') return [['five_hour', '5-hour'], ['seven_day', 'Weekly']].flatMap(([key, label]) => {
    const w = data.rate_limits?.[key];
    return w && percent(w.used_percentage) ? [{ id: key, label, remainingPercent: 100 - w.used_percentage, resetsAt: timestamp(w.resets_at) }] : [];
  });
  if (provider !== 'antigravity') return [];
  return Object.entries<any>(data.quota || {}).flatMap(([id, w]) => {
    if (!w || typeof w !== 'object') return [];
    const fraction = typeof w.remaining_fraction === 'number' && w.remaining_fraction >= 0 && w.remaining_fraction <= 1 ? w.remaining_fraction : null;
    const amount = typeof w.remaining_amount === 'number' && Number.isFinite(w.remaining_amount) && w.remaining_amount >= 0 ? w.remaining_amount : undefined;
    if (fraction === null && amount === undefined && w.disabled !== true) return [];
    return [{ id, label: id, remainingPercent: fraction === null ? null : fraction * 100, ...(amount === undefined ? {} : { remainingAmount: amount }), resetsAt: timestamp(w.reset_time), disabled: w.disabled === true }];
  });
}
