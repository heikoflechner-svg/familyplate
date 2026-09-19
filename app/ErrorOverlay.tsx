'use client'
import { useEffect, useState } from 'react'

const KEY = 'fp_staging_debug'

export function stagingLog(msg: string) {
  try {
    const existing = JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]
    existing.push(`${new Date().toISOString().slice(11, 23)} ${msg}`)
    localStorage.setItem(KEY, JSON.stringify(existing.slice(-40)))
  } catch {}
}

export default function ErrorOverlay() {
  const [errors, setErrors] = useState<string[]>([])
  const [debugLog, setDebugLog] = useState<string[]>([])

  useEffect(() => {
    // Read log from previous session (survives redirects and tab crashes)
    const prev = JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]
    if (prev.length > 0) setDebugLog(prev)

    stagingLog('PAGE_LOADED url=' + location.href)

    const onError = (e: ErrorEvent) => {
      stagingLog('JS_ERROR ' + e.message + ' at ' + e.filename + ':' + e.lineno)
      setErrors(p => [...p, `JS Error: ${e.message}\n${e.filename}:${e.lineno}`])
    }
    const onUnhandled = (e: PromiseRejectionEvent) => {
      const msg = e.reason instanceof Error
        ? `${e.reason.message}\n${e.reason.stack?.slice(0, 200) ?? ''}`
        : String(e.reason)
      stagingLog('UNHANDLED_PROMISE ' + String(e.reason instanceof Error ? e.reason.message : e.reason))
      setErrors(p => [...p, `Unhandled Promise: ${msg}`])
    }
    const onUnload = () => {
      stagingLog('BEFORE_UNLOAD navigating away from ' + location.href)
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandled)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandled)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [])

  const hasAnything = errors.length > 0 || debugLog.length > 0
  if (!hasAnything) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(0,0,0,0.92)', color: '#fff',
      padding: 20, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11,
    }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, color: '#fa0' }}>
        🔴 Staging Debug — Log aus vorheriger Session:
      </div>
      {debugLog.length > 0 && (
        <pre style={{
          background: '#111', border: '1px solid #fa0', borderRadius: 6,
          padding: 12, marginBottom: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>
          {debugLog.join('\n')}
        </pre>
      )}
      {errors.map((e, i) => (
        <pre key={i} style={{
          background: '#111', border: '1px solid #f87', borderRadius: 6,
          padding: 12, marginBottom: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>{e}</pre>
      ))}
      <button
        onClick={() => { localStorage.removeItem(KEY); setErrors([]); setDebugLog([]) }}
        style={{ padding: '8px 16px', background: '#555', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
      >
        Log löschen & schließen
      </button>
    </div>
  )
}
