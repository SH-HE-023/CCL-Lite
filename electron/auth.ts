import crypto from 'node:crypto'
import type { Account } from '../shared/types'

export function offlineUuid(name: string): string {
  const hash = crypto.createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`
}

export function createOfflineAccount(name: string): Account {
  const trimmed = name.trim()
  if (!/^[A-Za-z0-9_]{3,16}$/.test(trimmed)) throw new Error('离线用户名需为 3-16 位字母、数字或下划线')
  return {
    id: crypto.randomUUID(),
    type: 'offline',
    name: trimmed,
    uuid: offlineUuid(trimmed),
    accessToken: '0',
    createdAt: Date.now(),
  }
}
