'use client'
import { useEffect, useState } from 'react'

export default function ErrorOverlay() {
  const [errors, setErrors] = useState<string[]>([])

  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      setErrors(p => [...p, `JS Error: ${e.message}\n${e.filename}:${e.lineno}`])
    }
    const onUnhandled = (e: PromiseRejectionEvent) => {
      const msg = e.reason instanceof Error
        ? `${e.reason.message}\n${e.reason.stack?.slice(0, 300) ?? ''}`
        : String(e.reason)
      setErrors(p => [...p, `Unhandled Promise: ${msg}`])
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandled)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandled)
    }
  }, [])

  if (errors.length === 0) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(0,0,0,0.85)', color: '#fff',
      padding: 20, overflowY: 'auto', fontFamily: 'monospace', fontSize: 12,
    }}>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12, color: '#f87' }}>
        🔴 Staging Debug — Fehler abgefangen:
      </div>
      {errors.map((e, i) => (
        <pre key={i} style={{
          background: '#111', border: '1px solid #f87', borderRadius: 6,
          padding: 12, marginBottom: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>{e}</pre>
      ))}
      <button
        onClick={() => setErrors([])}
        style={{ marginTop: 8, padding: '8px 16px', background: '#555', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
      >
        Schließen
      </button>
    </div>
  )
}
