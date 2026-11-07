import { Hono } from 'hono'
import { getProtocol, isPmhqMode } from '@/common/utils/environment'
import { signingConfig } from '../../../main/qqProtocol/direct-lib/sign'
import { HttpSignClient } from '../../../main/qqProtocol/direct-lib/httpSign'

/** Mounted after WebUI authentication, including before QQ login. */
export function createSigningRoutes(): Hono {
  const router = new Hono()
  const supported = () => !isPmhqMode() && getProtocol() === 'linux'

  router.get('/signing', c => c.json({ success: true, data: signingConfig.status(supported()) }))

  router.post('/signing', async c => {
    if (!supported()) return c.json({ success: false, message: '自定义签名仅支持 Linux QQ 直连协议' }, 400)
    const body: unknown = await c.req.json().catch(() => null)
    if (!body || typeof body !== 'object' || !('url' in body) || typeof body.url !== 'string') {
      return c.json({ success: false, message: '签名地址必须是字符串，留空使用内置服务' }, 400)
    }
    // Validate before writing; storage failures must remain distinguishable from invalid input.
    try {
      if (body.url.trim()) new HttpSignClient(body.url.trim())
    } catch (error) {
      return c.json({ success: false, message: (error as Error).message }, 400)
    }
    signingConfig.save(body.url)
    const data = signingConfig.status(supported())
    return c.json({ success: true, data, message: data.restartRequired ? '已保存，重启 Bot 后生效' : '签名配置已保存' })
  })

  router.post('/signing/test', async c => {
    if (!supported()) return c.json({ success: false, message: '自定义签名仅支持 Linux QQ 直连协议' }, 400)
    const body: unknown = await c.req.json().catch(() => null)
    if (!body || typeof body !== 'object' || !('url' in body) || typeof body.url !== 'string' || !body.url.trim()) {
      return c.json({ success: false, message: '请填写要测试的签名服务地址' }, 400)
    }
    let client: HttpSignClient
    try {
      client = new HttpSignClient(body.url.trim())
    } catch (error) {
      return c.json({ success: false, message: (error as Error).message }, 400)
    }
    const reason = await client.preflight()
    return c.json({ success: true, data: { ready: !reason }, message: reason ?? '连接成功，签名服务已就绪' })
  })

  return router
}
