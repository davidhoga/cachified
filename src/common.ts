import type { CreateReporter, Reporter } from './reporter';

export interface CacheMetadata {
  createdTime: number;
  ttl?: number | null;
  swv?: number | null;
}

export interface CacheEntry<Value> {
  metadata: CacheMetadata;
  value: Value;
}

export type Eventually<Value> =
  | Value
  | null
  | undefined
  | Promise<Value | null | undefined>;

export interface Cache<Value> {
  name?: string;
  get: (key: string) => Eventually<{
    metadata: CacheMetadata;
    value: Value;
  }>;
  set: (key: string, value: CacheEntry<Value>) => unknown | Promise<unknown>;
  delete: (key: string) => unknown | Promise<unknown>;
}

export const HANDLE = Symbol();
export type GetFreshValue<Value> = {
  (): Promise<Value> | Value;
  [HANDLE]?: () => void;
};

export interface CachifiedOptions<Value> {
  /**
   * The key this value is cached by
   *
   * @type {string}
   */
  key: string;
  /**
   * Cache implementation to use
   *
   * Must conform with signature
   *  - set(key: string, value: object): void
   *  - get(key: string): object
   *  - delete(key: string): void
   *
   * @type {Cache}
   */
  cache: Cache<Value>;
  /**
   * This is called when no valid value is in cache for given key.
   * Basically what we would do if we wouldn't use a cache.
   *
   * Can be async and must return fresh value or throw.
   *
   * @type {function(): Promise | Value}
   */
  getFreshValue: GetFreshValue<Value>;
  /**
   * Time To Live; often also referred to as max age.
   *
   * Amount of milliseconds the value should stay in cache
   * before we get a fresh one
   *
   * @type {number} Must be positive, can be infinite
   * @defaultValue {Infinity}
   */
  ttl?: number;
  /**
   * Amount of milliseconds that a value with exceeded ttl is still returned
   * while a fresh value is refreshed in the background
   *
   * @type {number} Must be positive, can be infinite
   * @defaultValue {0}
   */
  staleWhileRevalidate?: number;
  /**
   * Called for each fresh or cached value to check if it matches the
   * typescript type.
   *
   * Must return true when value is valid.
   *
   * May return false or the reason (string) why the value is invalid
   *
   * @type {function(): boolean | string}
   * @defaultValue {() => true} each value is considered valid by default
   */
  checkValue?: (value: unknown) => boolean | string;
  /**
   * Set true to not even try reading the currently cached value
   *
   * Will write new value to cache even when cached value is
   * still valid.
   *
   * @type {boolean}
   * @defaultValue {false}
   */
  forceFresh?: boolean;
  /**
   * Weather of not to fall back to cache when getting a forced fresh value
   * fails.
   *
   * Can also be the maximum age in milliseconds that a fallback value might
   * have
   *
   * @type {boolean | number} Number must be positive, can be infinite
   * @defaultValue {Infinity}
   */
  fallbackToCache?: boolean | number;
  /**
   * Amount of time in milliseconds before revalidation of a stale
   * cache entry is started
   *
   * @type {number} must be positive and finite
   * @defaultValue {0}
   */
  staleRefreshTimeout?: number;
  /**
   * A reporter receives events during the runtime of
   * cachified and can be used for debugging and monitoring
   *
   * @type {(context) => (event) => void}
   * @defaultValue {noop}
   */
  reporter?: CreateReporter<Value>;
}

export interface Context<Value>
  extends Omit<
    Required<CachifiedOptions<Value>>,
    'fallbackToCache' | 'reporter'
  > {
  report: Reporter<Value>;
  fallbackToCache: number;
  metadata: CacheMetadata;
}

export function createContext<Value>({
  fallbackToCache,
  reporter,
  ...options
}: CachifiedOptions<Value>): Context<Value> {
  const ttl = options.ttl ?? Infinity;
  const staleWhileRevalidate = options.staleWhileRevalidate ?? 0;
  const contextWithoutReport = {
    checkValue: () => true,
    ttl,
    staleWhileRevalidate,
    fallbackToCache:
      fallbackToCache === false
        ? 0
        : fallbackToCache === true || fallbackToCache === undefined
        ? Infinity
        : fallbackToCache,
    staleRefreshTimeout: 0,
    forceFresh: false,
    ...options,
    metadata: {
      ttl: ttl === Infinity ? null : ttl,
      swv: staleWhileRevalidate === Infinity ? null : staleWhileRevalidate,
      createdTime: Date.now(),
    },
  };

  const report =
    reporter?.(contextWithoutReport) ||
    (() => {
      /* ¯\_(ツ)_/¯ */
    });

  return {
    ...contextWithoutReport,
    report,
  };
}
