import { Context, CacheEntry } from './common';
import { assertCacheEntry } from './assertCacheEntry';
import { HANDLE } from './common';
import { shouldRefresh } from './shouldRefresh';
import { cachified } from './cachified';
import { Reporter } from './reporter';

export const CACHE_EMPTY = Symbol();
export async function getCacheEntry<Value>(
  { key, cache }: Context<Value>,
  report: Reporter<Value>,
): Promise<CacheEntry<Value> | typeof CACHE_EMPTY> {
  report({ name: 'getCachedValueStart' });
  const cached = await cache.get(key);
  report({ name: 'getCachedValueRead', entry: cached });
  if (cached) {
    assertCacheEntry(cached, key);
    return cached;
  }
  return CACHE_EMPTY;
}

export async function getCachedValue<Value>(
  context: Context<Value>,
  report: Reporter<Value>,
): Promise<Value | typeof CACHE_EMPTY> {
  const {
    key,
    cache,
    staleWhileRevalidate,
    staleRefreshTimeout,
    checkValue,
    getFreshValue: { [HANDLE]: handle },
  } = context;
  try {
    const cached = await getCacheEntry(context, report);

    if (cached === CACHE_EMPTY) {
      report({ name: 'getCachedValueEmpty' });
      return CACHE_EMPTY;
    }

    const refresh = shouldRefresh(cached.metadata);
    const staleRefresh =
      refresh === 'stale' ||
      (refresh === 'now' && staleWhileRevalidate === Infinity);

    if (refresh === 'now') {
      report({ name: 'getCachedValueOutdated', ...cached });
    }

    if (staleRefresh) {
      // refresh cache in background so future requests are faster
      setTimeout(() => {
        report({ name: 'refreshValueStart' });
        void cachified({
          ...context,
          reporter: () => () => {},
          forceFresh: true,
          fallbackToCache: false,
        })
          .then((value) => {
            report({ name: 'refreshValueSuccess', value });
          })
          .catch((error) => {
            report({ name: 'refreshValueError', error });
          });
      }, staleRefreshTimeout);
    }

    if (!refresh || staleRefresh) {
      const valueCheck = checkValue(cached.value);
      if (valueCheck === true) {
        report({ name: 'getCachedValueSuccess', value: cached.value });
        if (!staleRefresh) {
          // Notify batch that we handled this call using cached value
          handle?.();
        }

        return cached.value;
      } else {
        const reason = typeof valueCheck === 'string' ? valueCheck : 'unknown';
        report({ name: 'checkCachedValueError', reason });

        await cache.delete(key);
      }
    }
  } catch (error: unknown) {
    report({ name: 'getCachedValueError', error });

    await cache.delete(key);
  }

  return CACHE_EMPTY;
}
