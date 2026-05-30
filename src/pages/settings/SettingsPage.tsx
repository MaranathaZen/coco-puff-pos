// src/pages/settings/SettingsPage.tsx
// CHANGELOG:
// - Tambah tombol Hapus di supplier, mitra, user (kecuali menu, password, reset)
// - User form: pilih toko jika role kasir/gudang/produksi
// - PPN & Promo sudah per toko (storeId dipass dari user)
// - Tab toko: hapus kode toko, tidak dipakai
// - Accounting dihapus dari kasir (sudah di Layout)

import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now, addToSyncQueue } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { hashPassword } from '@/lib/utils'
import { X, ChevronRight, Plus, Check, Trash2, Tag } from 'lucide-react'
import toast from 'react-hot-toast'
import type { User, Role } from '@/types'
import type { Supplier, Partner, MenuRoleConfig } from '@/lib/db'

type Tab = 'users' | 'supplier' | 'mitra' | 'menu' | 'toko' | 'password' | 'ppn' | 'promo' | 'reset'

const ALL_MENUS = [
  { path: '/kasir',          label: 'Kasir'       },
  { path: '/produk',         label: 'Produk'      },
  { path: '/stok',           label: 'Stok'        },
  { path: '/produksi',       label: 'Produksi'    },
  { path: '/laporan',        label: 'Laporan'     },
  { path: '/laporan-gudang', label: 'Lap. Gudang' },
  { path: '/owner',          label: 'Dashboard'   },
  { path: '/pengaturan',     label: 'Setting'     },
  { path: '/tutup-toko',     label: 'Close Order' },
  { path: '/accounting',     label: 'Accounting'  },
]

const ROLES = ['owner','manager','kasir','gudang','produksi']

export default function SettingsPage() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<Tab>('users')
  const isOwnerManager = user?.role === 'owner' || user?.role === 'manager'

  const tabs: { id: Tab; label: string; ownerOnly?: boolean }[] = [
    { id: 'users',    label: 'User'      },
    { id: 'supplier', label: 'Supplier'  },
    { id: 'mitra',    label: 'Franchise' },
    { id: 'menu',     label: 'Menu',     ownerOnly: true },
    { id: 'toko',     label: 'Toko',     ownerOnly: true },
    { id: 'password', label: 'Password'  },
    { id: 'ppn',      label: 'PPN',      ownerOnly: true },
    { id: 'promo',    label: 'Promo',    ownerOnly: true },
    { id: 'reset',    label: 'Reset',    ownerOnly: true },
  ].filter(t => !t.ownerOnly || isOwnerManager)

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-4 pt-4 pb-0">
        <h1 className="text-lg font-semibold text-gray-900">Pengaturan</h1>
      </div>
      <div className="px-4 mt-3 flex gap-0 border-b border-gray-100 overflow-x-auto scrollbar-hide">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`pb-2.5 mr-5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === t.id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto bg-gray-50">
        {tab === 'users'    && <UsersTab currentUser={user!} />}
        {tab === 'supplier' && <SupplierTab />}
        {tab === 'mitra'    && <MitraTab />}
        {tab === 'menu'     && <MenuConfigTab />}
        {tab === 'toko'     && <TokoTab />}
        {tab === 'password' && <ChangePasswordTab userId={user!.id} storeId={user!.store_id} />}
        {tab === 'ppn'      && <PPNTab storeId={user!.store_id} />}
        {tab === 'promo'    && <PromoTab storeId={user!.store_id} />}
        {tab === 'reset'    && <ResetDataTab />}
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
    db.users.where('store_id').equals(currentUser.store_id).toArray()
  , [currentUser.store_id])

  async function handleDelete(u: User) {
    if (u.id === currentUser.id) return toast.error('Tidak bisa hapus akun sendiri')
    if (!confirm(`Hapus user "${u.name}"?`)) return
    try {
      await supabase.from('users').delete().eq('id', u.id)
      await db.users.delete(u.id)
      toast.success('User dihapus')
    } catch { toast.error('Gagal hapus') }
  }

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
          <div key={u.id} className={`flex items-center px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
            <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-sm font-semibold text-gray-600 mr-3 flex-shrink-0">
              {u.name[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
              <p className="text-xs text-gray-400">@{u.username} · {u.role}</p>
            </div>
            {!u.is_active && <span className="text-xs text-gray-400 mr-2">nonaktif</span>}
            {currentUser.role === 'owner' && u.id !== currentUser.id && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={() => { setEdit(u); setShowForm(true) }}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                  <ChevronRight size={14} />
                </button>
                <button onClick={() => handleDelete(u)}
                  className="p-1.5 text-red-400 hover:text-red-600 rounded-lg">
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        ))}
        {users?.length === 0 && <div className="py-8 text-center text-sm text-gray-400">Belum ada user</div>}
      </div>
      {showForm && <UserForm user={editUser} currentStoreId={currentUser.store_id} onClose={() => { setShowForm(false); setEdit(null) }} />}
    </div>
  )
}

// ── SUPPLIER TAB ──────────────────────────────────────────────
function SupplierTab() {
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<Supplier | null>(null)
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), [])

  async function handleDelete(s: Supplier) {
    if (!confirm(`Hapus supplier "${s.name}"?`)) return
    try {
      await supabase.from('suppliers').delete().eq('id', s.id)
      await db.suppliers.delete(s.id)
      toast.success('Supplier dihapus')
    } catch { toast.error('Gagal hapus') }
  }

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
          <div key={s.id} className={`flex items-center px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
            <button onClick={() => { setEditItem(s); setShowForm(true) }} className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
              <p className="text-xs text-gray-400">{s.phone || '-'}</p>
            </button>
            {!s.is_active && <span className="text-xs text-gray-400 mr-2">nonaktif</span>}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={() => { setEditItem(s); setShowForm(true) }} className="p-1.5 text-gray-400 rounded-lg"><ChevronRight size={14} /></button>
              <button onClick={() => handleDelete(s)} className="p-1.5 text-red-400 rounded-lg"><Trash2 size={14} /></button>
            </div>
          </div>
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

  async function handleDelete(p: Partner) {
    if (!confirm(`Hapus franchise "${p.name}"?`)) return
    try {
      await supabase.from('partners').delete().eq('id', p.id)
      await db.partners.delete(p.id)
      toast.success('Franchise dihapus')
    } catch { toast.error('Gagal hapus') }
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex justify-end">
        <button onClick={() => { setEditItem(null); setShowForm(true) }}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-900 bg-white border border-gray-200 px-3 py-1.5 rounded-lg">
          <Plus size={14} /> Tambah Franchise
        </button>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {partners?.map((p, idx) => (
          <div key={p.id} className={`flex items-center px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
            <button onClick={() => { setEditItem(p); setShowForm(true) }} className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
              <p className="text-xs text-gray-400">{p.city || '-'}</p>
            </button>
            {!p.is_active && <span className="text-xs text-gray-400 mr-2">nonaktif</span>}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={() => { setEditItem(p); setShowForm(true) }} className="p-1.5 text-gray-400 rounded-lg"><ChevronRight size={14} /></button>
              <button onClick={() => handleDelete(p)} className="p-1.5 text-red-400 rounded-lg"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {partners?.length === 0 && <div className="py-8 text-center text-sm text-gray-400">Belum ada franchise</div>}
      </div>
      {showForm && <MitraForm partner={editItem} onClose={() => { setShowForm(false); setEditItem(null) }} />}
    </div>
  )
}

// ── MENU CONFIG TAB ───────────────────────────────────────────
function MenuConfigTab() {
  const [selectedRole, setSelectedRole] = useState('kasir')
  const [saving, setSaving] = useState(false)
  const [visibilityMap, setVisibilityMap] = useState<Record<string, boolean>>({})
  const [loaded, setLoaded] = useState(false)

  async function loadConfigs(role: string) {
    setLoaded(false)
    try {
      const { data } = await supabase.from('menu_role_config').select('*').eq('role', role)
      if (data?.length) await db.menu_role_config.bulkPut(data)
      const configs = await db.menu_role_config.where('role').equals(role).toArray()
      const map: Record<string, boolean> = {}
      for (const c of configs) map[c.menu_path] = c.is_visible
      setVisibilityMap(map)
    } finally { setLoaded(true) }
  }

  useEffect(() => { loadConfigs(selectedRole) }, [selectedRole])

  async function toggleMenu(path: string, label: string) {
    const cur = visibilityMap[path] ?? false
    const nw  = !cur
    setVisibilityMap(prev => ({ ...prev, [path]: nw }))
    setSaving(true)
    try {
      const existing = await db.menu_role_config.where('[role+menu_path]').equals([selectedRole, path]).first()
      if (existing) {
        const updated = { ...existing, is_visible: nw }
        await db.menu_role_config.put(updated)
        await supabase.from('menu_role_config').upsert(updated)
      } else {
        const nc: MenuRoleConfig = { id: `mc-${selectedRole}-${path.replace(/\//g,'')}`, role: selectedRole, menu_path: path, menu_label: label, is_visible: nw, sort_order: ALL_MENUS.findIndex(m => m.path === path) + 1 }
        await db.menu_role_config.put(nc)
        await supabase.from('menu_role_config').upsert(nc)
      }
    } catch {
      setVisibilityMap(prev => ({ ...prev, [path]: cur }))
      toast.error('Gagal menyimpan')
    } finally { setSaving(false) }
  }

  return (
    <div className="p-4 space-y-3">
      <p className="text-xs text-gray-400">Pilih role lalu centang menu yang ingin ditampilkan</p>
      <div className="flex flex-wrap gap-2">
        {ROLES.map(r => (
          <button key={r} onClick={() => setSelectedRole(r)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border capitalize transition-colors ${selectedRole === r ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-600'}`}>{r}</button>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {!loaded ? <div className="py-8 text-center text-sm text-gray-400">Memuat...</div>
          : ALL_MENUS.map((menu, idx) => {
            const visible = visibilityMap[menu.path] ?? false
            return (
              <button key={menu.path} onClick={() => toggleMenu(menu.path, menu.label)} disabled={saving}
                className={`w-full flex items-center px-4 py-3 text-left active:bg-gray-50 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center mr-3 flex-shrink-0 transition-colors ${visible ? 'bg-gray-900 border-gray-900' : 'border-gray-300'}`}>
                  {visible && <Check size={12} className="text-white" strokeWidth={3} />}
                </div>
                <p className="text-sm text-gray-800 flex-1">{menu.label}</p>
                <p className="text-xs text-gray-400">{menu.path}</p>
              </button>
            )
          })}
      </div>
      <p className="text-xs text-gray-400 text-center">Perubahan aktif saat user login ulang</p>
    </div>
  )
}

// ── TOKO TAB ──────────────────────────────────────────────────
function TokoTab() {
  const [stores, setStores]  = useState<any[]>([])
  const [editStore, setEdit] = useState<any|null>(null)
  const [showForm, setForm]  = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('stores').select('*').order('created_at')
      if (data) { setStores(data); await db.stores.bulkPut(data) }
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="p-4 space-y-3">
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? <div className="py-8 text-center text-sm text-gray-400">Memuat...</div>
          : stores.map((s, idx) => (
            <button key={s.id} onClick={() => { setEdit(s); setForm(true) }}
              className={`w-full flex items-center px-4 py-3 text-left active:bg-gray-50 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                <p className="text-xs text-gray-400">{s.city} {s.phone ? `· ${s.phone}` : ''}</p>
              </div>
              {!s.is_active && <span className="text-xs text-gray-400 mr-2">nonaktif</span>}
              <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
            </button>
          ))}
      </div>
      {showForm && editStore && (
        <TokoForm store={editStore} onClose={() => { setForm(false); setEdit(null) }}
          onSaved={updated => { setStores(prev => prev.map(s => s.id === updated.id ? updated : s)); setForm(false) }} />
      )}
    </div>
  )
}

function TokoForm({ store, onClose, onSaved }: { store: any; onClose: () => void; onSaved: (s: any) => void }) {
  const [name, setName]     = useState(store.name || '')
  const [city, setCity]     = useState(store.city || '')
  const [phone, setPhone]   = useState(store.phone || '')
  const [address, setAddr]  = useState(store.address || '')
  const [isActive, setAct]  = useState(store.is_active ?? true)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim()) return toast.error('Nama toko wajib diisi')
    setSaving(true)
    try {
      const updated = { ...store, name: name.trim(), city, phone: phone || null, address: address || null, is_active: isActive }
      await db.stores.put(updated)
      await supabase.from('stores').update({ name: updated.name, city, phone: updated.phone, address: updated.address, is_active: isActive }).eq('id', store.id)
      toast.success('Toko diupdate')
      onSaved(updated)
    } finally { setSaving(false) }
  }

  return (
    <Modal title="Edit Toko" onClose={onClose}>
      <div><Label>Nama Toko</Label><input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
      <div><Label>Kota</Label><input className="input" value={city} onChange={e => setCity(e.target.value)} /></div>
      <div><Label>No. Telepon</Label><input className="input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} /></div>
      <div><Label>Alamat</Label><input className="input" value={address} onChange={e => setAddr(e.target.value)} placeholder="Opsional" /></div>
      <div className="flex items-center justify-between py-2 border-t border-gray-100">
        <p className="text-sm text-gray-700">Aktif</p>
        <button onClick={() => setAct(!isActive)} className={`w-11 h-6 rounded-full transition-colors relative ${isActive ? 'bg-gray-900' : 'bg-gray-200'}`}>
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isActive ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>
      <div className="flex gap-3 pt-1 border-t border-gray-100">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
      </div>
    </Modal>
  )
}

// ── PASSWORD TAB ──────────────────────────────────────────────
function ChangePasswordTab({ userId, storeId }: { userId: string; storeId: string }) {
  const { forceLogout } = useAuthStore()
  const [oldPass, setOld] = useState(''); const [newPass, setNew] = useState(''); const [saving, setSaving] = useState(false)

  async function handleChange() {
    if (!oldPass || !newPass) return toast.error('Semua field wajib diisi')
    if (newPass.length < 4)   return toast.error('Password minimal 4 karakter')
    setSaving(true)
    try {
      const user = await db.users.get(userId); if (!user) return
      if (user.password_hash !== await hashPassword(oldPass)) { toast.error('Password lama salah'); return }
      const newHash = await hashPassword(newPass)
      await db.users.update(userId, { password_hash: newHash })
      await supabase.from('users').update({ password_hash: newHash }).eq('id', userId)
      await addToSyncQueue('users', userId, 'update', { id: userId, password_hash: newHash }, storeId)
      toast.success('Password berhasil diubah. Silakan login ulang.')
      setOld(''); setNew('')
      forceLogout()
    } finally { setSaving(false) }
  }

  return (
    <div className="p-4">
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1.5">Password Lama</p>
          <input className="w-full text-sm text-gray-900 outline-none bg-transparent" type="password" value={oldPass} onChange={e => setOld(e.target.value)} placeholder="Masukkan password lama" />
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1.5">Password Baru</p>
          <input className="w-full text-sm text-gray-900 outline-none bg-transparent" type="password" value={newPass} onChange={e => setNew(e.target.value)} placeholder="Min. 4 karakter" />
        </div>
      </div>
      <button onClick={handleChange} disabled={saving} className="w-full mt-3 py-3 bg-gray-900 text-white rounded-xl text-sm font-medium disabled:opacity-50">{saving ? 'Menyimpan...' : 'Ganti Password'}</button>
      <p className="text-xs text-gray-400 text-center mt-2">Setelah disimpan, Anda akan logout otomatis</p>
    </div>
  )
}

// ── PPN TAB ───────────────────────────────────────────────────
// PPN per toko: storeId sudah di-pass dari user.store_id
function PPNTab({ storeId }: { storeId: string }) {
  const [enabled, setEnabled] = useState(false); const [rate, setRate] = useState('11'); const [mode, setMode] = useState<'include'|'exclude'>('include'); const [saving, setSaving] = useState(false); const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    const saved = localStorage.getItem(`ppn_config_${storeId}`)
    if (saved) { try { const cfg = JSON.parse(saved); setEnabled(cfg.enabled ?? false); setRate(String(cfg.rate ?? 11)); setMode(cfg.mode ?? 'include') } catch {} }
    setLoaded(true)
  }, [storeId])
  async function handleSave() {
    setSaving(true)
    try {
      const cfg = { enabled, rate: Number(rate), mode }
      localStorage.setItem(`ppn_config_${storeId}`, JSON.stringify(cfg))
      await supabase.from('stores').update({ ppn_enabled: enabled, ppn_rate: Number(rate), ppn_mode: mode }).eq('id', storeId)
      toast.success('Setting PPN disimpan')
    } catch { toast.success('Setting PPN disimpan (lokal)') }
    finally { setSaving(false) }
  }
  if (!loaded) return <div className="p-4 text-sm text-gray-400">Memuat...</div>
  return (
    <div className="p-4 space-y-4">
      <p className="text-xs text-gray-400">Setting PPN berlaku untuk toko ini saja.</p>
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-4">
          <div><p className="text-sm font-medium text-gray-900">Aktifkan PPN</p><p className="text-xs text-gray-400 mt-0.5">PPN ditampilkan di struk</p></div>
          <button onClick={() => setEnabled(!enabled)} className={`w-11 h-6 rounded-full transition-colors relative ${enabled ? 'bg-gray-900' : 'bg-gray-200'}`}><div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${enabled ? 'left-[22px]' : 'left-0.5'}`} /></button>
        </div>
      </div>
      {enabled && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1.5">Tarif PPN (%)</p>
            <input className="input w-24 text-lg font-semibold text-center" type="number" min="0" max="100" step="0.5" value={rate} onChange={e => setRate(e.target.value)} />
          </div>
          <div className="px-4 py-3 space-y-2">
            {(['include','exclude'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left ${mode === m ? 'border-gray-900 bg-gray-50' : 'border-gray-100'}`}>
                <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${mode === m ? 'bg-gray-900 border-gray-900' : 'border-gray-300'}`} />
                <div>
                  <p className="text-sm font-medium text-gray-800">{m === 'include' ? 'Include (sudah termasuk)' : 'Exclude (ditambahkan)'}</p>
                  <p className="text-xs text-gray-400">{m === 'include' ? 'Harga sudah include PPN' : 'PPN ditambahkan di atas harga'}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      <button onClick={handleSave} disabled={saving} className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm font-medium disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan Setting PPN'}</button>
    </div>
  )
}

// ── PROMO TAB ─────────────────────────────────────────────────
// Promo per toko: storeId sudah di-pass dari user.store_id
interface PromoItem {
  id: string; store_id: string; product_id: string; name: string
  promo_type: 'percent'|'fixed'|'buy1get1'; value: number; min_qty: number
  valid_from: string; valid_until: string; is_active: boolean; created_at: string
}

function PromoTab({ storeId }: { storeId: string }) {
  const [promos, setPromos]     = useState<PromoItem[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editPromo, setEdit]    = useState<PromoItem|null>(null)

  async function loadPromos() {
    setLoading(true)
    try {
      const { data } = await supabase.from('promotions').select('*').eq('store_id', storeId).order('created_at', { ascending: false })
      if (data) { setPromos(data); await db.promotions.bulkPut(data as any) }
      else { const local = await db.promotions.where('store_id').equals(storeId).toArray(); setPromos(local as any) }
    } catch { const local = await db.promotions.where('store_id').equals(storeId).toArray(); setPromos(local as any) }
    setLoading(false)
  }

  useEffect(() => { loadPromos() }, [storeId])

  async function toggleActive(p: PromoItem) {
    const upd = { ...p, is_active: !p.is_active }
    setPromos(prev => prev.map(x => x.id === p.id ? upd : x))
    await db.promotions.put(upd as any)
    await supabase.from('promotions').update({ is_active: upd.is_active }).eq('id', p.id)
  }

  async function handleDelete(p: PromoItem) {
    if (!confirm(`Hapus promo "${p.name}"?`)) return
    setPromos(prev => prev.filter(x => x.id !== p.id))
    await db.promotions.delete(p.id)
    await supabase.from('promotions').delete().eq('id', p.id)
    toast.success('Promo dihapus')
  }

  const typeLabel = (t: string) => t === 'percent' ? 'Diskon %' : t === 'fixed' ? 'Diskon Nominal' : 'Buy 1 Get 1'
  const now_ = new Date().toISOString()
  const active   = promos.filter(p => p.is_active && p.valid_from <= now_ && p.valid_until >= now_)
  const inactive = promos.filter(p => !p.is_active || p.valid_from > now_ || p.valid_until < now_)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div><p className="text-sm font-medium text-gray-900">Promo & Diskon</p><p className="text-xs text-gray-400">{active.length} aktif · toko ini</p></div>
        <button onClick={() => { setEdit(null); setShowForm(true) }} className="flex items-center gap-1.5 text-sm font-medium text-gray-900 bg-white border border-gray-200 px-3 py-1.5 rounded-lg"><Plus size={14} /> Tambah</button>
      </div>
      {loading ? <div className="bg-white rounded-xl border border-gray-100 py-8 text-center text-sm text-gray-400">Memuat...</div> : (
        <>
          {active.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Aktif Sekarang</p>
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {active.map((p, idx) => <PromoRow key={p.id} promo={p} idx={idx} onToggle={toggleActive} onEdit={pr => { setEdit(pr); setShowForm(true) }} onDelete={handleDelete} typeLabel={typeLabel} />)}
              </div>
            </div>
          )}
          {inactive.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Nonaktif</p>
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden opacity-60">
                {inactive.map((p, idx) => <PromoRow key={p.id} promo={p} idx={idx} onToggle={toggleActive} onEdit={pr => { setEdit(pr); setShowForm(true) }} onDelete={handleDelete} typeLabel={typeLabel} />)}
              </div>
            </div>
          )}
          {promos.length === 0 && <div className="bg-white rounded-xl border border-gray-100 py-12 text-center"><Tag size={32} className="mx-auto text-gray-300 mb-2" /><p className="text-sm text-gray-400">Belum ada promo</p></div>}
        </>
      )}
      {showForm && <PromoForm storeId={storeId} promo={editPromo} onClose={() => { setShowForm(false); setEdit(null) }} onSaved={() => { setShowForm(false); setEdit(null); loadPromos() }} />}
    </div>
  )
}

function PromoRow({ promo, idx, onToggle, onEdit, onDelete, typeLabel }: {
  promo: PromoItem; idx: number; onToggle: (p: PromoItem) => void; onEdit: (p: PromoItem) => void; onDelete: (p: PromoItem) => void; typeLabel: (t: string) => string
}) {
  const until     = new Date(promo.valid_until).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' })
  const valueLabel = promo.promo_type === 'percent' ? `${promo.value}%` : promo.promo_type === 'fixed' ? `Rp ${promo.value.toLocaleString('id-ID')}` : 'Gratis 1'
  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-gray-900 truncate">{promo.name}</p>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${promo.promo_type === 'buy1get1' ? 'bg-purple-100 text-purple-700' : promo.promo_type === 'percent' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>{typeLabel(promo.promo_type)}</span>
        </div>
        <p className="text-xs text-gray-500">{valueLabel} · s/d {until}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button onClick={() => onEdit(promo)} className="p-1.5 text-gray-400 rounded-lg">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
        </button>
        <button onClick={() => onToggle(promo)} className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${promo.is_active ? 'bg-gray-900' : 'bg-gray-200'}`}>
          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${promo.is_active ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
        <button onClick={() => onDelete(promo)} className="p-1.5 text-red-400 rounded-lg"><Trash2 size={14} /></button>
      </div>
    </div>
  )
}

function PromoForm({ storeId, promo, onClose, onSaved }: { storeId: string; promo: PromoItem|null; onClose: () => void; onSaved: () => void }) {
  const products = useLiveQuery(() => db.products.filter(p => p.is_active).toArray(), [])
  const today     = new Date().toISOString().slice(0,10)
  const nextMonth = new Date(Date.now() + 30*86400000).toISOString().slice(0,10)
  const [name,       setName]   = useState(promo?.name || '')
  const [productId,  setProd]   = useState(promo?.product_id || '')
  const [type,       setType]   = useState<'percent'|'fixed'|'buy1get1'>(promo?.promo_type || 'percent')
  const [value,      setValue]  = useState(String(promo?.value || ''))
  const [minQty,     setMinQty] = useState(String(promo?.min_qty || '1'))
  const [from,       setFrom]   = useState(promo?.valid_from?.slice(0,10) || today)
  const [until,      setUntil]  = useState(promo?.valid_until?.slice(0,10) || nextMonth)
  const [isActive,   setActive] = useState(promo?.is_active ?? true)
  const [saving,     setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim()) return toast.error('Nama promo wajib diisi')
    if (!productId)   return toast.error('Pilih produk')
    if (type !== 'buy1get1' && !value) return toast.error('Nilai diskon wajib diisi')
    setSaving(true)
    try {
      const data: PromoItem = { id: promo?.id || generateId(), store_id: storeId, product_id: productId, name: name.trim(), promo_type: type, value: type === 'buy1get1' ? 1 : Number(value), min_qty: Number(minQty) || 1, valid_from: new Date(from).toISOString(), valid_until: new Date(until + 'T23:59:59').toISOString(), is_active: isActive, created_at: promo?.created_at || now() }
      await db.promotions.put(data as any)
      await supabase.from('promotions').upsert(data)
      toast.success(promo ? 'Promo diupdate' : 'Promo ditambahkan')
      onSaved()
    } catch (e) { console.error(e); toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  return (
    <Modal title={promo ? 'Edit Promo' : 'Tambah Promo'} onClose={onClose}>
      <div><Label>Nama Promo</Label><input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
      <div><Label>Produk</Label>
        <select className="input" value={productId} onChange={e => setProd(e.target.value)}>
          <option value="">-- Pilih produk *</option>
          {products?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div><Label>Tipe Promo</Label>
        <div className="grid grid-cols-3 gap-2">
          {([{id:'percent',label:'Diskon %'},{id:'fixed',label:'Disc Nominal'},{id:'buy1get1',label:'Buy 1 Get 1'}] as const).map(t => (
            <button key={t.id} onClick={() => setType(t.id)} className={`py-2 rounded-xl text-xs font-medium border transition-colors ${type === t.id ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600'}`}>{t.label}</button>
          ))}
        </div>
      </div>
      {type !== 'buy1get1' && (
        <div><Label>{type === 'percent' ? 'Diskon (%)' : 'Diskon (Rp)'}</Label>
          <input className="input" inputMode="decimal" value={value} onChange={e => setValue(e.target.value.replace(/[^0-9.]/g,''))} placeholder={type === 'percent' ? '10' : '5000'} />
        </div>
      )}
      <div><Label>Min. Qty</Label><input className="input" inputMode="decimal" value={minQty} onChange={e => setMinQty(e.target.value.replace(/[^0-9]/g,''))} placeholder="1" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Dari</Label><input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><Label>Sampai</Label><input className="input" type="date" value={until} onChange={e => setUntil(e.target.value)} /></div>
      </div>
      <div className="flex items-center justify-between py-2 border-t border-gray-100">
        <p className="text-sm text-gray-700">Aktif</p>
        <button onClick={() => setActive(!isActive)} className={`w-11 h-6 rounded-full transition-colors relative ${isActive ? 'bg-gray-900' : 'bg-gray-200'}`}><div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isActive ? 'left-[22px]' : 'left-0.5'}`} /></button>
      </div>
      <div className="flex gap-3 pt-1 border-t border-gray-100">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
      </div>
    </Modal>
  )
}

// ── RESET TAB ─────────────────────────────────────────────────
function ResetDataTab() {
  const [resetting, setResetting] = useState(false); const [done, setDone] = useState<string[]>([])
  async function resetGudang() {
    setResetting(true); setDone([])
    try {
      setDone(prev => [...prev, 'Menghapus dari server...'])
      await supabase.from('warehouse_mutation_items').delete().gte('created_at','2000-01-01')
      await supabase.from('warehouse_mutations').delete().gte('created_at','2000-01-01')
      await supabase.from('purchase_items').delete().gte('created_at','2000-01-01')
      await supabase.from('purchases').delete().gte('created_at','2000-01-01')
      await supabase.from('warehouse_expenses').delete().gte('created_at','2000-01-01')
      await supabase.from('warehouse_stock').delete().gte('last_updated','2000-01-01')
      await db.warehouse_mutation_items.clear(); await db.warehouse_mutations.clear()
      await db.purchase_items.clear(); await db.purchases.clear()
      await db.warehouse_expenses.clear(); await db.warehouse_stock.clear()
      setDone(prev => [...prev, 'Selesai'])
      toast.success('Data gudang direset')
    } catch (e) { toast.error('Gagal: ' + String(e)) }
    finally { setResetting(false) }
  }
  async function resetProduksi() {
    setResetting(true); setDone([])
    try {
      setDone(prev => [...prev, 'Menghapus dari server...'])
      for (const t of ['production_log_materials','production_logs','production_mutation_items','production_mutations','production_stock','finished_goods_stock']) {
        await supabase.from(t).delete().gte('created_at','2000-01-01')
      }
      await db.production_log_materials.clear(); await db.production_logs.clear()
      await db.production_mutation_items.clear(); await db.production_mutations.clear()
      await db.production_stock.clear(); await db.finished_goods_stock.clear()
      setDone(prev => [...prev, 'Selesai'])
      toast.success('Data produksi direset')
    } catch (e) { toast.error('Gagal: ' + String(e)) }
    finally { setResetting(false) }
  }
  return (
    <div className="p-4 space-y-4">
      <div className="bg-red-50 border border-red-100 rounded-xl p-3">
        <p className="text-sm font-medium text-red-700 mb-1">Hati-hati — Data tidak bisa dikembalikan</p>
        <p className="text-xs text-red-500">Master data (bahan, supplier, resep) tetap aman.</p>
      </div>
      {[{label:'Reset Data Gudang',sub:'Pembelian, mutasi, biaya, stok gudang',fn:resetGudang},{label:'Reset Data Produksi',sub:'Log produksi, stok produksi & produk jadi',fn:resetProduksi}].map(btn => (
        <div key={btn.label} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50"><p className="text-sm font-medium text-gray-900">{btn.label}</p><p className="text-xs text-gray-400 mt-0.5">{btn.sub}</p></div>
          <div className="px-4 py-3"><button onClick={btn.fn} disabled={resetting} className="w-full py-2.5 rounded-xl border border-red-200 text-sm font-medium text-red-600 disabled:opacity-50">{resetting ? 'Mereset...' : btn.label}</button></div>
        </div>
      ))}
      {done.length > 0 && <div className="bg-green-50 border border-green-100 rounded-xl p-3 space-y-1">{done.map((d,i) => <p key={i} className="text-xs text-green-700">✓ {d}</p>)}</div>}
    </div>
  )
}

// ── Shared ─────────────────────────────────────────────────────
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

// ── UserForm — dengan pilih toko untuk kasir/gudang/produksi ──
function UserForm({ user, currentStoreId, onClose }: {
  user: User|null; currentStoreId: string; onClose: () => void
}) {
  const [name,     setName]   = useState(user?.name || '')
  const [username, setUname]  = useState(user?.username || '')
  const [password, setPass]   = useState('')
  const [role,     setRole]   = useState<Role>(user?.role || 'kasir')
  const [storeId,  setStore]  = useState(user?.store_id || currentStoreId)
  const [isActive, setActive] = useState(user?.is_active ?? true)
  const [saving,   setSaving] = useState(false)

  const stores = useLiveQuery(() => db.stores.filter(s => s.is_active).toArray(), [])

  // Role yang perlu pilih toko berbeda
  const needStorePick = ['kasir','gudang','produksi'].includes(role)

  async function handleSave() {
    if (!name || !username) return toast.error('Nama dan username wajib diisi')
    if (!user && !password)  return toast.error('Password wajib untuk user baru')
    setSaving(true)
    try {
      const isNew = !user
      const finalStoreId = needStorePick ? storeId : currentStoreId
      const data: User = {
        id: user?.id || generateId(), store_id: finalStoreId,
        name, username,
        password_hash: password ? await hashPassword(password) : user!.password_hash,
        role, is_active: isActive, created_at: user?.created_at || now(),
      }
      await db.users.put(data)
      await supabase.from('users').upsert(data)
      await addToSyncQueue('users', data.id, isNew ? 'insert' : 'update', data, finalStoreId)
      toast.success(isNew ? 'User ditambahkan' : 'User diupdate')
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <Modal title={user ? 'Edit User' : 'Tambah User'} onClose={onClose}>
      <div><Label>Nama</Label><input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
      <div><Label>Username</Label><input className="input" value={username} onChange={e => setUname(e.target.value)} /></div>
      <div><Label>Password {user ? '(kosongkan jika tidak diubah)' : ''}</Label>
        <input className="input" type="password" value={password} onChange={e => setPass(e.target.value)} placeholder={user ? '••••' : 'Min. 4 karakter'} />
      </div>
      <div><Label>Role</Label>
        <div className="grid grid-cols-2 gap-2">
          {(['kasir','gudang','produksi','manager'] as Role[]).map(r => (
            <button key={r} onClick={() => setRole(r)}
              className={`py-2 rounded-xl text-sm font-medium border capitalize transition-colors ${role === r ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600'}`}>{r}</button>
          ))}
        </div>
      </div>

      {/* Pilih toko — untuk kasir, gudang, produksi */}
      {needStorePick && stores && stores.length > 1 && (
        <div>
          <Label>Toko</Label>
          <select className="input" value={storeId} onChange={e => setStore(e.target.value)}>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name} · {s.city}</option>)}
          </select>
          <p className="text-xs text-gray-400 mt-1">User ini akan login ke toko yang dipilih</p>
        </div>
      )}

      <div className="flex items-center justify-between py-2 border-t border-gray-100">
        <p className="text-sm text-gray-700">Aktif</p>
        <button onClick={() => setActive(!isActive)} className={`w-11 h-6 rounded-full transition-colors relative ${isActive ? 'bg-gray-900' : 'bg-gray-200'}`}>
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isActive ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>
      <div className="flex gap-3 pt-1 border-t border-gray-100">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
      </div>
    </Modal>
  )
}

function SupplierForm({ supplier, onClose }: { supplier: Supplier|null; onClose: () => void }) {
  const [name, setName] = useState(supplier?.name || ''); const [phone, setPhone] = useState(supplier?.phone || ''); const [address, setAddr] = useState(supplier?.address || ''); const [isActive, setActive] = useState(supplier?.is_active ?? true); const [saving, setSaving] = useState(false)
  async function handleSave() {
    if (!name.trim()) return toast.error('Nama wajib diisi')
    setSaving(true)
    try {
      const data: Supplier = { id: supplier?.id || generateId(), name: name.trim(), phone: phone || undefined, address: address || undefined, is_active: isActive, created_at: supplier?.created_at || now() }
      await db.suppliers.put(data); await supabase.from('suppliers').upsert(data)
      toast.success(supplier ? 'Diupdate' : 'Ditambahkan'); onClose()
    } finally { setSaving(false) }
  }
  return (
    <Modal title={supplier ? 'Edit Supplier' : 'Tambah Supplier'} onClose={onClose}>
      <div><Label>Nama Supplier</Label><input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
      <div><Label>No. Telepon</Label><input className="input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} /></div>
      <div><Label>Alamat</Label><input className="input" value={address} onChange={e => setAddr(e.target.value)} placeholder="Opsional" /></div>
      <div className="flex items-center justify-between py-2 border-t border-gray-100">
        <p className="text-sm text-gray-700">Aktif</p>
        <button onClick={() => setActive(!isActive)} className={`w-11 h-6 rounded-full transition-colors relative ${isActive ? 'bg-gray-900' : 'bg-gray-200'}`}><div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isActive ? 'left-[22px]' : 'left-0.5'}`} /></button>
      </div>
      <div className="flex gap-3 pt-1 border-t border-gray-100">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
      </div>
    </Modal>
  )
}

function MitraForm({ partner, onClose }: { partner: Partner|null; onClose: () => void }) {
  const [name, setName] = useState(partner?.name || ''); const [contact, setContact] = useState(partner?.contact || ''); const [city, setCity] = useState(partner?.city || ''); const [address, setAddr] = useState(partner?.address || ''); const [isActive, setActive] = useState(partner?.is_active ?? true); const [saving, setSaving] = useState(false)
  async function handleSave() {
    if (!name.trim()) return toast.error('Nama wajib diisi')
    setSaving(true)
    try {
      const data: Partner = { id: partner?.id || generateId(), name: name.trim(), contact: contact || undefined, city: city || undefined, address: address || undefined, is_active: isActive, created_at: partner?.created_at || now() }
      await db.partners.put(data); await supabase.from('partners').upsert(data)
      toast.success(partner ? 'Diupdate' : 'Ditambahkan'); onClose()
    } finally { setSaving(false) }
  }
  return (
    <Modal title={partner ? 'Edit Mitra' : 'Tambah Franchise'} onClose={onClose}>
      <div><Label>Nama Franchise</Label><input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Kota</Label><input className="input" value={city} onChange={e => setCity(e.target.value)} /></div>
        <div><Label>Kontak</Label><input className="input" type="tel" value={contact} onChange={e => setContact(e.target.value)} /></div>
      </div>
      <div><Label>Alamat</Label><input className="input" value={address} onChange={e => setAddr(e.target.value)} placeholder="Opsional" /></div>
      <div className="flex items-center justify-between py-2 border-t border-gray-100">
        <p className="text-sm text-gray-700">Aktif</p>
        <button onClick={() => setActive(!isActive)} className={`w-11 h-6 rounded-full transition-colors relative ${isActive ? 'bg-gray-900' : 'bg-gray-200'}`}><div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isActive ? 'left-[22px]' : 'left-0.5'}`} /></button>
      </div>
      <div className="flex gap-3 pt-1 border-t border-gray-100">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
      </div>
    </Modal>
  )
}
