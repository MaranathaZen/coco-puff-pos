// src/pages/auth/LoginPage.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { db } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

function hashPassword(password: string): string {
  // SHA-256 via SubtleCrypto — sync fallback untuk simple hash
  // Untuk kompatibilitas, gunakan SHA-256 hex yang sama dengan existing data
  // existing hash: 03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4 = "1234"
  return password // handled async below
}

export default function LoginPage() {
  const navigate  = useNavigate()
  const { login } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [showPass, setShowPass] = useState(false)

  async function sha256(str: string): Promise<string> {
    const buf    = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('')
  }

  async function handleLogin() {
    if (!username.trim()) return setError('Username wajib diisi')
    if (!password)        return setError('Password wajib diisi')
    setLoading(true)
    setError('')

    const redirectMap: Record<string, string> = {
      owner: '/owner', manager: '/owner',
      gudang: '/stok', produksi: '/stok', kasir: '/kasir',
    }

    try {
      const hash = await sha256(password)

      // Sync dari Supabase
      try {
        const { data: users } = await supabase.from('users').select('*').eq('is_active', true)
        if (users?.length) await db.users.bulkPut(users)
        const { data: stores } = await supabase.from('stores').select('*')
        if (stores?.length) await db.stores.bulkPut(stores)
      } catch { /* offline — lanjut dengan data lokal */ }

      // Cari user yang cocok
      const allUsers = await db.users.filter(u => u.is_active).toArray()
      const user = allUsers.find(u =>
        u.username?.toLowerCase() === username.trim().toLowerCase() &&
        u.password_hash === hash
      )

      if (!user) {
        setError('Username atau password salah')
        setLoading(false)
        return
      }

      const store = await db.stores.get(user.store_id)
      login(user, store || null)
      toast.success(`Selamat datang, ${user.name}!`)

      const dest = redirectMap[user.role] || '/kasir'
      navigate(dest, { replace: true })
    } catch (e) {
      console.error('[LOGIN]', e)
      setError('Login gagal. Coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">

        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl font-bold">CP</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Coco Puff POS</h1>
          <p className="text-sm text-gray-400">Masuk dengan akun Anda</p>
        </div>

        {/* Form */}
        <div className="space-y-3">
          <div>
            <input
              className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-colors bg-gray-50"
              placeholder="Username"
              value={username}
              onChange={e => { setUsername(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              autoCapitalize="none"
              autoComplete="username"
              autoFocus
            />
          </div>
          <div className="relative">
            <input
              className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-colors bg-gray-50 pr-12"
              placeholder="Password"
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              autoComplete="current-password"
            />
            <button
              onClick={() => setShowPass(!showPass)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
              {showPass ? 'Sembunyikan' : 'Tampilkan'}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full py-3.5 rounded-2xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-50 active:scale-[0.98] transition-transform">
            {loading ? 'Memverifikasi...' : 'Masuk'}
          </button>
        </div>

        {/* Info */}
        <div className="text-center">
          <p className="text-xs text-gray-300">
            Belum punya akun? Hubungi admin toko Anda.
          </p>
        </div>

      </div>
    </div>
  )
}
