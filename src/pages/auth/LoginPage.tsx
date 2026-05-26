import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { STORE_NAME } from '@/lib/supabase'
import { Eye, EyeOff, LogIn } from 'lucide-react'

export default function LoginPage() {
  const navigate  = useNavigate()
  const { login, isLoading, error, clearError } = useAuthStore()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    clearError()
    const ok = await login(username.trim(), password)
    if (ok) navigate('/')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-600 to-brand-800
                    flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-white rounded-3xl shadow-lg mx-auto
                          flex items-center justify-center mb-4">
            <span className="text-4xl">🧁</span>
          </div>
          <h1 className="text-2xl font-bold text-white">{STORE_NAME}</h1>
          <p className="text-brand-200 text-sm mt-1">Point of Sale</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin}
              className="bg-white rounded-3xl shadow-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Masuk</h2>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700
                            text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Username
            </label>
            <input
              className="input"
              type="text"
              placeholder="Masukkan username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                className="input pr-10"
                type={showPass ? 'text' : 'password'}
                placeholder="Masukkan password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
              >
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary w-full flex items-center justify-center gap-2 mt-2"
          >
            {isLoading ? (
              <span className="animate-spin w-4 h-4 border-2 border-white
                               border-t-transparent rounded-full" />
            ) : (
              <LogIn size={18} />
            )}
            {isLoading ? 'Memproses...' : 'Masuk'}
          </button>
        </form>

        <p className="text-center text-brand-200 text-xs mt-6">
          Coco Puff POS v1.0
        </p>
      </div>
    </div>
  )
}
