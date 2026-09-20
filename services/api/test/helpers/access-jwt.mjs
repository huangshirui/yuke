function base64Url(bytes) {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function encodeJson(value) {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)))
}

export async function createSyntheticAccessKey(kid = 'synthetic-access-key') {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256'
    },
    true,
    ['sign', 'verify']
  )

  const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey)
  publicJwk.kid = kid
  publicJwk.alg = 'RS256'
  publicJwk.use = 'sig'

  return {
    kid,
    privateKey: keyPair.privateKey,
    publicJwk
  }
}

export async function signSyntheticAccessJwt({
  privateKey,
  kid,
  issuer,
  audience,
  subject,
  email = 'synthetic-admin@example.invalid',
  nowSeconds = 1_800_000_000,
  expiresInSeconds = 600,
  notBeforeOffsetSeconds = -5
}) {
  const header = {
    alg: 'RS256',
    kid,
    typ: 'JWT'
  }
  const payload = {
    aud: [audience],
    email,
    exp: nowSeconds + expiresInSeconds,
    iat: nowSeconds,
    nbf: nowSeconds + notBeforeOffsetSeconds,
    iss: issuer,
    type: 'app',
    sub: subject
  }

  const encodedHeader = encodeJson(header)
  const encodedPayload = encodeJson(payload)
  const content = `${encodedHeader}.${encodedPayload}`
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    privateKey,
    new TextEncoder().encode(content)
  )

  return `${content}.${base64Url(new Uint8Array(signature))}`
}

export function createSyntheticJwksFetch(publicJwk) {
  return async () =>
    new Response(JSON.stringify({ keys: [publicJwk] }), {
      headers: {
        'content-type': 'application/json'
      }
    })
}
