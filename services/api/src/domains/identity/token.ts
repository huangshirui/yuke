import { AppError } from '../../lib/errors'

const TOKEN_TTL_SECONDS = 24 * 60 * 60
const encoder = new TextEncoder()
const decoder = new TextDecoder()

type UserTokenClaims = {
  v: 1
  sub: string
  iat: number
  exp: number
}

export type IssuedUserToken = {
  accessToken: string
  expiresAt: string
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function encodeJson(value: unknown): string {
  return base64UrlEncode(encoder.encode(JSON.stringify(value)))
}

function decodeJson<T>(value: string): T {
  return JSON.parse(decoder.decode(base64UrlDecode(value))) as T
}

async function importHmacKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  if (encoder.encode(secret).byteLength < 32) {
    throw new AppError('INTERNAL_ERROR', 'Internal Server Error')
  }

  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages
  )
}

function isValidClaims(value: unknown, nowSeconds: number): value is UserTokenClaims {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const claims = value as Record<string, unknown>
  return (
    claims.v === 1 &&
    typeof claims.sub === 'string' &&
    claims.sub.length > 0 &&
    typeof claims.iat === 'number' &&
    Number.isInteger(claims.iat) &&
    typeof claims.exp === 'number' &&
    Number.isInteger(claims.exp) &&
    claims.exp > nowSeconds &&
    claims.iat <= nowSeconds + 60 &&
    claims.exp > claims.iat
  )
}

export async function issueUserToken(
  userId: string,
  secret: string,
  nowMs = Date.now()
): Promise<IssuedUserToken> {
  const nowSeconds = Math.floor(nowMs / 1000)
  const claims: UserTokenClaims = {
    v: 1,
    sub: userId,
    iat: nowSeconds,
    exp: nowSeconds + TOKEN_TTL_SECONDS
  }

  const header = encodeJson({ alg: 'HS256', typ: 'JWT' })
  const payload = encodeJson(claims)
  const signingInput = `${header}.${payload}`
  const key = await importHmacKey(secret, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput))

  return {
    accessToken: `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`,
    expiresAt: new Date(claims.exp * 1000).toISOString()
  }
}

export async function verifyUserToken(
  token: string,
  secret: string,
  nowMs = Date.now()
): Promise<UserTokenClaims | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }

    const [headerPart, payloadPart, signaturePart] = parts
    const header = decodeJson<Record<string, unknown>>(headerPart)
    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
      return null
    }

    const key = await importHmacKey(secret, ['verify'])
    const validSignature = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlDecode(signaturePart),
      encoder.encode(`${headerPart}.${payloadPart}`)
    )
    if (!validSignature) {
      return null
    }

    const claims = decodeJson<unknown>(payloadPart)
    const nowSeconds = Math.floor(nowMs / 1000)
    return isValidClaims(claims, nowSeconds) ? claims : null
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }
    return null
  }
}
