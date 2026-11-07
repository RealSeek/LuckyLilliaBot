import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { SigningConfig } from '@/main/qqProtocol/direct-lib/signingConfig'

const h = vi.hoisted(() => ({
  store: null as unknown as SigningConfig,
  protocol: 'linux',
  pmhq: false,
}))
vi.mock('@/main/qqProtocol/direct-lib/sign', () => ({ get signingConfig() { return h.store } }))
vi.mock('@/common/utils/environment', () => ({ getProtocol: () => h.protocol, isPmhqMode: () => h.pmhq }))

import { createSigningRoutes } from '@/webui/BE/routes/signing'

describe('WebUI signing configuration', () => {
  let directory: string
  let app: Hono
  const post = (path: string, url: unknown) => app.request(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
  })

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'llbot-signing-'))
    h.store = new SigningConfig(directory, 'http://original.test:18080')
    h.protocol = 'linux'
    h.pmhq = false
    app = new Hono().route('/', createSigningRoutes())
  })
  afterEach(() => {
    rmSync(directory, { recursive: true, force: true })
    vi.unstubAllGlobals()
  })

  it('saves from WebUI, reports pending restart and takes effect on a fresh process', async () => {
    expect((await (await app.request('/signing')).json()).data).toMatchObject({
      url: 'http://original.test:18080', activeUrl: 'http://original.test:18080', source: 'environment', restartRequired: false,
    })
    const result = await post('/signing', ' http://custom.test:18080/qq/// ')
    expect(result.status).toBe(200)
    expect((await result.json()).data).toMatchObject({
      url: 'http://custom.test:18080/qq', activeUrl: 'http://original.test:18080', source: 'file', restartRequired: true,
    })
    expect(JSON.parse(readFileSync(join(directory, 'signing.json'), 'utf8'))).toEqual({ url: 'http://custom.test:18080/qq' })
    h.store = new SigningConfig(directory, 'http://original.test:18080')
    expect((await (await app.request('/signing')).json()).data).toMatchObject({
      activeUrl: 'http://custom.test:18080/qq', restartRequired: false,
    })
    await post('/signing', '')
    h.store = new SigningConfig(directory, 'http://original.test:18080')
    expect(h.store.activeUrl).toBe('') // Explicitly choosing built-in overrides the old environment value.
  })

  it('tests health from the server without changing the saved configuration', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true })))
    vi.stubGlobal('fetch', fetch)
    let result = await post('/signing/test', 'http://test.test/qq')
    expect((await result.json()).data.ready).toBe(true)
    expect(fetch).toHaveBeenCalledWith('http://test.test/qq/health', expect.any(Object))
    expect(h.store.status(true).source).toBe('environment')
    fetch.mockImplementation(async () => new Response('service unavailable', { status: 503 }))
    result = await post('/signing/test', 'http://test.test/qq')
    const value = await result.json()
    expect(value.data.ready).toBe(false)
    expect(value.message).toContain('HTTP 503: service unavailable')
  })

  it('rejects invalid addresses and non-Linux or PMHQ configuration', async () => {
    for (const url of ['file:///tmp/sign', 'http://host/sign?key=x', 'http://user:password@host', 123]) {
      expect((await post('/signing', url)).status).toBe(400)
    }
    expect(h.store.status(true).source).toBe('environment')
    h.protocol = 'windows'
    expect((await post('/signing', 'http://test.test')).status).toBe(400)
    h.protocol = 'linux'
    h.pmhq = true
    expect((await (await app.request('/signing')).json()).data.supported).toBe(false)
    expect((await post('/signing/test', 'http://test.test')).status).toBe(400)
  })
})
