import { ValidationError } from './errors'

export type JsonObject = Record<string, unknown>
export type JsonParser<T> = (value: unknown) => T

export async function parseJsonBody<T>(request: Request, parser: JsonParser<T>): Promise<T> {
  let value: unknown

  try {
    value = await request.json()
  } catch {
    throw new ValidationError('Request body must be valid JSON')
  }

  return parser(value)
}

export function expectObject(value: unknown, path = 'body'): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(`${path} must be an object`, { path })
  }

  return value as JsonObject
}

export function requireString(
  object: JsonObject,
  key: string,
  options: { trim?: boolean; minLength?: number; maxLength?: number } = {}
): string {
  const rawValue = object[key]
  if (typeof rawValue !== 'string') {
    throw new ValidationError(`${key} must be a string`, { path: key })
  }

  const value = options.trim === false ? rawValue : rawValue.trim()
  const minLength = options.minLength ?? 1

  if (value.length < minLength) {
    throw new ValidationError(`${key} is too short`, { path: key, minLength })
  }
  if (options.maxLength !== undefined && value.length > options.maxLength) {
    throw new ValidationError(`${key} is too long`, { path: key, maxLength: options.maxLength })
  }

  return value
}

export function optionalString(
  object: JsonObject,
  key: string,
  options: { trim?: boolean; maxLength?: number } = {}
): string | undefined {
  const rawValue = object[key]
  if (rawValue === undefined) {
    return undefined
  }
  if (typeof rawValue !== 'string') {
    throw new ValidationError(`${key} must be a string`, { path: key })
  }

  const value = options.trim === false ? rawValue : rawValue.trim()
  if (options.maxLength !== undefined && value.length > options.maxLength) {
    throw new ValidationError(`${key} is too long`, { path: key, maxLength: options.maxLength })
  }

  return value
}

export function requireOneOf<const T extends readonly string[]>(
  object: JsonObject,
  key: string,
  allowed: T
): T[number] {
  const value = requireString(object, key)
  if (!allowed.includes(value)) {
    throw new ValidationError(`${key} has an unsupported value`, { path: key, allowed })
  }

  return value as T[number]
}
