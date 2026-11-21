export type Provider = 'codex' | 'claude' | 'antigravity';
export type Quota = { id: string; label: string; remainingPercent: number | null; remainingAmount?: number; resetsAt: string | null; disabled?: boolean };
export type Snapshot = { status: string; message: string; quotas: Quota[]; observedAt: string | null; email?: string; plan?: string };
export type Account = { id: string; provider: Provider; name: string; profilePath: string; managed: boolean; identity?: string };
export type Detection = { id: string; provider: Provider; label: string; profilePath: string; evidence: string };
export class UserError extends Error {}
