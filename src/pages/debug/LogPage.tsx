// src/pages/debug/LogPage.tsx
// Halaman monitoring log error — hanya owner/manager
// Tambahkan sebagai tab di DebugPage atau halaman sendiri

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { RefreshCw, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'

interface LogEntry {
  id: string
  level: 'error' | 'warn' | 'info'
  page: string
  message: string
  detail?: string
  user_id?: string
  store_id?: string
  created_at: string
}

const LEVEL_CONFIG = {
  error: { icon: AlertCircle,   color: 'text-red-500',    bg: 'bg-red-50',    border: 'border-red-100',   label: 'Error'   },
  warn:  { icon: AlertTriangle, color: 'text-amber-500',  bg: 'bg-amber-50',  border: 'border-amber-100', label: 'Warning' },
  info:  { icon: Info,          color: 'text-blue-500',   bg: 'bg-blue-50',   border: 'border-blue-100',  label: 'Info'    },
}

export default function LogPage() {
  const { user } = useAuthStore()
  const isOwnerManager = ['owner', 'manager'].includes(user?.role || '')

  const [logs,        setLogs]        = useState<LogEntry[]>([])
  const [loading,     setLoading]     = useState(true)
  const [filterLevel, setFilterLevel] = useState<'all' | 'error' | 'warn' | 'info'>('all')
  const [filterStore, setFilterStore] = useState('all')
  const [stores,      setStores]      = useState<{ id: string; name: string }[]>([])
  const [selected,    setSelected]    = useState<LogEntry | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)

  useEffect(() => {
    loadStores()
    loadLogs()
  }, [])

  useEffect(() => {
    if (!autoRefresh) return
    const iv = setInterval(loadLogs, 10_000)
    return () => clearInterval(iv)
  }, [autoRefresh, filterLevel, filterStore])

  async function loadStores() {
    const { data } = await supabase.from('stores').select('id, name').eq('is_active', true)
    if (data) setStores(data.filter(s => !s.id.includes('gudang') && !s.id.includes('produksi')))
  }

  async function loadLogs() {
    setLoading(true)
    try {
      let query = supabase
        .from('app_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)

      if (filterLevel !== 'all') query = query.eq('level', filterLevel)
      if (filterStore !== 'all') query = query.eq('store_id', filterStore)

      const { data } = await query
      if (data) setLogs(data)
    } finally {
      setLoading(false)
    }
  }

  async function clearLogs() {
    if (!confirm('Hapus semua log? Data tidak bisa dikembalikan.')) return
    await supabase.from('app_logs').delete().neq('id', 'x')
    setLogs([])
  }

  const errorCount = logs.filter(l => l.level === 'error').length
  const warnCount  = logs.filter(l => l.level === 'warn').length

  if (!isOwnerManager) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-gray-400">Akses terbatas — owner/manager only</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">App Logs</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {errorCount > 0 && <span className="text-red-500 font-medium">{errorCount} error · </span>}
              {warnCount > 0  && <span className="text-amber-500 font-medium">{warnCount} warning · </span>}
              {logs.length} total
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Auto refresh toggle */}
            <button onClick={() => setAutoRefresh(!autoRefresh)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors ${autoRefresh ? 'bg-green-50 text-green-600 border-green-200' : 'bg-white text-gray-500 border-gray-200'}`}>
              {autoRefresh ? '⟳ Live' : 'Live'}
            </button>
            <button onClick={loadLogs} disabled={loading}
              className="p-2 text-gray-400 rounded-full">
              <RefreshCw size={15} className={loading ? 'animate-spin text-blue-500' : ''} />
            </button>
          </div>
        </div>

        {/* Filter level */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide mb-2">
          {(['all', 'error', 'warn', 'info'] as const).map(l => (
            <button key={l} onClick={() => { setFilterLevel(l); setTimeout(loadLogs, 100) }}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filterLevel === l
                  ? l === 'error' ? 'bg-red-600 text-white'
                  : l === 'warn'  ? 'bg-amber-500 text-white'
                  : l === 'info'  ? 'bg-blue-500 text-white'
                  : 'bg-gray-900 text-white'
                  : l === 'error' ? 'bg-red-50 text-red-600 border border-red-200'
                  : l === 'warn'  ? 'bg-amber-50 text-amber-600 border border-amber-200'
                  : l === 'info'  ? 'bg-blue-50 text-blue-600 border border-blue-200'
                  : 'bg-white text-gray-600 border border-gray-200'
              }`}>
              {l === 'all' ? 'Semua' : l === 'error' ? '🔴 Error' : l === 'warn' ? '🟡 Warning' : '🔵 Info'}
            </button>
          ))}
        </div>

        {/* Filter toko */}
        {stores.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            <button onClick={() => { setFilterStore('all'); setTimeout(loadLogs, 100) }}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterStore === 'all' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
              Semua Toko
            </button>
            {stores.map(s => (
              <button key={s.id} onClick={() => { setFilterStore(s.id); setTimeout(loadLogs, 100) }}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterStore === s.id ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
                {s.name.replace(' Malang', '').replace(' Bali', '')}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Log list */}
      <div className="flex-1 overflow-auto p-4 space-y-2">
        {loading && logs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 py-12 text-center text-sm text-gray-400">Memuat log...</div>
        ) : logs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 py-12 text-center">
            <p className="text-2xl mb-2">✅</p>
            <p className="text-sm font-medium text-gray-600">Tidak ada log</p>
            <p className="text-xs text-gray-400 mt-1">Semua berjalan normal</p>
          </div>
        ) : (
          <>
            {logs.map(log => {
              const cfg = LEVEL_CONFIG[log.level]
              const Icon = cfg.icon
              return (
                <button key={log.id} onClick={() => setSelected(log)}
                  className={`w-full text-left rounded-xl border ${cfg.border} ${cfg.bg} px-4 py-3 flex items-start gap-3 active:opacity-80`}>
                  <Icon size={15} className={`${cfg.color} flex-shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-gray-700 truncate">[{log.page}] {log.message}</p>
                      <p className="text-[10px] text-gray-400 flex-shrink-0">
                        {new Date(log.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                      </p>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {new Date(log.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                      {log.store_id && ` · ${stores.find(s => s.id === log.store_id)?.name || log.store_id}`}
                    </p>
                    {log.detail && (
                      <p className="text-[10px] text-gray-500 mt-1 font-mono truncate">{log.detail.slice(0, 80)}...</p>
                    )}
                  </div>
                </button>
              )
            })}
            <button onClick={clearLogs} className="w-full py-3 text-xs text-red-400 font-medium">
              Hapus semua log
            </button>
          </>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <p className="font-semibold text-gray-900">[{selected.page}]</p>
                <p className="text-xs text-gray-400">
                  {new Date(selected.created_at).toLocaleString('id-ID')}
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="p-1 text-gray-400"><X size={18} /></button>
            </div>
            <div className="overflow-auto flex-1 px-5 py-4 space-y-3">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Message</p>
                <p className="text-sm text-gray-900">{selected.message}</p>
              </div>
              {selected.detail && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Detail</p>
                  <pre className="text-xs text-gray-700 bg-gray-50 rounded-xl p-3 overflow-auto whitespace-pre-wrap font-mono">
                    {(() => { try { return JSON.stringify(JSON.parse(selected.detail), null, 2) } catch { return selected.detail } })()}
                  </pre>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {selected.store_id && (
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Toko</p>
                    <p className="text-sm text-gray-700">{stores.find(s => s.id === selected.store_id)?.name || selected.store_id}</p>
                  </div>
                )}
                {selected.user_id && (
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">User ID</p>
                    <p className="text-xs text-gray-500 font-mono">{selected.user_id.slice(0, 16)}...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
