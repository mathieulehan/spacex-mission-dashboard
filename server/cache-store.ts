import type { ZodType } from 'zod'

export type CachedValue<T> = {
  value: T
  fetchedAt: number
}

export type CacheMetadata = {
  key: string
  fetchedAt: number
  sizeBytes: number
}

type Awaitable<T> = T | Promise<T>

export interface CacheStore {
  get<T>(key: string, schema: ZodType<T>): Awaitable<CachedValue<T> | null>
  set(key: string, value: unknown, fetchedAt?: number): Awaitable<void>
  metadata(): Awaitable<CacheMetadata[]>
}
