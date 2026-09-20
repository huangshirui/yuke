import { AppError } from '../errors'

export const CLOUDFLARE_ACCESS_JWT_HEADER = 'cf-access-jwt-assertion'

export type CloudflareAccessClaims = {
  aud: string | string[]
  email?: string
  exp: number
  iat?: number
  nbf?: number
  iss: string
  sub: string
  type?: string
}

export type CloudflareAccessVerificationConfig = {
  teamDomain: string
  audience: string
  clockSkewSeconds?: number
  jwksTtlMs?: number
}

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

export type CloudflareAccessVerificationOptions = {
  fetch?: FetchLike
  nowSeconds?: number
}

type JwtHeader = {
  alg?: string
  kid?: string
  typ?: string
}

type CachedJwks = {
  expiresAt: number
  keys: JsonWebKey[]
}

const DEFAULT_CLOCK_SKEW_SECONDS = 60
const DEFAULT_JWKS_TTL_MS = 5 * 60 * 1000
const jwksCache = new Map<string, CachedJwks>()

function unauthenticated(message = 'Invalid Cloudflare Access token'): AppError {
  return new AppError('UNAUTHENTICATED', message)
}

function internalConfigurationError(message: string): AppError {
  return new AppError('INTERNAL_ERROR', message)
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const paddingLength = (4 - (normalized.length % 4)) % 4
  let binary: string

  try {
    binary = atob(normalized + '='.repeat(paddingLength))
  } catch {
    throw unauthenticated()
  }

  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function parseJsonSegment<T>(value: string): T {
  try {
    const json = new TextDecoder().decode(decodeBase64Url(value))
    return JSON.parse(json) as T
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }
    throw unauthenticated()
  }
}

function normalizeTeamDomain(value: string): string {
  let url: URL

  try {
    url = new URL(value)
  } catch {
    throw internalConfigurationError('Cloudflare Access team domain is invalid')
  }

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw internalConfigurationError('Cloudflare Access team domain must be an HTTPS origin')
  }

  if (!url.hostname.endsWith('.cloudflareaccess.com')) {
    throw internalConfigurationError('Cloudflare Access team domain must use cloudflareaccess.com')
  }

  return url.origin
}

function assertAudience(claim: string | string[], expected: string): void {
  const audiences = Array.isArray(claim) ? claim : [claim]
  if (!audiences.includes(expected)) {
    throw unauthenticated()
  }
}

function assertNumericDate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function validateClaims(
  payload: Partial<CloudflareAccessClaims>,
  config: Required<Pick<CloudflareAccessVerificationConfig, 'audience' | 'clockSkewSeconds'>> & {
    teamDomain: string
  },
  nowSeconds: number
): CloudflareAccessClaims {
  if (payload.iss !== config.teamDomain) {
    throw unauthenticated()
  }

  if (typeof payload.aud !== 'string' && !Array.isArray(payload.aud)) {
    throw unauthenticated()
  }
  assertAudience(payload.aud, config.audience)

  if (!assertNumericDate(payload.exp) || nowSeconds - config.clockSkewSeconds >= payload.exp) {
    throw unauthenticated()
  }

  if (
    payload.nbf !== undefined &&
    (!assertNumericDate(payload.nbf) || nowSeconds + config.clockSkewSeconds < payload.nbf)
  ) {
    throw unauthenticated()
  }

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw unauthenticated()
  }

  if (payload.email !== undefined && typeof payload.email !== 'string') {
    throw unauthenticated()
  }

  return payload as CloudflareAccessClaims
}

async function fetchJwks(
  jwksUrl: string,
  fetchImpl: FetchLike,
  ttlMs: number,
  forceRefresh: boolean
): Promise<JsonWebKey[]> {
  const now = Date.now()
  const cached = jwksCache.get(jwksUrl)

  if (!forceRefresh && cached && cached.expiresAt > now) {
    return cached.keys
  }

  let response: Response
  try {
    response = await fetchImpl(jwksUrl, {
      headers: {
        accept: 'application/json'
      }
    })
  } catch {
    throw internalConfigurationError('Unable to load Cloudflare Access signing keys')
  }

  if (!response.ok) {
    throw internalConfigurationError('Unable to load Cloudflare Access signing keys')
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw internalConfigurationError('Cloudflare Access signing keys response is invalid')
  }

  const keys =
    payload &&
    typeof payload === 'object' &&
    'keys' in payload &&
    Array.isArray((payload as { keys?: unknown }).keys)
      ? ((payload as { keys: JsonWebKey[] }).keys)
      : null

  if (!keys || keys.length === 0) {
    throw internalConfigurationError('Cloudflare Access signing keys response is invalid')
  }

  jwksCache.set(jwksUrl, {
    keys,
    expiresAt: now + ttlMs
  })

  return keys
}

async function resolveSigningKey(
  jwksUrl: string,
  kid: string,
  fetchImpl: FetchLike,
  ttlMs: number
): Promise<JsonWebKey> {
  let keys = await fetchJwks(jwksUrl, fetchImpl, ttlMs, false)
  let key = keys.find((candidate) => candidate.kid === kid)

  if (!key) {
    keys = await fetchJwks(jwksUrl, fetchImpl, ttlMs, true)
    key = keys.find((candidate) => candidate.kid === kid)
  }

  if (!key || key.kty !== 'RSA') {
    throw unauthenticated()
  }

  if (key.alg !== undefined && key.alg !== 'RS256') {
    throw unauthenticated()
  }

  if (key.use !== undefined && key.use !== 'sig') {
    throw unauthenticated()
  }

  return key
}

export async function verifyCloudflareAccessJwt(
  token: string,
  config: CloudflareAccessVerificationConfig,
  options: CloudflareAccessVerificationOptions = {}
): Promise<CloudflareAccessClaims> {
  if (!token) {
    throw unauthenticated('Missing Cloudflare Access token')
  }

  if (!config.audience) {
    throw internalConfigurationError('Cloudflare Access audience is not configured')
  }

  const teamDomain = normalizeTeamDomain(config.teamDomain)
  const segments = token.split('.')
  if (segments.length !== 3) {
    throw unauthenticated()
  }

  const [encodedHeader, encodedPayload, encodedSignature] = segments
  const header = parseJsonSegment<JwtHeader>(encodedHeader)

  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length === 0) {
    throw unauthenticated()
  }

  const jwksUrl = `${teamDomain}/cdn-cgi/access/certs`
  const fetchImpl = options.fetch ?? fetch
  const ttlMs = config.jwksTtlMs ?? DEFAULT_JWKS_TTL_MS
  const key = await resolveSigningKey(jwksUrl, header.kid, fetchImpl, ttlMs)

  let publicKey: CryptoKey
  try {
    publicKey = await crypto.subtle.importKey(
      'jwk',
      key,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256'
      },
      false,
      ['verify']
    )
  } catch {
    throw unauthenticated()
  }

  const signedContent = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  const signature = decodeBase64Url(encodedSignature)
  const signatureValid = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    publicKey,
    signature,
    signedContent
  )

  if (!signatureValid) {
    throw unauthenticated()
  }

  const payload = parseJsonSegment<Partial<CloudflareAccessClaims>>(encodedPayload)
  return validateClaims(
    payload,
    {
      teamDomain,
      audience: config.audience,
      clockSkewSeconds: config.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS
    },
    options.nowSeconds ?? Math.floor(Date.now() / 1000)
  )
}
