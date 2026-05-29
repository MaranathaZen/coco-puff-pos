// src/pages/auth/LoginPage.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { db } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const navigate  = useNavigate()
  const { login } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [showPass, setShowPass] = useState(false)

  async function handleLogin() {
    if (!username.trim()) return setError('Username wajib diisi')
    if (!password)        return setError('Password wajib diisi')
    setLoading(true)
    setError('')

    try {
      // Sync users dari Supabase dulu (silent fail kalau offline)
      try {
        const { data: users } = await supabase.from('users').select('*').eq('is_active', true)
        if (users?.length) await db.users.bulkPut(users)
        const { data: stores } = await supabase.from('stores').select('*')
        if (stores?.length) await db.stores.bulkPut(stores)
      } catch { /* offline — lanjut dengan data lokal */ }

      // Gunakan login() dari auth store (sudah handle hash, shift, dll)
      const success = await login(username.trim().toLowerCase(), password)

      if (!success) {
        setError('Username atau password salah')
        setLoading(false)
        return
      }

      // Ambil user yang baru login untuk redirect
      const { user } = useAuthStore.getState()
      toast.success(`Selamat datang, ${user?.name}!`)

      const redirectMap: Record<string, string> = {
        owner: '/owner', manager: '/owner',
        gudang: '/stok', produksi: '/stok', kasir: '/kasir',
      }
      navigate(redirectMap[user?.role || 'kasir'] || '/kasir', { replace: true })
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
          <div className="relative">
            <input
              className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-colors bg-gray-50 pr-24"
              placeholder="Password"
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              autoComplete="current-password"
            />
            <button
              onClick={() => setShowPass(!showPass)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400">
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

        <div className="text-center">
          <p className="text-xs text-gray-300">Belum punya akun? Hubungi admin toko Anda.</p>
        </div>
      </div>
    </div>
  )
}
