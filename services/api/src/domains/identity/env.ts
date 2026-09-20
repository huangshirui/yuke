export type D1PreparedStatementLike = {
  bind: (...values: unknown[]) => D1PreparedStatementLike
  first: <T = Record<string, unknown>>() => Promise<T | null>
  all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>
  run: () => Promise<unknown>
}

export type D1DatabaseLike = {
  prepare: (query: string) => D1PreparedStatementLike
}

export type R2ObjectBodyLike = {
  body: ReadableStream
  httpEtag: string
  writeHttpMetadata: (headers: Headers) => void
}

export type R2BucketLike = {
  put: (
    key: string,
    value: ArrayBuffer,
    options?: {
      httpMetadata?: {
        contentType?: string
        cacheControl?: string
      }
    }
  ) => Promise<unknown>
  get: (key: string) => Promise<R2ObjectBodyLike | null>
  delete: (key: string) => Promise<void>
}

export type IdentityEnv = Record<string, unknown> & {
  DB: D1DatabaseLike
  AVATARS: R2BucketLike
  WECHAT_APP_ID: string
  WECHAT_APP_SECRET: string
  USER_TOKEN_SECRET: string
}
