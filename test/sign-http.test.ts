import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { json } from 'node:stream/consumers'
import { once } from 'node:events'
import { test } from 'node:test'
import { HttpSignClient } from '../src/main/qqProtocol/direct-lib/httpSign.ts'

const args = {
  cmd: 'wtlogin.login', bodyHex: '01020304', seq: 10001,
  guidHex: '00112233445566778899aabbccddeeff',
  qua: 'V1_LNX_NQ_3.2.28_48517_GW_B', uin: 0, protocolTokenHex: '',
}
const output = { sign: 'aabb', token: '', extra: '0102' }
const decoded = { sign: Buffer.from('aabb', 'hex'), token: Buffer.alloc(0), extra: Buffer.from('0102', 'hex') }

test('HTTP signing uses the configured base path and preserves inputs and batch order', async t => {
  const requests: { method?: string; url?: string; body: unknown }[] = []
  const server = createServer(async (req, res) => {
    const body = req.method === 'POST' ? await json(req) : undefined
    requests.push({ method: req.method, url: req.url, body })
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(req.url?.endsWith('/health')
      ? { ok: true }
      : req.url?.endsWith('/batch') ? [output, { ...output, sign: 'ccdd' }] : output))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())))
  const address = server.address() as { port: number }
  const client = new HttpSignClient(`http://127.0.0.1:${address.port}/qq///`)
  assert.equal(await client.preflight(), null)
  assert.deepEqual(await client.sign(args), decoded)
  assert.deepEqual(await client.signBatch(args, 2), [decoded, { ...decoded, sign: Buffer.from('ccdd', 'hex') }])
  assert.deepEqual(requests, [
    { method: 'GET', url: '/qq/health', body: undefined },
    { method: 'POST', url: '/qq/sign', body: args },
    { method: 'POST', url: '/qq/sign/batch', body: { args, count: 2 } },
  ])
})

test('HTTP failures and malformed results fail with a useful error', async t => {
  let status = 503
  let body: unknown = { error: 'signer unavailable' }
  const server = createServer((_req, res) => {
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())))
  const client = new HttpSignClient(`http://127.0.0.1:${(server.address() as { port: number }).port}`)
  assert.match((await client.preflight())!, /HTTP 503.*signer unavailable/)
  await assert.rejects(client.sign(args), /\/sign: HTTP 503.*signer unavailable/)
  status = 200
  body = { ...output, sign: 'abc' }
  await assert.rejects(client.sign(args), /sign must contain hexadecimal bytes/)
  body = [output]
  await assert.rejects(client.signBatch(args, 2), /expected 2 batch results/)
  body = { ok: false }
  assert.match((await client.preflight())!, /not ready/)
})
