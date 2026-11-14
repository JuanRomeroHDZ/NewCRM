import type { ExchangeRate } from '../types';

export const EXCHANGE_RATE_REVIEW_AFTER_MS = 24 * 60 * 60 * 1000;

export function needsExchangeRateReview(
  rate: Pick<ExchangeRate, 'is_manual' | 'updated_at'> | null | undefined,
  nowMs = Date.now()
): boolean {
  if (!rate) return true;
  if (rate.is_manual) return false;

  const timestamp = Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(rate.updated_at)
    ? rate.updated_at
    : `${rate.updated_at}Z`);
  return !Number.isFinite(timestamp) || nowMs - timestamp > EXCHANGE_RATE_REVIEW_AFTER_MS;
}
