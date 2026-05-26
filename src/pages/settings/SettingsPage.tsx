// src/pages/settings/SettingsPage.tsx
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now, addToSyncQueue } from '@/lib/db'
import { STORE_ID, STORE_NAME } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { hashPassword } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { User, Role } from '@/types'

export default function SettingsPage() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<'users' | 'password'>('users')

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-semibold text-gray-800">Pengaturan</h2>

      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
        {(['users', 'password'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}>
            {t === 'users' ? 'Kelola User' : 'Ganti Password'}
          </button>
        ))}
      </div>

      {tab === 'users' && <UsersTab currentUser={user!} />}
      {tab === 'password' && <ChangePasswordTab userId={user!.id} />}
    </div>
  )
}

function UsersTab({ currentUser }: { currentUser: User }) {
  const [showForm, setShowForm] = useState(false)
  const [editUser, setEdit]     = useState<User | null>(null)

  const users = useLiveQuery(() =>
    db.users.where('store_id').equals(STORE_ID).toArray(), [])

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">{STORE_NAME}</p>
        {currentUser.role === 'owner' && (
          <button onClick={() => { setEdit(null); setShowForm(true) }}
            className="btn-primary text-sm px-3 py-2">
            + Tambah User
          </button>
        )}
      </div>
      {users?.map(u => (
        <div key={u.id} className="card flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center font-semibold text-brand-700">
            {u.name[0].toUpperCase()}
          </div>
          <div className="flex-1">
            <p className="font-medium text-gray-800">{u.name}</p>
            <p className="text-xs text-gray-500">@{u.username} · {u.role}</p>
          </div>
          {currentUser.role === 'owner' && u.id !== currentUser.id && (
            <button onClick={() => { setEdit(u); setShowForm(true) }}
              className="text-xs text-brand-600 font-medium">
              Edit
            </button>
          )}
        </div>
      ))}
      {showForm && (
        <UserForm user={editUser} onClose={() => setShowForm(false)} />
      )}
    </div>
  )
}

function UserForm({ user, onClose }: { user: User | null; onClose: () => void }) {
  const [name, setName]       = useState(user?.name || '')
  const [username, setUname]  = useState(user?.username || '')
  const [password, setPass]   = useState('')
  const [role, setRole]       = useState<Role>(user?.role || 'kasir')
  const [saving, setSaving]   = useState(false)

  async function handleSave() {
    if (!name || !username) return toast.error('Nama dan username wajib diisi')
    if (!user && !password)  return toast.error('Password wajib diisi untuk user baru')
    setSaving(true)
    try {
      const isNew = !user
      const data: User = {
        id:            user?.id || generateId(),
        store_id:      STORE_ID,
        name,
        username,
        password_hash: password ? await hashPassword(password) : user!.password_hash,
        role,
        is_active:     user?.is_active ?? true,
        created_at:    user?.created_at || now(),
      }
      await db.users.put(data)
      await addToSyncQueue('users', data.id, isNew ? 'insert' : 'update', data, STORE_ID)
      toast.success(isNew ? 'User ditambahkan' : 'User diupdate')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4">
        <h3 className="font-semibold text-lg">{user ? 'Edit User' : 'Tambah User'}</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Nama</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Username</label>
            <input className="input" value={username} onChange={e => setUname(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">
              Password {user && '(kosongkan jika tidak diubah)'}
            </label>
            <input className="input" type="password" value={password} onChange={e => setPass(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Role</label>
            <select className="input" value={role} onChange={e => setRole(e.target.value as Role)}>
              <option value="kasir">Kasir</option>
              <option value="gudang">Gudang</option>
              <option value="manager">Manager</option>
              <option value="owner">Owner</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Batal</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ChangePasswordTab({ userId }: { userId: string }) {
  const [oldPass, setOld]  = useState('')
  const [newPass, setNew]  = useState('')
  const [saving, setSaving] = useState(false)

  async function handleChange() {
    if (!oldPass || !newPass) return toast.error('Semua field wajib diisi')
    if (newPass.length < 6)   return toast.error('Password minimal 6 karakter')
    setSaving(true)
    try {
      const user = await db.users.get(userId)
      if (!user) return
      const oldHash = await hashPassword(oldPass)
      if (user.password_hash !== oldHash) {
        toast.error('Password lama salah'); return
      }
      const newHash = await hashPassword(newPass)
      await db.users.update(userId, { password_hash: newHash })
      await addToSyncQueue('users', userId, 'update', { id: userId, password_hash: newHash }, STORE_ID)
      toast.success('Password berhasil diubah')
      setOld(''); setNew('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card space-y-4">
      <div>
        <label className="text-sm font-medium text-gray-700 mb-1 block">Password Lama</label>
        <input className="input" type="password" value={oldPass} onChange={e => setOld(e.target.value)} />
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700 mb-1 block">Password Baru</label>
        <input className="input" type="password" value={newPass} onChange={e => setNew(e.target.value)} />
      </div>
      <button onClick={handleChange} disabled={saving} className="btn-primary w-full">
        {saving ? 'Menyimpan...' : 'Ganti Password'}
      </button>
    </div>
  )
}
