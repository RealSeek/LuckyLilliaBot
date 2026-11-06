import type { SignRequestArgs } from './sign-proxy'
import type { SignResult } from './sign'

/** HTTP signing protocol; all three output fields contain complete hex bytes. */
function decodeSign(value: unknown): SignResult {
  if (!value || typeof value !== 'object') throw new Error('Invalid signing response: expected an object')
  const result = value as Record<string, unknown>
  for (const field of ['sign', 'token', 'extra'] as const) {
    if (typeof result[field] !== 'string' || !/^(?:[a-f\d]{2})*$/i.test(result[field])) {
      throw new Error(`Invalid signing response: ${field} must contain hexadecimal bytes`)
    }
  }
  if (!result.sign) throw new Error('Invalid signing response: sign is empty')
  return {
    sign: Buffer.from(result.sign as string, 'hex'),
    token: Buffer.from(result.token as string, 'hex'),
    extra: Buffer.from(result.extra as string, 'hex'),
  }
}

export class HttpSignClient {
  readonly url: string

  constructor(url: string) {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.search || parsed.hash || parsed.username || parsed.password) {
      throw new Error('LLBOT_SIGN_URL must be an HTTP(S) base URL without credentials, query or fragment')
    }
    this.url = parsed.href.replace(/\/+$/, '')
  }

  private async request(path: string, body?: unknown): Promise<unknown> {
    const response = await fetch(`${this.url}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) {
      throw new Error(`Custom signing ${path}: HTTP ${response.status}: ${await response.text()}`)
    }
    return response.json()
  }

  async preflight(): Promise<string | null> {
    try {
      const value = await this.request('/health') as { ok?: boolean } | null
      return value?.ok === true ? null : 'Custom signing service is not ready'
    } catch (error) {
      return `Custom signing health: ${(error as Error).message}`
    }
  }

  async sign(args: SignRequestArgs): Promise<SignResult> {
    return decodeSign(await this.request('/sign', args))
  }

  async signBatch(args: SignRequestArgs, count: number): Promise<SignResult[]> {
    const values = await this.request('/sign/batch', { args, count })
    if (!Array.isArray(values) || values.length !== count) {
      throw new Error(`Invalid signing response: expected ${count} batch results`)
    }
    return values.map(decodeSign)
  }
}
