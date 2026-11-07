import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import type { SigningSettings } from '../../../common/types'
import { HttpSignClient } from './httpSign'

/** Process-wide setting: it must be available before a QQ account is logged in. */
export class SigningConfig {
  private readonly filename: string
  readonly activeUrl: string

  constructor(dataDirectory: string, private readonly environmentUrl = '') {
    this.filename = join(dataDirectory, 'signing.json')
    this.activeUrl = this.read().url
  }

  private read(): Pick<SigningSettings, 'url' | 'source'> {
    if (existsSync(this.filename)) {
      const value: unknown = JSON.parse(readFileSync(this.filename, 'utf8'))
      if (!value || typeof value !== 'object' || !('url' in value) || typeof value.url !== 'string') {
        throw new Error(`${this.filename}: expected { "url": string }`)
      }
      return { url: value.url.trim() ? new HttpSignClient(value.url.trim()).url : '', source: 'file' }
    }
    const url = this.environmentUrl.trim()
    return { url: url ? new HttpSignClient(url).url : '', source: url ? 'environment' : 'default' }
  }

  status(supported: boolean): SigningSettings {
    const { url, source } = this.read()
    return { url, activeUrl: this.activeUrl, source, restartRequired: url !== this.activeUrl, supported }
  }

  save(url: string): void {
    const normalized = url.trim() ? new HttpSignClient(url.trim()).url : ''
    const temporary = `${this.filename}.tmp`
    writeFileSync(temporary, JSON.stringify({ url: normalized }, null, 2) + '\n', { mode: 0o600 })
    renameSync(temporary, this.filename)
  }
}
