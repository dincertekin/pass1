// A store for @fastify/rate-limit that keeps counts in Postgres instead of one server's memory,
// so every API server sees the same counts. IPs are stored only as keyed hashes (privacy-hash.ts).

import { lt, sql } from "drizzle-orm";
import type { Db } from "./db/client.js";
import { rateLimitCounters } from "./db/schema.js";
import type { PrivacyHash } from "./privacy-hash.js";

type Callback = (error: Error | null, result?: { current: number; ttl: number }) => void;
interface RouteShape {
  method?: string | string[];
  url?: string;
  routeInfo?: { method?: string | string[]; url?: string };
}

/**
 * Input: what the plugin passes to child(). Output: e.g. "POST /api/auth/login".
 * Trap: the plugin's types say child() gets the route's options ({ method, url }), but at runtime
 * (index.js, onRoute hook) it gets the merged limit settings with the route under `routeInfo`.
 * Both shapes are read, so a fix on either side doesn't silently merge every route's counts.
 */
function routeName(params: object): string {
  const shape = params as RouteShape;
  const route = shape.routeInfo?.url ? shape.routeInfo : shape;
  return `${route.method ?? "*"} ${route.url ?? "*"}`;
}

/**
 * Makes the store class the plugin expects (`new Store(params)`, then `child(routeParams)` per
 * route). Input: database and privacy hash. Output: the class, to pass as `store`.
 */
export function createPostgresRateLimitStore(db: Db, hash: PrivacyHash, getNowMs = () => Date.now()) {
  return class PostgresRateLimitStore {
    // Each route counts separately, like the plugin's own in-memory store.
    private route: string;

    constructor(params: object = {}) {
      this.route = routeName(params);
    }

    incr(ip: string, callback: Callback, timeWindowMs: number) {
      countRequest(db, `${this.route} ${hash("ip", ip)}`, timeWindowMs, getNowMs()).then(
        (result) => callback(null, result),
        (error: Error) => callback(error),
      );
    }

    child(params: object) {
      return new PostgresRateLimitStore(params);
    }
  };
}

/**
 * Counts one request. One statement, so two servers counting at once can't lose a request:
 * a window that has ended starts again at 1, otherwise the count goes up by one.
 * Output: { current: requests in this window, ttl: milliseconds until it ends }.
 */
async function countRequest(db: Db, key: string, timeWindowMs: number, nowMs: number) {
  const now = new Date(nowMs).toISOString();
  const newWindowEnd = new Date(nowMs + timeWindowMs);
  const hasEnded = sql`${rateLimitCounters.windowEndsAt} <= ${now}::timestamptz`;
  const [row] = await db
    .insert(rateLimitCounters)
    .values({ key, count: 1, windowEndsAt: newWindowEnd })
    .onConflictDoUpdate({
      target: rateLimitCounters.key,
      set: {
        count: sql`case when ${hasEnded} then 1 else ${rateLimitCounters.count} + 1 end`,
        windowEndsAt: sql`case when ${hasEnded} then ${newWindowEnd.toISOString()}::timestamptz else ${rateLimitCounters.windowEndsAt} end`,
      },
    })
    .returning({ count: rateLimitCounters.count, windowEndsAt: rateLimitCounters.windowEndsAt });
  return { current: row!.count, ttl: row!.windowEndsAt.getTime() - nowMs };
}

/** Deletes counters whose window has ended. server.ts runs this once an hour. Output: how many. */
export async function deleteEndedRateLimitWindows(db: Db, nowMs = Date.now()): Promise<number> {
  const deleted = await db.delete(rateLimitCounters).where(lt(rateLimitCounters.windowEndsAt, new Date(nowMs))).returning({ key: rateLimitCounters.key });
  return deleted.length;
}
