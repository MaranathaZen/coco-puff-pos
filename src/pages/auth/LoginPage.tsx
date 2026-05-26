// src/pages/auth/LoginPage.tsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { db } from '@/lib/db'
import { supabase, APP_NAME } from '@/lib/supabase'
import { hashPassword } from '@/lib/utils'
import type { User } from '@/types'

type Screen = 'select' | 'pin' | 'master'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, user } = useAuthStore()

  const [screen, setScreen]     = useState<Screen>('select')
  const [kasirs, setKasirs]     = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selected, setSelected] = useState<User | null>(null)
  const [pin, setPin]           = useState('')
  const [error, setError]       = useState('')
  const [shaking, setShaking]   = useState(false)

  // Master login state
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user])

  useEffect(() => {
    loadKasirs()
  }, [])

  async function loadKasirs() {
    setIsLoading(true)
    try {
      // 1. Coba ambil dari Supabase langsung (paling fresh)
      const { data: supabaseUsers } = await supabase
        .from('users')
        .select('*')
        .eq('is_active', true)
        .eq('role', 'kasir')

      if (supabaseUsers && supabaseUsers.length > 0) {
        // Simpan ke IndexedDB untuk offline
        await db.users.bulkPut(supabaseUsers)

        // Ambil data stores sekalian
        const { data: stores } = await supabase.from('stores').select('*')
        if (stores?.length) await db.stores.bulkPut(stores)

        setKasirs(supabaseUsers)
        setIsLoading(false)
        return
      }
    } catch (e) {
      // Offline — fallback ke IndexedDB
      console.log('[LOGIN] Offline, pakai data lokal')
    }

    // 2. Fallback: ambil dari IndexedDB lokal
    const localUsers = await db.users
      .filter(u => u.is_active && u.role === 'kasir')
      .toArray()
    setKasirs(localUsers)
    setIsLoading(false)
  }

  function selectKasir(kasir: User) {
    setSelected(kasir)
    setPin('')
    setError('')
    setScreen('pin')
  }

  async function handlePinInput(digit: string) {
    if (pin.length >= 4) return
    const newPin = pin + digit
    setPin(newPin)

    if (newPin.length === 4) {
      const hash = await hashPassword(newPin)
      if (selected?.password_hash === hash) {
        const success = await login(selected!.username, newPin)
        if (success) navigate('/', { replace: true })
      } else {
        setShaking(true)
        setTimeout(() => {
          setShaking(false)
          setPin('')
          setError('PIN salah, coba lagi')
        }, 500)
      }
    }
  }

  function handleDelete() {
    setPin(p => p.slice(0, -1))
    setError('')
  }

  async function handleMasterLogin() {
    if (!username || !password) return setError('Username dan password wajib diisi')
    setLoading(true)
    setError('')

    // Pull data dari Supabase dulu sebelum login
    try {
      const { data: users } = await supabase.from('users').select('*').eq('is_active', true)
      if (users?.length) await db.users.bulkPut(users)
      const { data: stores } = await supabase.from('stores').select('*')
      if (stores?.length) await db.stores.bulkPut(stores)
    } catch (e) {
      // Offline — lanjut dengan data lokal
    }

    const ok = await login(username, password)
    setLoading(false)
    if (ok) {
      navigate('/', { replace: true })
    } else {
      setError('Username atau password salah')
    }
  }

  // ── Layar pilih kasir ───────────────────────────────────────
  if (screen === 'select') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center">
            <div className="text-5xl mb-3">🧁</div>
            <h1 className="text-2xl font-bold text-gray-800">{APP_NAME}</h1>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-600 text-center mb-4">Siapa yang bertugas?</p>
            {isLoading ? (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-sm text-gray-400">Memuat data...</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {kasirs.map(k => (
                  <button key={k.id} onClick={() => selectKasir(k)}
                    className="bg-white border-2 border-gray-100 rounded-2xl p-4 text-center active:border-brand-400 active:bg-brand-50 transition-all shadow-sm">
                    <div className="w-12 h-12 bg-brand-100 rounded-full flex items-center justify-center text-xl font-bold text-brand-700 mx-auto mb-2">
                      {k.name[0].toUpperCase()}
                    </div>
                    <p className="font-semibold text-gray-800 text-sm">{k.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Kasir</p>
                  </button>
                ))}
                {kasirs.length === 0 && (
                  <div className="col-span-2 text-center text-gray-400 py-8 text-sm">
                    Belum ada kasir terdaftar
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="text-center">
            <button onClick={() => { setScreen('master'); setError('') }}
              className="text-xs text-gray-400 underline underline-offset-2">
              Login sebagai Owner / Manager
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Layar PIN ───────────────────────────────────────────────
  if (screen === 'pin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-xs space-y-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-brand-100 rounded-full flex items-center justify-center text-3xl font-bold text-brand-700 mx-auto mb-3">
              {selected?.name[0].toUpperCase()}
            </div>
            <h2 className="text-xl font-bold text-gray-800">Halo, {selected?.name}! 👋</h2>
            <p className="text-sm text-gray-500 mt-1">Masukkan PIN 4 digit</p>
          </div>

          <div className={`flex justify-center gap-4 ${shaking ? 'animate-bounce' : ''}`}>
            {[0, 1, 2, 3].map(i => (
              <div key={i}
                className={`w-4 h-4 rounded-full border-2 transition-all ${
                  pin.length > i ? 'bg-brand-600 border-brand-600' : 'bg-transparent border-gray-300'
                }`} />
            ))}
          </div>

          {error && <p className="text-center text-sm text-red-500">{error}</p>}

          <div className="grid grid-cols-3 gap-3">
            {['1','2','3','4','5','6','7','8','9'].map(d => (
              <button key={d} onClick={() => handlePinInput(d)}
                className="bg-white border border-gray-100 rounded-2xl py-4 text-xl font-semibold text-gray-800 shadow-sm active:bg-brand-50 active:border-brand-200 transition-all">
                {d}
              </button>
            ))}
            <button onClick={() => { setScreen('select'); setPin(''); setError('') }}
              className="bg-gray-50 border border-gray-100 rounded-2xl py-4 text-sm font-medium text-gray-500 active:bg-gray-100">
              ←
            </button>
            <button onClick={() => handlePinInput('0')}
              className="bg-white border border-gray-100 rounded-2xl py-4 text-xl font-semibold text-gray-800 shadow-sm active:bg-brand-50 active:border-brand-200 transition-all">
              0
            </button>
            <button onClick={handleDelete}
              className="bg-gray-50 border border-gray-100 rounded-2xl py-4 text-xl font-medium text-gray-500 active:bg-gray-100">
              ⌫
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Layar master login ──────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="text-4xl mb-3">🔐</div>
          <h2 className="text-xl font-bold text-gray-800">Login Master</h2>
          <p className="text-sm text-gray-500 mt-1">Owner / Manager</p>
        </div>

        <div className="space-y-3">
          <input className="input" placeholder="Username"
            value={username} onChange={e => setUsername(e.target.value)}
            autoCapitalize="none" autoCorrect="off" />
          <input className="input" type="password" placeholder="Password"
            value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleMasterLogin()} />
        </div>

        {error && <p className="text-sm text-red-500 text-center">{error}</p>}

        <button onClick={handleMasterLogin} disabled={loading} className="btn-primary w-full">
          {loading ? 'Masuk...' : 'Masuk'}
        </button>

        <div className="text-center">
          <button onClick={() => { setScreen('select'); setError('') }}
            className="text-xs text-gray-400 underline underline-offset-2">
            ← Kembali ke pilih kasir
          </button>
        </div>
      </div>
    </div>
  )
}
