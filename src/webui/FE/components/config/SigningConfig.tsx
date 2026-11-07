import React, { useEffect, useState } from 'react'
import { Loader2, Server } from 'lucide-react'
import type { SigningSettings } from '@common/types'
import { apiFetch } from '../../utils/api'

const SigningConfig: React.FC = () => {
  const [settings, setSettings] = useState<SigningSettings | null>(null)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let stopped = false
    void apiFetch<SigningSettings>('/api/signing').then(response => {
      if (stopped) return
      if (!response.success) {
        setError(response.message || '读取签名配置失败')
        return
      }
      setSettings(response.data)
      setUrl(response.data.url)
    }).catch(error => {
      if (!stopped) setError((error as Error).message)
    })
    return () => { stopped = true }
  }, [])

  const save = async () => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await apiFetch<SigningSettings>('/api/signing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
      })
      if (!response.success) throw new Error(response.message || '保存签名配置失败')
      setSettings(response.data)
      setUrl(response.data.url)
      setMessage(response.message || '已保存')
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await apiFetch<{ ready: boolean }>('/api/signing/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
      })
      if (!response.success || !response.data.ready) throw new Error(response.message || '签名服务连接失败')
      setMessage('连接成功，签名服务已就绪。连接测试不会修改配置。')
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card p-6 text-left space-y-4" aria-label="签名服务配置">
      <div className="flex items-center gap-3">
        <Server size={22} className="text-pink-500 shrink-0" />
        <div>
          <h3 className="text-lg font-semibold text-theme">签名服务</h3>
          <p className="text-sm text-theme-secondary">设置自部署签名服务的地址，留空使用内置服务。</p>
        </div>
      </div>
      {settings && !settings.supported && (
        <p className="text-sm text-theme-secondary">自定义签名仅支持 Linux QQ 直连协议。</p>
      )}
      <label className="block">
        <span className="block text-sm font-medium text-theme-secondary mb-2">自定义签名地址</span>
        <input
          type="url" value={url} onChange={event => { setUrl(event.target.value); setMessage(''); setError('') }}
          placeholder="http://127.0.0.1:18080" className="input-field w-full"
          disabled={!settings?.supported || busy} autoComplete="off" spellCheck={false}
        />
      </label>
      <p className="text-xs text-theme-muted">填写 Bot 服务器能够访问的基础地址，不要加 /sign。自定义服务无需官方 Auth Token。</p>
      {settings && (
        <div className="text-sm text-theme-secondary space-y-1 break-all">
          <p>当前使用：{settings.activeUrl || '内置签名服务'}</p>
          {settings.source === 'environment' && <p>当前默认地址来自环境变量，保存后使用网页配置。</p>}
          {settings.restartRequired && (
            <p role="status" className="text-amber-600 dark:text-amber-400">待生效：{settings.url || '内置签名服务'}。请重启 Bot 进程；刷新网页不会生效。</p>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400 break-words">{error}</p>}
      {message && <p role="status" className="text-sm text-theme-secondary">{message}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={test} disabled={busy || !settings?.supported || !url.trim()} className="btn-secondary px-4 py-2 disabled:opacity-50">测试连接</button>
        <button type="button" onClick={save} disabled={busy || !settings?.supported} className="btn-primary px-4 py-2 disabled:opacity-50 flex items-center gap-2">
          {busy && <Loader2 size={16} className="animate-spin" />}保存签名配置
        </button>
      </div>
      <p className="text-xs text-theme-muted">修改后重启 Bot 生效。此项单独保存，不需要点击页面的其他保存按钮。</p>
    </section>
  )
}

export default SigningConfig
