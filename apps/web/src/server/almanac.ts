import { unstable_cache } from 'next/cache';
import { type CacheStore, createAlmanac, noCache } from '@almanac/api-client';

/** Next's data cache does not store a rejected callback. */
const nextDataCache: CacheStore = {
  getOrLoad: (key, policy, load) => unstable_cache(load, [key], { revalidate: policy.ttlSeconds ?? false })(),
};

export const almanac = createAlmanac({
  cache: process.env.NODE_ENV === 'production' ? nextDataCache : noCache,
  cacheNamespace: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
});
