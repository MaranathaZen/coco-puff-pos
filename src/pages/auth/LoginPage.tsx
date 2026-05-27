// src/pages/auth/LoginPage.tsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { db } from '@/lib/db'
import { supabase, APP_NAME } from '@/lib/supabase'
import { hashPassword } from '@/lib/utils'
import type { User } from '@/types'

type Screen = 'store_code' | 'select' | 'pin' | 'master'

// Kode toko disimpan di env atau di record Store sebagai `access_code`
// Fallback: 4 karakter pertama dari store_id (uppercase)
function getStoreAccessCode(storeId: string, accessCode?: string): string {
  return accessCode ?? storeId.slice(0, 4).toUpperCase()
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, user } = useAuthStore()

  const [screen, setScreen]         = useState<Screen>('store_code')
  const [storeCode, setStoreCode]   = useState('')
  const [storeCodeError, setStoreCodeError] = useState('')
  const [storeCodeLoading, setStoreCodeLoading] = useState(false)

  const [kasirs, setKasirs]         = useState<User[]>([])
  const [isLoading, setIsLoading]   = useState(false)
  const [selected, setSelected]     = useState<User | null>(null)
  const [pin, setPin]               = useState('')
  const [error, setError]           = useState('')
  const [shaking, setShaking]       = useState(false)

  // Master login
  const [username, setUsername]     = useState('')
  const [password, setPassword]     = useState('')
  const [loading, setLoading]       = useState(false)

  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user])

  // ── Verifikasi kode toko ─────────────────────────────────────
  async function handleStoreCodeSubmit() {
    const code = storeCode.trim().toUpperCase()
    if (code.length < 3) {
      setStoreCodeError('Kode toko tidak valid')
      return
    }
    setStoreCodeLoading(true)
    setStoreCodeError('')

    try {
      // Cek di Supabase: stores yang punya access_code = code
      const { data: stores } = await supabase
        .from('stores')
        .select('*')
        .eq('is_active', true)

      // Fallback: cocokkan dgn 4 karakter pertama id
      const matched = stores?.find(s =>
        (s.access_code && s.access_code.toUpperCase() === code) ||
        s.id.slice(0, 4).toUpperCase() === code
      )

      if (matched) {
        await db.stores.bulkPut(stores ?? [])
        await loadKasirs(matched.id)
        setScreen('select')
      } else {
        setStoreCodeError('Kode toko tidak ditemukan')
        shakeEffect()
      }
    } catch (e) {
      // Offline: cek IndexedDB
      const localStores = await db.stores.filter(s => s.is_active).toArray()
      const matched = localStores.find(s =>
        (s as any).access_code?.toUpperCase() === code ||
        s.id.slice(0, 4).toUpperCase() === code
      )
      if (matched) {
        await loadKasirs(matched.id)
        setScreen('select')
      } else {
        setStoreCodeError('Kode toko tidak ditemukan (mode offline)')
        shakeEffect()
      }
    } finally {
      setStoreCodeLoading(false)
    }
  }

  function shakeEffect() {
    setShaking(true)
    setTimeout(() => setShaking(false), 500)
  }

  async function loadKasirs(storeId: string) {
    setIsLoading(true)
    try {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('is_active', true)
        .eq('store_id', storeId)
        .neq('role', 'owner')  // owner tidak muncul di list kasir

      if (data?.length) {
        await db.users.bulkPut(data)
        setKasirs(data.filter((u: User) => u.role === 'kasir'))
      } else {
        throw new Error('Supabase kosong')
      }
    } catch {
      const local = await db.users
        .where('store_id').equals(storeId)
        .filter(u => u.is_active && u.role === 'kasir')
        .toArray()
      setKasirs(local)
    } finally {
      setIsLoading(false)
    }
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
    try {
      const { data: users } = await supabase.from('users').select('*').eq('is_active', true)
      if (users?.length) await db.users.bulkPut(users)
      const { data: stores } = await supabase.from('stores').select('*')
      if (stores?.length) await db.stores.bulkPut(stores)
    } catch { /* offline */ }

    const ok = await login(username, password)
    setLoading(false)
    if (ok) {
      navigate('/', { replace: true })
    } else {
      setError('Username atau password salah')
    }
  }

  // ─────────────────────────────────────────────────────────────
  // SCREEN: Kode Toko
  // ─────────────────────────────────────────────────────────────
  if (screen === 'store_code') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-xs space-y-8">

          {/* Header */}
          <div className="text-center space-y-1">
            <div className="w-14 h-14 bg-brand-50 border border-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl font-black text-brand-600">CP</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">{APP_NAME}</h1>
            <p className="text-sm text-gray-400">Masukkan kode toko untuk melanjutkan</p>
          </div>

          {/* Input kode toko */}
          <div className={`space-y-3 ${shaking ? 'animate-bounce' : ''}`}>
            <input
              className="input text-center text-lg font-bold tracking-widest uppercase"
              placeholder="KODE TOKO"
              value={storeCode}
              maxLength={8}
              onChange={e => {
                setStoreCode(e.target.value.toUpperCase())
                setStoreCodeError('')
              }}
              onKeyDown={e => e.key === 'Enter' && handleStoreCodeSubmit()}
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
            />
            {storeCodeError && (
              <p className="text-xs text-red-500 text-center">{storeCodeError}</p>
            )}
            <button
              onClick={handleStoreCodeSubmit}
              disabled={storeCodeLoading || storeCode.length < 3}
              className="btn-primary w-full"
            >
              {storeCodeLoading ? 'Memeriksa...' : 'Lanjut'}
            </button>
          </div>

          {/* Link owner/manager — tidak perlu kode toko */}
          <div className="text-center">
            <button
              onClick={() => { setScreen('master'); setError('') }}
              className="text-xs text-gray-400 underline underline-offset-2"
            >
              Login sebagai Owner / Manager
            </button>
          </div>

        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────
  // SCREEN: Pilih Kasir
  // ─────────────────────────────────────────────────────────────
  if (screen === 'select') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">

          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-gray-900">Pilih Akun</h2>
            <p className="text-sm text-gray-400">Ketuk nama Anda untuk masuk</p>
          </div>

          {isLoading ? (
            <div className="text-center py-10">
              <div className="w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm text-gray-400">Memuat data...</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {kasirs.map(k => (
                <button
                  key={k.id}
                  onClick={() => selectKasir(k)}
                  className="bg-white border border-gray-100 rounded-2xl p-4 text-center shadow-sm hover:border-brand-200 hover:bg-brand-50 active:scale-95 transition-all"
                >
                  <div className="w-11 h-11 bg-brand-50 border border-brand-100 rounded-full flex items-center justify-center text-base font-bold text-brand-600 mx-auto mb-2">
                    {k.name[0].toUpperCase()}
                  </div>
                  <p className="font-semibold text-gray-800 text-sm truncate">{k.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5 capitalize">{k.role}</p>
                </button>
              ))}
              {kasirs.length === 0 && (
                <div className="col-span-2 text-center text-gray-400 py-10 text-sm">
                  Belum ada kasir terdaftar untuk toko ini
                </div>
              )}
            </div>
          )}

          <div className="text-center">
            <button
              onClick={() => { setScreen('store_code'); setStoreCode(''); setStoreCodeError('') }}
              className="text-xs text-gray-400 underline underline-offset-2"
            >
              Ganti kode toko
            </button>
          </div>

        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────
  // SCREEN: PIN
  // ─────────────────────────────────────────────────────────────
  if (screen === 'pin') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-xs space-y-6">

          <div className="text-center space-y-1">
            <div className="w-14 h-14 bg-brand-50 border border-brand-100 rounded-full flex items-center justify-center text-2xl font-bold text-brand-600 mx-auto mb-3">
              {selected?.name[0].toUpperCase()}
            </div>
            <h2 className="text-lg font-bold text-gray-900">{selected?.name}</h2>
            <p className="text-sm text-gray-400">Masukkan PIN 4 digit</p>
          </div>

          {/* Dot indikator PIN */}
          <div className={`flex justify-center gap-4 ${shaking ? 'animate-bounce' : ''}`}>
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-150 ${
                  pin.length > i
                    ? 'bg-brand-600 border-brand-600 scale-110'
                    : 'bg-transparent border-gray-300'
                }`}
              />
            ))}
          </div>

          {error && <p className="text-center text-sm text-red-500">{error}</p>}

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-3">
            {['1','2','3','4','5','6','7','8','9'].map(d => (
              <button
                key={d}
                onClick={() => handlePinInput(d)}
                className="bg-white border border-gray-100 rounded-2xl py-4 text-xl font-semibold text-gray-800 shadow-sm active:bg-brand-50 active:border-brand-200 active:scale-95 transition-all"
              >
                {d}
              </button>
            ))}
            <button
              onClick={() => { setScreen('select'); setPin(''); setError('') }}
              className="bg-gray-50 border border-gray-100 rounded-2xl py-4 text-sm font-medium text-gray-500 active:bg-gray-100"
            >
              ←
            </button>
            <button
              onClick={() => handlePinInput('0')}
              className="bg-white border border-gray-100 rounded-2xl py-4 text-xl font-semibold text-gray-800 shadow-sm active:bg-brand-50 active:border-brand-200 active:scale-95 transition-all"
            >
              0
            </button>
            <button
              onClick={handleDelete}
              className="bg-gray-50 border border-gray-100 rounded-2xl py-4 text-xl font-medium text-gray-500 active:bg-gray-100"
            >
              ⌫
            </button>
          </div>

        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────
  // SCREEN: Master Login (Owner / Manager)
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">

        <div className="text-center space-y-1">
          <div className="w-12 h-12 bg-gray-100 border border-gray-200 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900">Login Owner / Manager</h2>
          <p className="text-sm text-gray-400">Akses penuh ke semua fitur</p>
        </div>

        <div className="space-y-3">
          <input
            className="input"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
          />
          <input
            className="input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleMasterLogin()}
          />
        </div>

        {error && <p className="text-sm text-red-500 text-center">{error}</p>}

        <button onClick={handleMasterLogin} disabled={loading} className="btn-primary w-full">
          {loading ? 'Masuk...' : 'Masuk'}
        </button>

        <div className="text-center">
          <button
            onClick={() => { setScreen('store_code'); setError(''); setStoreCode('') }}
            className="text-xs text-gray-400 underline underline-offset-2"
          >
            Kembali
          </button>
        </div>

      </div>
    </div>
  )
}
