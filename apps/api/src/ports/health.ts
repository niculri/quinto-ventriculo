// The parts the site needs, checked one by one for `/api/health/deep`.
export type HealthCheck = (signal: AbortSignal) => Promise<void>;

export type CheckStatus = 'ok' | 'fail';

export interface DeepHealthResult {
  ok: boolean;
  checks: Record<string, CheckStatus>;
}

export interface SharedHealthCache {
  get(): Promise<DeepHealthResult | null>;
  put(result: DeepHealthResult, ttlSeconds: number): Promise<void>;
}

export interface DeepHealth {
  run(): Promise<DeepHealthResult>;
}

/** The route does not exist without the checks. */
export const NO_DEEP_HEALTH: DeepHealth = {
  run: () => Promise.reject(new Error('The deep health checks are not configured')),
};
