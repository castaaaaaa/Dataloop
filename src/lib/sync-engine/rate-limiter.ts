/**
 * Rate Limiter & Circuit Breaker
 * Enforces token-bucket rate limits and circuit breaker patterns per connected account.
 */

import { RateLimitPolicy, NormalizedError } from './types';

export class TokenBucketRateLimiter {
  private capacity: number;
  private tokens: number;
  private fillRate: number; // tokens per millisecond
  private lastFillTime: number;

  constructor(policy: RateLimitPolicy) {
    this.capacity = policy.burst;
    this.tokens = policy.burst;
    this.fillRate = policy.requestsPerSecond / 1000;
    this.lastFillTime = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsedTime = now - this.lastFillTime;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedTime * this.fillRate);
    this.lastFillTime = now;
  }

  async acquire(cost: number = 1): Promise<void> {
    this.refill();
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return;
    }

    const waitMs = Math.ceil((cost - this.tokens) / this.fillRate);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens = Math.max(0, this.tokens - cost);
  }
}

export interface CircuitBreakerState {
  accountId: string;
  failureCount: number;
  lastFailureTime?: number;
  isOpen: boolean;
  cooldownUntil?: number;
}

export class CircuitBreaker {
  private threshold: number;
  private cooldownMs: number;
  private state: Map<string, CircuitBreakerState> = new Map();

  constructor(threshold = 5, cooldownMs = 60000) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
  }

  getState(accountId: string): CircuitBreakerState {
    let s = this.state.get(accountId);
    if (!s) {
      s = { accountId, failureCount: 0, isOpen: false };
      this.state.set(accountId, s);
    }

    // Check if cooldown expired
    if (s.isOpen && s.cooldownUntil && Date.now() > s.cooldownUntil) {
      s.isOpen = false;
      s.failureCount = 0;
      s.cooldownUntil = undefined;
    }
    return s;
  }

  recordSuccess(accountId: string): void {
    const s = this.getState(accountId);
    s.failureCount = 0;
    s.isOpen = false;
    s.cooldownUntil = undefined;
  }

  recordFailure(accountId: string, error: NormalizedError): boolean {
    const s = this.getState(accountId);
    s.lastFailureTime = Date.now();
    s.failureCount += 1;

    if (s.failureCount >= this.threshold || error.category === 'auth') {
      s.isOpen = true;
      s.cooldownUntil = Date.now() + (error.category === 'auth' ? 3600000 : this.cooldownMs);
      return true; // Tripped!
    }
    return false;
  }

  canExecute(accountId: string): { allowed: boolean; reason?: string } {
    const s = this.getState(accountId);
    if (s.isOpen) {
      const remainingSec = Math.max(0, Math.ceil(((s.cooldownUntil || 0) - Date.now()) / 1000));
      return {
        allowed: false,
        reason: `Circuit open for account ${accountId}. In cooldown for ${remainingSec}s due to repeated failures.`
      };
    }
    return { allowed: true };
  }
}

/**
 * Calculates exponential backoff with jitter
 */
export function calculateBackoffMs(attempt: number, retryAfterSec?: number): number {
  if (retryAfterSec && retryAfterSec > 0) {
    return retryAfterSec * 1000;
  }
  const base = 1000; // 1s
  const max = 300000; // 5m
  const raw = base * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * raw; // 30% jitter
  return Math.min(max, Math.round(raw + jitter));
}
