import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  protocol: 'linux',
  proxy: {} as Record<string, unknown>,
  authTokenStatus: { hasToken: false, validation: 'idle', message: '', loginError: '' },
}))
vi.mock('@/common/globalVars', () => ({ authTokenStatus: h.authTokenStatus, selfInfo: { online: false } }))
vi.mock('@/common/logger', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  isDebugEnabled: () => false,
}))
vi.mock('@/common/utils/environment', () => ({
  getProtocol: () => h.protocol, getCdn: () => 'cf', getAuthTokenPageUrl: () => 'unused',
}))
vi.mock('@/main/qqProtocol/direct-lib/sign-proxy', () => ({ getSignProxy: () => h.proxy }))
vi.mock('@/main/qqProtocol/direct-lib/profiles', () => ({ getActiveProfile: () => ({ family: 'nt' }) }))
vi.mock('@/main/qqProtocol/direct-lib/machineGuid', () => ({ loadMachineGuidSync: () => Buffer.alloc(16) }))
vi.mock('@/main/qqProtocol/direct-lib/macosDevice', () => ({ getMacosDevice: vi.fn() }))
vi.mock('@/main/config', () => ({
  authTokenUtil: { getPath: () => '/unused/auth_token.txt', reload: vi.fn(() => '') },
}))
vi.mock('node:fs', () => ({ watchFile: vi.fn() }))

const args = {
  cmd: 'wtlogin.login', bodyHex: '01020304', seq: 10001,
  guidHex: '00112233445566778899aabbccddeeff',
  qua: 'V1_LNX_NQ_3.2.28_48517_GW_B', uin: 0, protocolTokenHex: '',
}
const output = { sign: 'aabb', token: '', extra: '0102' }
const decoded = { sign: Buffer.from('aabb', 'hex'), token: Buffer.alloc(0), extra: Buffer.from('0102', 'hex') }
const init = {
  botVersion: 'test', authToken: 'must-not-reach-manager', uin: 123456,
  machineGuid: Buffer.from(args.guidHex, 'hex'), sendPacket: async () => Buffer.alloc(0),
}

describe('custom Linux signing', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('LLBOT_SIGN_URL', 'http://sign.test')
    h.protocol = 'linux'
    Object.assign(h.authTokenStatus, { hasToken: false, validation: 'idle', message: '', loginError: '' })
    h.proxy = {
      init: vi.fn(async () => {}),
      signRequest: vi.fn(), signXwidBurst: vi.fn(), validateAuthToken: vi.fn(), setAuthToken: vi.fn(),
      acquireSignToken: vi.fn(), getLinuxSAToken: vi.fn(async () => ({ token: 'LOCAL_TOKEN1', ttlSecs: 3600 })),
    }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(
      url.endsWith('/health') ? { ok: true } : url.endsWith('/batch') ? [output, output] : output,
    ), { headers: { 'Content-Type': 'application/json' } })))
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('starts without a manager token, signs via HTTP, and obtains protocol tokens locally', async () => {
    const sign = await import('@/main/qqProtocol/direct-lib/sign')
    const { startAuthTokenWatcher } = await import('@/main/qqProtocol/direct-lib/authTokenWatcher')
    const onValid = vi.fn(async () => {})
    startAuthTokenWatcher(onValid, { info: vi.fn(), warn: vi.fn(), error: vi.fn() })
    await vi.waitFor(() => expect(onValid).toHaveBeenCalledWith(sign.CUSTOM_SIGN_TOKEN))

    await sign.setupSign(init)
    expect(h.proxy.init).toHaveBeenCalledWith(
      expect.objectContaining({ uin: undefined, authToken: sign.CUSTOM_SIGN_TOKEN }), init.sendPacket, expect.any(Function),
    )
    expect(await sign.requestSign(args.cmd, Buffer.from(args.bodyHex, 'hex'), args.seq, init.machineGuid, args.qua)).toEqual(decoded)
    expect(await sign.signLinuxXwidBurst(args, 2)).toEqual([decoded, decoded])
    expect(await sign.acquireSignToken(123456, args.qua)).toEqual({ token: 'LOCAL_TOKEN1', ttlSecs: 3600 })
    await sign.updateAuthToken('must-not-reach-manager')
    for (const method of ['signRequest', 'signXwidBurst', 'validateAuthToken', 'setAuthToken', 'acquireSignToken']) {
      expect(h.proxy[method]).not.toHaveBeenCalled()
    }
  })

  it('preserves HTTP failure details and does not switch to native signing', async () => {
    const sign = await import('@/main/qqProtocol/direct-lib/sign')
    await sign.setupSign(init)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('signer unavailable', { status: 503 })))
    const result = await sign.validateAuthToken('')
    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toContain('HTTP 503: signer unavailable')
    expect(await sign.requestSign(args.cmd, Buffer.from(args.bodyHex, 'hex'), args.seq, init.machineGuid, args.qua)).toBeNull()
    expect(h.proxy.signRequest).not.toHaveBeenCalled()
  })

  it('rejects a native module without local Linux token support', async () => {
    h.proxy.getLinuxSAToken = undefined
    const sign = await import('@/main/qqProtocol/direct-lib/sign')
    await expect(sign.setupSign(init)).rejects.toThrow('getLinuxSAToken')
    expect(h.proxy.init).not.toHaveBeenCalled()
    expect(h.proxy.acquireSignToken).not.toHaveBeenCalled()
  })

  it('rejects unsupported protocols at startup', async () => {
    h.protocol = 'windows'
    await expect(import('@/main/qqProtocol/direct-lib/sign')).rejects.toThrow('only the Linux QQ protocol')
  })
})
