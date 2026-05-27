// src/pages/settings/SettingsPage.tsx
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now, addToSyncQueue } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { hashPassword } from '@/lib/utils'
import { X, ChevronRight, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import type { User, Role } from '@/types'
import type { Supplier, Partner } from '@/lib/db'

type Tab = 'users' | 'supplier' | 'mitra' | 'password'

export default function SettingsPage() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<Tab>('users')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'users',    label: 'User' },
    { id: 'supplier', label: 'Supplier' },
    { id: 'mitra',    label: 'Mitra' },
    { id: 'password', label: 'Password' },
  ]

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-4 pt-4 pb-0">
        <h1 className="text-lg font-semibold text-gray-900">Pengaturan</h1>
      </div>

      <div className="px-4 mt-3 flex gap-0 border-b border-gray-100">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`pb-2.5 mr-5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto bg-gray-50">
        {tab === 'users'    && <UsersTab currentUser={user!} />}
        {tab === 'supplier' && <SupplierTab />}
        {tab === 'mitra'    && <MitraTab />}
        {tab === 'password' && <ChangePasswordTab userId={user!.id} storeId={user!.store_id} />}
      </div>
    </div>
  )
}

// ── USERS TAB ─────────────────────────────────────────────────
function UsersTab({ currentUser }: { currentUser: User }) {
  const { store } = useAuthStore()
  const [showForm, setShowForm] = useState(false)
  const [editUser, setEdit]     = useState<User | null>(null)

  const users = useLiveQuery(() =>
    db.users.where('store_id').equals(currentUser.store_id).toArray(), [currentUser.store_id])

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">{store?.name || ''}</p>
        {currentUser.role === 'owner' && (
          <button onClick={() => { setEdit(null); setShowForm(true) }}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-900 bg-white border border-gray-200 px-3 py-1.5 rounded-lg">
            <Plus size={14} /> Tambah User
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {users?.map((u, idx) => (
          <button key={u.id} onClick={() => currentUser.role === 'owner' && u.id !== currentUser.id && (setEdit(u), setShowForm(true))}
            className={`w-full flex items-center px-4 py-3 text-left ${idx !== 0 ? 'border-t border-gray-50' : ''} ${currentUser.role === 'owner' ? 'active:bg-gray-50' : ''}`}>
            <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-sm font-semibold text-gray-600 mr-3 flex-shrink-0">
              {u.name[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
              <p className="text-xs text-gray-400">@{u.username} · {u.role}</p>
            </div>
            {!u.is_active && <span className="text-xs text-gray-400 mr-2">nonaktif</span>}
            {currentUser.role === 'owner' && u.id !== currentUser.id && (
              <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
            )}
          </button>
        ))}
        {users?.length === 0 && <div className="py-8 text-center text-sm text-gray-400">Belum ada user</div>}
      </div>

      {showForm && <UserForm user={editUser} storeId={currentUser.store_id} onClose={() => { setShowForm(false); setEdit(null) }} />}
    </div>
  )
}

// ── SUPPLIER TAB ──────────────────────────────────────────────
function SupplierTab() {
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<Supplier | null>(null)

  const suppliers = useLiveQuery(() => db.suppliers.toArray(), [])

  return (
    <div className="p-4 space-y-3">
      <div className="flex justify-end">
        <button onClick={() => { setEditItem(null); setShowForm(true) }}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-900 bg-white border border-gray-200 px-3 py-1.5 rounded-lg">
          <Plus size={14} /> Tambah Supplier
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {suppliers?.map((s, idx) => (
          <button key={s.id} onClick={() => { setEditItem(s); setShowForm(true) }}
            className={`w-full flex items-center px-4 py-3 text-left active:bg-gray-50 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
              <p className="text-xs text-gray-400">{s.phone || '-'} {s.address ? `· ${s.address}` : ''}</p>
            </div>
            {!s.is_active && <span className="text-xs text-gray-400 mr-2">nonaktif</span>}
            <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
          </button>
        ))}
        {suppliers?.length === 0 && <div className="py-8 text-center text-sm text-gray-400">Belum ada supplier</div>}
      </div>

      {showForm && <SupplierForm supplier={editItem} onClose={() => { setShowForm(false); setEditItem(null) }} />}
    </div>
  )
}

// ── MITRA TAB ─────────────────────────────────────────────────
function MitraTab() {
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<Partner | null>(null)

  const partners = useLiveQuery(() => db.partners.toArray(), [])

  return (
    <div className="p-4 space-y-3">
      <div className="flex justify-end">
        <button onClick={() => { setEditItem(null); setShowForm(true) }}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-900 bg-white border border-gray-200 px-3 py-1.5 rounded-lg">
          <Plus size={14} /> Tambah Mitra
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {partners?.map((p, idx) => (
          <button key={p.id} onClick={() => { setEditItem(p); setShowForm(true) }}
            className={`w-full flex items-center px-4 py-3 text-left active:bg-gray-50 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
              <p className="text-xs text-gray-400">{p.city || '-'} {p.contact ? `· ${p.contact}` : ''}</p>
            </div>
            {!p.is_active && <span className="text-xs text-gray-400 mr-2">nonaktif</span>}
            <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
          </button>
        ))}
        {partners?.length === 0 && <div className="py-8 text-center text-sm text-gray-400">Belum ada mitra</div>}
      </div>

      {showForm && <MitraForm partner={editItem} onClose={() => { setShowForm(false); setEditItem(null) }} />}
    </div>
  )
}

// ── PASSWORD TAB ──────────────────────────────────────────────
function ChangePasswordTab({ userId, storeId }: { userId: string; storeId: string }) {
  const [oldPass, setOld]   = useState('')
  const [newPass, setNew]   = useState('')
  const [saving, setSaving] = useState(false)

  async function handleChange() {
    if (!oldPass || !newPass) return toast.error('Semua field wajib diisi')
    if (newPass.length < 4)   return toast.error('Password minimal 4 karakter')
    setSaving(true)
    try {
      const user = await db.users.get(userId)
      if (!user) return
      const oldHash = await hashPassword(oldPass)
      if (user.password_hash !== oldHash) { toast.error('Password lama salah'); return }
      const newHash = await hashPassword(newPass)
      await db.users.update(userId, { password_hash: newHash })
      await supabase.from('users').update({ password_hash: newHash }).eq('id', userId)
      await addToSyncQueue('users', userId, 'update', { id: userId, password_hash: newHash }, storeId)
      toast.success('Password berhasil diubah')
      setOld(''); setNew('')
    } finally { setSaving(false) }
  }

  return (
    <div className="p-4">
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1.5">Password Lama</p>
          <input className="w-full text-sm text-gray-900 outline-none bg-transparent" type="password"
            value={oldPass} onChange={e => setOld(e.target.value)} placeholder="Masukkan password lama" />
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1.5">Password Baru</p>
          <input className="w-full text-sm text-gray-900 outline-none bg-transparent" type="password"
            value={newPass} onChange={e => setNew(e.target.value)} placeholder="Min. 4 karakter" />
        </div>
      </div>
      <button onClick={handleChange} disabled={saving}
        className="w-full mt-3 py-3 bg-gray-900 text-white rounded-xl text-sm font-medium disabled:opacity-50">
        {saving ? 'Menyimpan...' : 'Ganti Password'}
      </button>
    </div>
  )
}

// ── MODAL BASE ────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 rounded-full hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="overflow-auto flex-1 px-5 py-4 space-y-4">{children}</div>
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">{children}</label>
}

function SaveButtons({ onClose, saving }: { onClose: () => void; saving: boolean }) {
  return (
    <div className="flex gap-3 pt-1 border-t border-gray-100">
      <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
      <button type="submit" disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">
        {saving ? 'Menyimpan...' : 'Simpan'}
      </button>
    </div>
  )
}

// ── FORM: User ────────────────────────────────────────────────
function UserForm({ user, onClose, storeId }: { user: User | null; onClose: () => void; storeId: string }) {
  const [name, setName]      = useState(user?.name || '')
  const [username, setUname] = useState(user?.username || '')
  const [password, setPass]  = useState('')
  const [role, setRole]      = useState<Role>(user?.role || 'kasir')
  const [isActive, setActive]= useState(user?.is_active ?? true)
  const [saving, setSaving]  = useState(false)

  async function handleSave() {
    if (!name || !username) return toast.error('Nama dan username wajib diisi')
    if (!user && !password)  return toast.error('Password wajib untuk user baru')
    setSaving(true)
    try {
      const isNew = !user
      const data: User = {
        id: user?.id || generateId(), store_id: storeId,
        name, username,
        password_hash: password ? await hashPassword(password) : user!.password_hash,
        role, is_active: isActive, created_at: user?.created_at || now(),
      }
      await db.users.put(data)
      await supabase.from('users').upsert(data)
      await addToSyncQueue('users', data.id, isNew ? 'insert' : 'update', data, storeId)
      toast.success(isNew ? 'User ditambahkan' : 'User diupdate')
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <Modal title={user ? 'Edit User' : 'Tambah User'} onClose={onClose}>
      <div><Label>Nama</Label><input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
      <div><Label>Username</Label><input className="input" value={username} onChange={e => setUname(e.target.value)} /></div>
      <div>
        <Label>Password {user ? '(kosongkan jika tidak diubah)' : ''}</Label>
        <input className="input" type="password" value={password} onChange={e => setPass(e.target.value)} placeholder={user ? '••••••••' : 'Min. 4 karakter'} />
      </div>
      <div>
        <Label>Role</Label>
        <div className="grid grid-cols-2 gap-2">
          {(['kasir','gudang','produksi','manager'] as Role[]).map(r => (
            <button key={r} onClick={() => setRole(r)}
              className={`py-2 rounded-xl text-sm font-medium border capitalize transition-colors ${
                role === r ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600'
              }`}>{r}</button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between py-2 border-t border-gray-100">
        <p className="text-sm text-gray-700">Aktif</p>
        <button onClick={() => setActive(!isActive)}
          className={`w-11 h-6 rounded-full transition-colors relative ${isActive ? 'bg-gray-900' : 'bg-gray-200'}`}>
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isActive ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>
      <div className="flex gap-3 pt-1 border-t border-gray-100">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
      </div>
    </Modal>
  )
}

// ── FORM: Supplier ────────────────────────────────────────────
function SupplierForm({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }) {
  const [name, setName]       = useState(supplier?.name || '')
  const [phone, setPhone]     = useState(supplier?.phone || '')
  const [address, setAddress] = useState(supplier?.address || '')
  const [isActive, setActive] = useState(supplier?.is_active ?? true)
  const [saving, setSaving]   = useState(false)

  async function handleSave() {
    if (!name.trim()) return toast.error('Nama supplier wajib diisi')
    setSaving(true)
    try {
      const isNew = !supplier
      const data: Supplier = {
        id: supplier?.id || generateId(), name: name.trim(),
        phone: phone || undefined, address: address || undefined,
        is_active: isActive, created_at: supplier?.created_at || now(),
      }
      await db.suppliers.put(data)
      await supabase.from('suppliers').upsert(data)
      toast.success(isNew ? 'Supplier ditambahkan' : 'Supplier diupdate')
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <Modal title={supplier ? 'Edit Supplier' : 'Tambah Supplier'} onClose={onClose}>
      <div><Label>Nama Supplier</Label><input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
      <div><Label>No. Telepon</Label><input className="input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="08xx-xxxx-xxxx" /></div>
      <div><Label>Alamat</Label><input className="input" value={address} onChange={e => setAddress(e.target.value)} placeholder="Opsional" /></div>
      <div className="flex items-center justify-between py-2 border-t border-gray-100">
        <p className="text-sm text-gray-700">Aktif</p>
        <button onClick={() => setActive(!isActive)}
          className={`w-11 h-6 rounded-full transition-colors relative ${isActive ? 'bg-gray-900' : 'bg-gray-200'}`}>
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isActive ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>
      <div className="flex gap-3 pt-1 border-t border-gray-100">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
      </div>
    </Modal>
  )
}

// ── FORM: Mitra ───────────────────────────────────────────────
function MitraForm({ partner, onClose }: { partner: Partner | null; onClose: () => void }) {
  const [name, setName]       = useState(partner?.name || '')
  const [contact, setContact] = useState(partner?.contact || '')
  const [city, setCity]       = useState(partner?.city || '')
  const [address, setAddress] = useState(partner?.address || '')
  const [isActive, setActive] = useState(partner?.is_active ?? true)
  const [saving, setSaving]   = useState(false)

  async function handleSave() {
    if (!name.trim()) return toast.error('Nama mitra wajib diisi')
    setSaving(true)
    try {
      const isNew = !partner
      const data: Partner = {
        id: partner?.id || generateId(), name: name.trim(),
        contact: contact || undefined, city: city || undefined,
        address: address || undefined,
        is_active: isActive, created_at: partner?.created_at || now(),
      }
      await db.partners.put(data)
      await supabase.from('partners').upsert(data)
      toast.success(isNew ? 'Mitra ditambahkan' : 'Mitra diupdate')
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <Modal title={partner ? 'Edit Mitra' : 'Tambah Mitra'} onClose={onClose}>
      <div><Label>Nama Mitra / Franchise</Label><input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Kota</Label><input className="input" value={city} onChange={e => setCity(e.target.value)} placeholder="Surabaya" /></div>
        <div><Label>Kontak</Label><input className="input" type="tel" value={contact} onChange={e => setContact(e.target.value)} placeholder="08xx-xxxx" /></div>
      </div>
      <div><Label>Alamat</Label><input className="input" value={address} onChange={e => setAddress(e.target.value)} placeholder="Opsional" /></div>
      <div className="flex items-center justify-between py-2 border-t border-gray-100">
        <p className="text-sm text-gray-700">Aktif</p>
        <button onClick={() => setActive(!isActive)}
          className={`w-11 h-6 rounded-full transition-colors relative ${isActive ? 'bg-gray-900' : 'bg-gray-200'}`}>
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isActive ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>
      <div className="flex gap-3 pt-1 border-t border-gray-100">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
      </div>
    </Modal>
  )
}
