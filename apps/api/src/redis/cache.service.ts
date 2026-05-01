import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/** Cache key prefixes for different data types. */
export enum CachePrefix {
  EVENT_LIST = 'events:list',
  EVENT_DETAIL = 'events:detail',
  RECENT_BOOKINGS = 'bookings:recent',
}

/** Default TTL values in seconds. */
export enum CacheTTL {
  /** Event list and detail cache — short TTL since prices change with bookings */
  EVENT = 10,
  /** Recent bookings counter — 60 min rolling window */
  RECENT_BOOKINGS = 3600,
}

/**
 * Lua script: Atomic INCR + EXPIRE.
 * Increments a key and sets TTL only if the key is new (TTL == -1).
 * This prevents the race condition where INCR succeeds but EXPIRE fails,
 * leaving a counter key without expiry under heavy load.
 *
 * KEYS[1] = counter key
 * ARGV[1] = TTL in seconds
 * Returns: the new counter value
 */
const LUA_INCR_WITH_TTL = `
  local count = redis.call('INCR', KEYS[1])
  if redis.call('TTL', KEYS[1]) == -1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return count
`;

/**
 * Lua script: Atomic cache invalidation after a booking.
 * Deletes the event list cache and the specific event detail cache,
 * then increments the recent bookings counter with TTL — all in one
 * round-trip, preventing stale re-caching between operations.
 *
 * KEYS[1] = event list cache key
 * KEYS[2] = event detail cache key
 * KEYS[3] = recent bookings counter key
 * ARGV[1] = recent bookings TTL in seconds
 * Returns: the new recent bookings count
 */
const LUA_INVALIDATE_AFTER_BOOKING = `
  redis.call('DEL', KEYS[1], KEYS[2])
  local count = redis.call('INCR', KEYS[3])
  if redis.call('TTL', KEYS[3]) == -1 then
    redis.call('EXPIRE', KEYS[3], ARGV[1])
  end
  return count
`;

@Injectable()
export class CacheService implements OnModuleInit {
  private readonly logger = new Logger(CacheService.name);
  private connected = false;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.connect();
      this.connected = true;
      this.logger.log('Redis connected');
    } catch (err) {
      this.logger.warn(`Redis connection failed, running without cache: ${(err as Error).message}`);
      this.connected = false;
    }
  }

  /** Check if Redis is available. */
  isAvailable(): boolean {
    return this.redis !== null && this.connected;
  }

  /**
   * Get a cached JSON value. Returns null on miss or if Redis is unavailable.
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isAvailable()) return null;
    try {
      const data = await this.redis!.get(key);
      if (data === null) return null;
      return JSON.parse(data) as T;
    } catch (err) {
      this.logger.warn(`Cache get error for key ${key}: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Set a JSON value with TTL in seconds.
   */
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      await this.redis!.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn(`Cache set error for key ${key}: ${(err as Error).message}`);
    }
  }

  /**
   * Delete one or more cache keys.
   */
  async del(...keys: string[]): Promise<void> {
    if (!this.isAvailable() || keys.length === 0) return;
    try {
      await this.redis!.del(...keys);
    } catch (err) {
      this.logger.warn(`Cache del error: ${(err as Error).message}`);
    }
  }

  /**
   * Atomically increment a counter and set TTL if the key is new.
   * Uses a Lua script to guarantee INCR + EXPIRE happen in a single
   * atomic operation — safe under heavy concurrent load.
   */
  async increment(key: string, ttlSeconds: number): Promise<number> {
    if (!this.isAvailable()) return 0;
    try {
      const count = await this.redis!.eval(
        LUA_INCR_WITH_TTL,
        1,
        key,
        String(ttlSeconds),
      ) as number;
      return count;
    } catch (err) {
      this.logger.warn(`Cache increment error for key ${key}: ${(err as Error).message}`);
      return 0;
    }
  }

  /**
   * Get a counter value. Returns 0 if key doesn't exist or Redis is unavailable.
   */
  async getCount(key: string): Promise<number> {
    if (!this.isAvailable()) return 0;
    try {
      const val = await this.redis!.get(key);
      return val ? parseInt(val, 10) : 0;
    } catch (err) {
      this.logger.warn(`Cache getCount error for key ${key}: ${(err as Error).message}`);
      return 0;
    }
  }

  /**
   * Atomically invalidate event caches and increment the recent bookings counter.
   * Uses a Lua script so all three operations (DEL list, DEL detail, INCR counter)
   * execute as a single atomic unit — prevents stale data from being re-cached
   * between individual operations under heavy load.
   */
  async invalidateAfterBooking(eventId: number): Promise<number> {
    if (!this.isAvailable()) return 0;
    try {
      const count = await this.redis!.eval(
        LUA_INVALIDATE_AFTER_BOOKING,
        3,
        CachePrefix.EVENT_LIST,
        `${CachePrefix.EVENT_DETAIL}:${eventId}`,
        `${CachePrefix.RECENT_BOOKINGS}:${eventId}`,
        String(CacheTTL.RECENT_BOOKINGS),
      ) as number;
      return count;
    } catch (err) {
      this.logger.warn(`Cache invalidateAfterBooking error for event ${eventId}: ${(err as Error).message}`);
      return 0;
    }
  }
}
