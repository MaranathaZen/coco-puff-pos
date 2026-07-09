// src/pages/settings/SettingsPage.tsx
// CHANGELOG v4:
// - Tambah tab "Tampilan" — ganti nama app, logo, icon browser, foto produk

import { useState, useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, now, addToSyncQueue, type Supplier, type Partner, type MenuRoleConfig } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { hashPassword, formatRupiah } from '@/lib/utils'
import { hardResetLocal } from '@/lib/sync-helpers'
import { useAppSettings, type MarkupRule } from '@/hooks/useAppSettings'
import { X, ChevronRight, Plus, Check, Trash2, Tag, Store, Download, AlertTriangle, Upload, RefreshCw, Image, Smartphone, Monitor, Percent } from 'lucide-react'
import toast from 'react-hot-toast'
import type { User, Role } from '@/types'

type Tab = 'users' | 'supplier' | 'mitra' | 'toko' | 'password' | 'ppn' | 'promo' | 'tampilan' | 'markup' | 'reset' | 'tutup_tahun' | 'sistem'

// Tipe mutasi yang bisa dikasih markup
const MUT_TYPE_LABELS: Record<string, string> = {
  to_partner:    'Ke Franchise',
  to_store:      'Ke Toko',
  to_production: 'Ke Produksi',
  internal_use:  'Pemakaian Internal',
  adjustment:    'Penyesuaian',
}

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
  const isOwner        = user?.role === 'owner'
  const isOwnerManager = user?.role === 'owner' || user?.role === 'manager'
  if (!user) return null

  const tabs: { id: Tab; label: string; ownerOnly?: boolean; ownerStrict?: boolean }[] = [
    { id: 'users' as const,       label: 'User'        },
    { id: 'supplier' as const,    label: 'Supplier'    },
    { id: 'mitra' as const,       label: 'Franchise'   },
    { id: 'toko' as const,        label: 'Toko',        ownerOnly: true },
    { id: 'password' as const,    label: 'Password'    },
    { id: 'ppn' as const,         label: 'PPN',         ownerOnly: true },
    { id: 'promo' as const,       label: 'Promo',       ownerOnly: true },
    { id: 'tampilan' as const,    label: 'Tampilan',    ownerOnly: true },
    { id: 'markup' as const,      label: 'Markup',      ownerOnly: true },
    { id: 'tutup_tahun' as const, label: 'Tutup Tahun', ownerOnly: true },
    { id: 'reset' as const,       label: 'Reset',       ownerOnly: true },
    { id: 'sistem' as const,      label: 'Sistem',      ownerStrict: true },
  ].filter(t => (!t.ownerOnly || isOwnerManager) && (!t.ownerStrict || isOwner))

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
        {tab === 'users'       && <UsersTab currentUser={user!} />}
        {tab === 'supplier'    && <SupplierTab />}
        {tab === 'mitra'       && <MitraTab />}
        {tab === 'toko'        && <TokoTab currentUser={user!} />}
        {tab === 'password'    && <ChangePasswordTab userId={user!.id} storeId={user!.store_id} />}
        {tab === 'ppn'         && <PPNTab currentUser={user!} />}
        {tab === 'promo'       && <PromoTab currentUser={user!} />}
        {tab === 'tampilan'    && <TampilanTab />}
        {tab === 'markup'      && <MarkupTab />}
        {tab === 'tutup_tahun' && <TutupTahunTab currentUser={user!} />}
        {tab === 'reset'       && <ResetDataTab />}
        {tab === 'sistem'      && <SistemTab />}
      </div>
    </div>
  )
}


// ── UPLOAD HELPERS ────────────────────────────────────────────
async function uploadToStorage(file: File, path: string): Promise<string | null> {
  try {
    const ext  = file.name.split('.').pop() || 'png'
    const name = `${path}-${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from('app-assets')
      .upload(name, file, { upsert: true, contentType: file.type })
    if (error) throw error
    const { data } = supabase.storage.from('app-assets').getPublicUrl(name)
    return data.publicUrl
  } catch (e) { console.error('[UPLOAD]', e); return null }
}

async function uploadProductImage(file: File, productId: string): Promise<string | null> {
  try {
    const ext  = file.name.split('.').pop() || 'jpg'
    const name = `products/${productId}.${ext}`
    const { error } = await supabase.storage
      .from('app-assets')
      .upload(name, file, { upsert: true, contentType: file.type })
    if (error) throw error
    const { data } = supabase.storage.from('app-assets').getPublicUrl(name)
    return data.publicUrl
  } catch (e) { console.error('[UPLOAD PRODUCT]', e); return null }
}

function UploadBox({ label, hint, currentUrl, onUpload, loading }: {
  label: string; hint: string; currentUrl: string | null
  onUpload: (file: File) => Promise<any>; loading: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-100 p-3 space-y-2">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-xl border border-gray-200 flex items-center justify-center overflow-hidden bg-white flex-shrink-0">
          {currentUrl ? <img src={currentUrl} alt="preview" className="w-full h-full object-cover" /> : <Image size={20} className="text-gray-300" />}
        </div>
        <div className="flex-1 space-y-1.5">
          <input ref={ref} type="file" accept="image/*" className="hidden"
            onChange={async e => { const file = e.target.files?.[0]; if (file) await onUpload(file); if (ref.current) ref.current.value = '' }} />
          <button onClick={() => ref.current?.click()} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">
            {loading ? <RefreshCw size={12} className="animate-spin" /> : <Upload size={12} />}
            {loading ? 'Mengupload...' : 'Pilih Gambar'}
          </button>
          {currentUrl && <p className="text-xs text-green-600 flex items-center gap-1"><Check size={10} /> Sudah diatur</p>}
        </div>
      </div>
    </div>
  )
}

// ── TAMPILAN TAB ──────────────────────────────────────────────
function TampilanTab() {
  const { settings, refresh } = useAppSettings()
  const [appName,       setAppName]       = useState('')
  const [savingName,    setSavingName]    = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingIcon, setUploadingIcon] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [uploadingProduct, setUploadingProduct] = useState<string | null>(null)

  useEffect(() => { setAppName(settings.app_name) }, [settings.app_name])

  const products = useLiveQuery(async () => {
    const all = await db.products.filter(p => p.is_active).toArray()
    if (!productSearch) return all
    return all.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()))
  }, [productSearch])

  async function handleSaveName() {
    if (!appName.trim()) return toast.error('Nama app tidak boleh kosong')
    setSavingName(true)
    try {
      await supabase.from('app_settings').update({ app_name: appName.trim(), updated_at: new Date().toISOString() }).eq('id', 'default')
      await refresh(); document.title = appName.trim()
      toast.success('Nama app diperbarui')
    } catch { toast.error('Gagal menyimpan') }
    finally { setSavingName(false) }
  }

  async function handleUploadLogo(file: File) {
    setUploadingLogo(true)
    try {
      const url = await uploadToStorage(file, 'logo')
      if (!url) return toast.error('Gagal upload logo')
      await supabase.from('app_settings').update({ app_logo_url: url, updated_at: new Date().toISOString() }).eq('id', 'default')
      await refresh(); toast.success('Logo diperbarui')
    } catch { toast.error('Gagal upload logo') }
    finally { setUploadingLogo(false) }
  }

  async function handleUploadIcon(file: File) {
    setUploadingIcon(true)
    try {
      const url = await uploadToStorage(file, 'icon')
      if (!url) return toast.error('Gagal upload icon')
      await supabase.from('app_settings').update({ app_icon_url: url, updated_at: new Date().toISOString() }).eq('id', 'default')
      await refresh()
      let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
      if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
      link.href = url
      toast.success('Icon browser diperbarui')
    } catch { toast.error('Gagal upload icon') }
    finally { setUploadingIcon(false) }
  }

  async function handleUploadProductImage(file: File, productId: string) {
    setUploadingProduct(productId)
    try {
      const url = await uploadProductImage(file, productId)
      if (!url) return toast.error('Gagal upload foto produk')
      await supabase.from('products').update({ image_url: url }).eq('id', productId)
      await db.products.update(productId, { image_url: url } as any)
      toast.success('Foto produk diperbarui')
    } catch { toast.error('Gagal upload foto produk') }
    finally { setUploadingProduct(null) }
  }

  async function handleRemoveProductImage(productId: string) {
    try {
      await supabase.from('products').update({ image_url: null }).eq('id', productId)
      await db.products.update(productId, { image_url: null } as any)
      toast.success('Foto dihapus')
    } catch { toast.error('Gagal menghapus foto') }
  }

  return (
    <div className="p-4 space-y-5">

      {/* Identitas App */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Monitor size={13} className="text-gray-400" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Identitas App</p>
        </div>

        {/* Nama */}
        <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
          <p className="text-sm font-medium text-gray-900">Nama Aplikasi</p>
          <div className="flex gap-2">
            <input className="input flex-1" value={appName} onChange={e => setAppName(e.target.value)} placeholder="Coco Puff POS" />
            <button onClick={handleSaveName} disabled={savingName || appName === settings.app_name}
              className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-40">
              {savingName ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
          <p className="text-xs text-gray-400">Tampil di halaman login, sidebar, dan tab browser</p>
        </div>

        {/* Logo */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <UploadBox label="Logo Aplikasi" hint="Tampil di login & sidebar. Ideal: 128×128px"
            currentUrl={settings.app_logo_url} onUpload={handleUploadLogo} loading={uploadingLogo} />
        </div>

        {/* Icon */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <UploadBox label="Icon Browser (Favicon)" hint="Tampil di tab browser. Gunakan PNG 32×32px atau 64×64px"
            currentUrl={settings.app_icon_url} onUpload={handleUploadIcon} loading={uploadingIcon} />
        </div>

        {(settings.app_logo_url || settings.app_icon_url) && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
            <p className="text-xs text-blue-700">💡 Aktif setelah hard refresh (Ctrl+Shift+R)</p>
          </div>
        )}
      </div>

      {/* Foto Produk */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Smartphone size={13} className="text-gray-400" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Foto Produk</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
          <p className="text-xs text-gray-400">Foto tampil di halaman kasir saat memilih produk</p>
          <input className="input" placeholder="Cari nama produk..." value={productSearch} onChange={e => setProductSearch(e.target.value)} />
          <div className="space-y-1">
            {products?.map(product => {
              const imgUrl = (product as any).image_url as string | null
              const isUploading = uploadingProduct === product.id
              return (
                <ProductImageRow key={product.id} product={product} imgUrl={imgUrl} isUploading={isUploading}
                  onUpload={file => handleUploadProductImage(file, product.id)}
                  onRemove={() => handleRemoveProductImage(product.id)} />
              )
            })}
            {products?.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Produk tidak ditemukan</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

function ProductImageRow({ product, imgUrl, isUploading, onUpload, onRemove }: {
  product: any; imgUrl: string | null; isUploading: boolean
  onUpload: (file: File) => Promise<void>; onRemove: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
      <div className="w-10 h-10 rounded-lg border border-gray-200 overflow-hidden bg-gray-50 flex-shrink-0 flex items-center justify-center">
        {imgUrl ? <img src={imgUrl} alt={product.name} className="w-full h-full object-cover" /> : <Image size={14} className="text-gray-300" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={async e => { const file = e.target.files?.[0]; if (file) await onUpload(file); if (fileRef.current) fileRef.current.value = '' }} />
        <button onClick={() => fileRef.current?.click()} disabled={isUploading}
          className="text-xs text-blue-600 border border-blue-200 px-2 py-1 rounded-lg hover:bg-blue-50 disabled:opacity-50 flex items-center gap-1">
          {isUploading ? <><RefreshCw size={10} className="animate-spin" /> Upload...</> : <><Upload size={10} /> {imgUrl ? 'Ganti' : 'Upload'}</>}
        </button>
        {imgUrl && !isUploading && (
          <button onClick={onRemove} className="text-xs text-red-400 border border-red-200 p-1 rounded-lg hover:bg-red-50">
            <X size={10} />
          </button>
        )}
      </div>
    </div>
  )
}


// ── MARKUP TAB ────────────────────────────────────────────────
function MarkupTab() {
  const { settings, refresh } = useAppSettings()
  const [rules,  setRules]  = useState<MarkupRule[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => { setRules(settings.markup_rules || []) }, [settings.markup_rules])

  function updateRule(i: number, patch: Partial<MarkupRule>) {
    setRules(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }
  function addRule() {
    const used = new Set(rules.map(r => r.mutation_type))
    const next = Object.keys(MUT_TYPE_LABELS).find(t => !used.has(t)) || 'to_partner'
    setRules(prev => [...prev, { mutation_type: next, percent: 0, enabled: true }])
  }
  function removeRule(i: number) { setRules(prev => prev.filter((_, idx) => idx !== i)) }

  async function handleSave() {
    setSaving(true)
    try {
      const clean = rules
        .filter(r => r.mutation_type)
        .map(r => ({ mutation_type: r.mutation_type, percent: Number(r.percent) || 0, enabled: !!r.enabled }))
      const { error } = await supabase.from('app_settings')
        .update({ markup_rules: clean, updated_at: new Date().toISOString() })
        .eq('id', 'default')
      if (error) throw error
      await refresh()
      toast.success('Markup mutasi disimpan')
    } catch (e) {
      console.error('[SaveMarkup]', e)
      toast.error('Gagal menyimpan markup')
    }
    finally { setSaving(false) }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Percent size={13} className="text-gray-400" />
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Markup Mutasi</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <p className="text-xs text-gray-400">
          Tambahan persen di atas HPP saat mutasi ke tujuan tertentu (mis. ke Franchise +15%).
          Berlaku untuk semua role yang mengirim tipe itu (gudang & produksi).
        </p>

        {rules.length === 0 && <p className="text-sm text-gray-400 text-center py-3">Belum ada aturan markup</p>}

        {rules.map((r, i) => {
          const usedTypes = new Set(rules.filter((_, idx) => idx !== i).map(x => x.mutation_type))
          return (
            <div key={i} className="flex items-center gap-2">
              <select className="input text-sm flex-1" value={r.mutation_type}
                onChange={e => updateRule(i, { mutation_type: e.target.value })}>
                {Object.entries(MUT_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val} disabled={usedTypes.has(val)}>{label}</option>
                ))}
              </select>
              <div className="flex items-center gap-1 w-24 flex-shrink-0">
                <input className="input text-sm w-full text-right" inputMode="decimal" value={r.percent}
                  onChange={e => updateRule(i, { percent: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 })} />
                <span className="text-sm text-gray-400">%</span>
              </div>
              <button onClick={() => updateRule(i, { enabled: !r.enabled })}
                className={`text-xs px-2 py-1.5 rounded-lg border flex-shrink-0 ${r.enabled ? 'border-green-200 text-green-600 bg-green-50' : 'border-gray-200 text-gray-400'}`}>
                {r.enabled ? 'Aktif' : 'Off'}
              </button>
              <button onClick={() => removeRule(i)}
                className="text-red-400 border border-red-200 p-1.5 rounded-lg hover:bg-red-50 flex-shrink-0">
                <Trash2 size={13} />
              </button>
            </div>
          )
        })}

        <div className="flex items-center justify-between pt-1">
          <button onClick={addRule} disabled={rules.length >= Object.keys(MUT_TYPE_LABELS).length}
            className="flex items-center gap-1 text-sm text-blue-600 disabled:opacity-40">
            <Plus size={14} /> Tambah aturan
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-40">
            {saving ? 'Menyimpan...' : 'Simpan Markup'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── USERS TAB ─────────────────────────────────────────────────
function UsersTab({ currentUser }: { currentUser: User }) {
  const isOwner  = currentUser.role === 'owner'
  const [showForm,    setShowForm]    = useState(false)
  const [editUser,    setEdit]        = useState<User | null>(null)
  const [filterStore, setFilterStore] = useState('semua')

  const stores = useLiveQuery(() => db.stores.filter(s => s.is_active).toArray(), [])

  const users = useLiveQuery(async () => {
    if (isOwner) {
      const storeIds = new Set((stores || []).map(s => s.id))
      const all = await db.users.toArray()
      return all.filter(u => storeIds.has(u.store_id) || isOwner).sort((a, b) => a.name.localeCompare(b.name))
    }
    return db.users.where('store_id').equals(currentUser.store_id).toArray()
  }, [isOwner, currentUser.store_id, stores])

  const storeMap = Object.fromEntries((stores||[]).map(s => [s.id, s.name]))
  const filtered = users?.filter(u => filterStore === 'semua' || u.store_id === filterStore) ?? []

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
        <p className="text-xs text-gray-400">{filtered.length} user</p>
        {isOwner && (
          <button onClick={() => { setEdit(null); setShowForm(true) }}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-900 bg-white border border-gray-200 px-3 py-1.5 rounded-lg">
            <Plus size={14} /> Tambah User
          </button>
        )}
      </div>
      {isOwner && stores && stores.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          <button onClick={() => setFilterStore('semua')}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterStore==='semua' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
            Semua
          </button>
          {(stores || []).filter(s => s.id.includes('gudang') || s.id.includes('produksi')).map(s => (
            <button key={s.id} onClick={() => setFilterStore(s.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterStore===s.id ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
              {s.name.replace(' Malang','').replace(' Bali','')}
            </button>
          ))}
          {(stores || []).filter(s => !s.id.includes('gudang') && !s.id.includes('produksi')).map(s => (
            <button key={s.id} onClick={() => setFilterStore(s.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterStore===s.id ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
              {s.name.replace(' Malang','').replace(' Bali','')}
            </button>
          ))}
        </div>
      )}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {filtered.map((u, idx) => (
          <div key={u.id} className={`flex items-center px-4 py-3 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
            <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-sm font-semibold text-gray-600 mr-3 flex-shrink-0">
              {u.name[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
              <p className="text-xs text-gray-400">
                @{u.username} · {u.role}
                {isOwner && storeMap[u.store_id] && !['owner','manager'].includes(u.role) && (
                  <span className="ml-1 text-gray-300">· {storeMap[u.store_id]}</span>
                )}
              </p>
            </div>
            {!u.is_active && <span className="text-xs text-gray-400 mr-2">nonaktif</span>}
            {isOwner && u.id !== currentUser.id && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={() => { setEdit(u); setShowForm(true) }} className="p-1.5 text-gray-400 rounded-lg"><ChevronRight size={14} /></button>
                <button onClick={() => handleDelete(u)} className="p-1.5 text-red-400 rounded-lg"><Trash2 size={14} /></button>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <div className="py-8 text-center text-sm text-gray-400">Belum ada user</div>}
      </div>
      {showForm && (
        <UserForm user={editUser} currentUser={currentUser} stores={stores || []}
          onClose={() => { setShowForm(false); setEdit(null) }} />
      )}
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

// ── TOKO TAB ──────────────────────────────────────────────────
function TokoTab({ currentUser }: { currentUser: User }) {
  const [stores,    setStores]  = useState<any[]>([])
  const [editStore, setEdit]    = useState<any|null>(null)
  const [showForm,  setForm]    = useState(false)
  const [isNew,     setIsNew]   = useState(false)
  const [loading,   setLoading] = useState(true)
  const region = 'malang'

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('stores').select('*').order('created_at')
      if (data) {
        setStores(data.filter((s: any) => !s.is_virtual))
        await db.stores.bulkPut(data)
      }
      setLoading(false)
    }
    load()
  }, [region])

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">Region: {region}</p>
        <button onClick={() => { setEdit(null); setIsNew(true); setForm(true) }}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-900 bg-white border border-gray-200 px-3 py-1.5 rounded-lg">
          <Plus size={14} /> Toko Baru
        </button>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? <div className="py-8 text-center text-sm text-gray-400">Memuat...</div>
          : stores.map((s, idx) => (
            <button key={s.id} onClick={() => { setEdit(s); setIsNew(false); setForm(true) }}
              className={`w-full flex items-center px-4 py-3 text-left active:bg-gray-50 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                <p className="text-xs text-gray-400">{s.city}{s.phone ? ` · ${s.phone}` : ''}</p>
              </div>
              {!s.is_active && <span className="text-xs text-gray-400 mr-2">nonaktif</span>}
              <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
            </button>
          ))}
        {!loading && stores.length === 0 && <div className="py-8 text-center text-sm text-gray-400">Belum ada toko</div>}
      </div>
      {showForm && (
        <TokoForm store={editStore} isNew={isNew} region={region}
          onClose={() => { setForm(false); setEdit(null) }}
          onSaved={updated => {
            if (isNew) setStores(prev => [...prev, updated])
            else setStores(prev => prev.map(s => s.id === updated.id ? updated : s))
            setForm(false)
          }} />
      )}
    </div>
  )
}

function TokoForm({ store, isNew, region, onClose, onSaved }: {
  store: any; isNew: boolean; region: string; onClose: () => void; onSaved: (s: any) => void
}) {
  const [name,setName]=useState(store?.name||'');const [city,setCity]=useState(store?.city||'');const [phone,setPhone]=useState(store?.phone||'');const [address,setAddr]=useState(store?.address||'');const [isActive,setAct]=useState(store?.is_active??true);const [saving,setSaving]=useState(false)
  async function handleSave() {
    if (!name.trim()) return toast.error('Nama toko wajib diisi')
    if (!city.trim()) return toast.error('Kota wajib diisi')
    setSaving(true)
    try {
      if (isNew) {
        const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
        const newStore = { id: `store-${slug}-${Date.now().toString(36)}`, name: name.trim(), city, phone: phone||null, address: address||null, is_active: isActive, region, created_at: now() }
        await db.stores.add(newStore)
        const { error } = await supabase.from('stores').insert(newStore)
        if (error) throw error
        toast.success(`Toko "${name}" ditambahkan`); onSaved(newStore)
      } else {
        const updated = { ...store, name: name.trim(), city, phone: phone||null, address: address||null, is_active: isActive }
        await db.stores.put(updated)
        await supabase.from('stores').update({ name: updated.name, city, phone: updated.phone, address: updated.address, is_active: isActive }).eq('id', store.id)
        toast.success('Toko diupdate'); onSaved(updated)
      }
    } catch (e) { toast.error('Gagal: ' + String((e as any)?.message || e)) }
    finally { setSaving(false) }
  }
  return (
    <Modal title={isNew ? 'Tambah Toko Baru' : 'Edit Toko'} onClose={onClose}>
      <div><Label required>Nama Toko</Label><input className="input" value={name} onChange={e=>setName(e.target.value)} autoFocus /></div>
      <div><Label required>Kota</Label><input className="input" value={city} onChange={e=>setCity(e.target.value)} /></div>
      <div><Label required>No. Telepon</Label><input className="input" type="tel" value={phone} onChange={e=>setPhone(e.target.value)} /></div>
      <div><Label>Alamat</Label><input className="input" value={address} onChange={e=>setAddr(e.target.value)} placeholder="Opsional" /></div>
      <div className="bg-gray-50 rounded-xl p-3">
        <p className="text-xs text-gray-500">Region: <span className="font-medium text-gray-700">{region}</span></p>
      </div>
      <div className="flex items-center justify-between py-2 border-t border-gray-100">
        <p className="text-sm text-gray-700">Aktif</p>
        <button onClick={()=>setAct(!isActive)} className={`w-11 h-6 rounded-full transition-colors relative ${isActive?'bg-gray-900':'bg-gray-200'}`}>
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isActive?'left-[22px]':'left-0.5'}`} />
        </button>
      </div>
      <div className="flex gap-3 pt-1 border-t border-gray-100">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving?'Menyimpan...':'Simpan'}</button>
      </div>
    </Modal>
  )
}

// ── PASSWORD TAB ──────────────────────────────────────────────
function ChangePasswordTab({ userId, storeId }: { userId: string; storeId: string }) {
  const { forceLogout } = useAuthStore()
  const [oldPass,setOld]=useState('');const [newPass,setNew]=useState('');const [saving,setSaving]=useState(false)
  async function handleChange() {
    if (!oldPass||!newPass) return toast.error('Semua field wajib diisi')
    if (newPass.length<4) return toast.error('Password minimal 4 karakter')
    setSaving(true)
    try {
      const user = await db.users.get(userId); if (!user) return
      if (user.password_hash !== await hashPassword(oldPass)) { toast.error('Password lama salah'); return }
      const newHash = await hashPassword(newPass)
      await db.users.update(userId, { password_hash: newHash })
      await supabase.from('users').update({ password_hash: newHash }).eq('id', userId)
      await addToSyncQueue('users', userId, 'update', { id: userId, password_hash: newHash }, storeId)
      toast.success('Password berhasil diubah. Silakan login ulang.')
      setOld(''); setNew(''); forceLogout()
    } finally { setSaving(false) }
  }
  return (
    <div className="p-4">
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1.5">Password Lama</p>
          <input className="w-full text-sm text-gray-900 outline-none bg-transparent" type="password" value={oldPass} onChange={e=>setOld(e.target.value)} placeholder="Masukkan password lama" />
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1.5">Password Baru</p>
          <input className="w-full text-sm text-gray-900 outline-none bg-transparent" type="password" value={newPass} onChange={e=>setNew(e.target.value)} placeholder="Min. 4 karakter" />
        </div>
      </div>
      <button onClick={handleChange} disabled={saving} className="w-full mt-3 py-3 bg-gray-900 text-white rounded-xl text-sm font-medium disabled:opacity-50">{saving?'Menyimpan...':'Ganti Password'}</button>
      <p className="text-xs text-gray-400 text-center mt-2">Setelah disimpan, Anda akan logout otomatis</p>
    </div>
  )
}

// ── PPN TAB ───────────────────────────────────────────────────
function PPNTab({ currentUser }: { currentUser: User }) {
  const isOwner=currentUser.role==='owner'
  const stores=useLiveQuery(()=>db.stores.filter(s=>s.is_active&&!(s as any).is_virtual).toArray(),[])
  const [selectedStoreId,setSelectedStoreId]=useState(currentUser.store_id)
  const [enabled,setEnabled]=useState(false);const [rate,setRate]=useState('11');const [mode,setMode]=useState<'include'|'exclude'>('include');const [saving,setSaving]=useState(false);const [loaded,setLoaded]=useState(false)
  useEffect(()=>{
    setLoaded(false)
    Promise.resolve(supabase.from('stores').select('ppn_enabled, ppn_rate, ppn_mode').eq('id',selectedStoreId).single())
      .then(({data})=>{
        if(data&&data.ppn_rate>0){setEnabled(data.ppn_enabled??false);setRate(String(data.ppn_rate??11));setMode(data.ppn_mode??'include')}
        else{const saved=localStorage.getItem(`ppn_config_${selectedStoreId}`);if(saved){try{const cfg=JSON.parse(saved);setEnabled(cfg.enabled??false);setRate(String(cfg.rate??11));setMode(cfg.mode??'include')}catch{}}}
        setLoaded(true)
      }).catch(()=>{const saved=localStorage.getItem(`ppn_config_${selectedStoreId}`);if(saved){try{const cfg=JSON.parse(saved);setEnabled(cfg.enabled??false);setRate(String(cfg.rate??11));setMode(cfg.mode??'include')}catch{}}setLoaded(true)})
  },[selectedStoreId])
  async function handleSave(){setSaving(true);try{const cfg={enabled,rate:Number(rate),mode};localStorage.setItem(`ppn_config_${selectedStoreId}`,JSON.stringify(cfg));await supabase.from('stores').update({ppn_enabled:enabled,ppn_rate:Number(rate),ppn_mode:mode}).eq('id',selectedStoreId);toast.success('Setting PPN disimpan')}catch{toast.success('Setting PPN disimpan (lokal)')}finally{setSaving(false)}}
  return (
    <div className="p-4 space-y-4">
      {isOwner&&stores&&stores.length>1&&(<div className="bg-white rounded-xl border border-gray-100 overflow-hidden"><div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2"><Store size={14} className="text-gray-400"/><p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pilih Toko</p></div><div className="flex gap-1.5 p-3 overflow-x-auto scrollbar-hide">{stores.map(s=>(<button key={s.id} onClick={()=>setSelectedStoreId(s.id)} className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${selectedStoreId===s.id?'bg-gray-900 text-white':'bg-gray-100 text-gray-600'}`}>{s.name}</button>))}</div></div>)}
      {!loaded?<div className="text-sm text-gray-400 text-center py-4">Memuat...</div>:(
        <><div className="bg-white rounded-xl border border-gray-100 overflow-hidden"><div className="flex items-center justify-between px-4 py-4"><div><p className="text-sm font-medium text-gray-900">Aktifkan PPN</p><p className="text-xs text-gray-400 mt-0.5">PPN ditampilkan di struk</p></div><button onClick={()=>setEnabled(!enabled)} className={`w-11 h-6 rounded-full transition-colors relative ${enabled?'bg-gray-900':'bg-gray-200'}`}><div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${enabled?'left-[22px]':'left-0.5'}`}/></button></div></div>
        {enabled&&(<div className="bg-white rounded-xl border border-gray-100 overflow-hidden"><div className="px-4 py-3 border-b border-gray-50"><p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1.5">Tarif PPN (%)</p><input className="input w-24 text-lg font-semibold text-center" type="number" min="0" max="100" step="0.01" value={rate} onChange={e=>setRate(e.target.value)}/></div><div className="px-4 py-3 space-y-2">{(['include','exclude'] as const).map(m=>(<button key={m} onClick={()=>setMode(m)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left ${mode===m?'border-gray-900 bg-gray-50':'border-gray-100'}`}><div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${mode===m?'bg-gray-900 border-gray-900':'border-gray-300'}`}/><div><p className="text-sm font-medium text-gray-800">{m==='include'?'Include (sudah termasuk)':'Exclude (ditambahkan)'}</p><p className="text-xs text-gray-400">{m==='include'?'Harga sudah include PPN':'PPN ditambahkan di atas harga'}</p></div></button>))}</div></div>)}
        <button onClick={handleSave} disabled={saving} className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm font-medium disabled:opacity-50">{saving?'Menyimpan...':'Simpan Setting PPN'}</button></>
      )}
    </div>
  )
}

// ── PROMO TAB (simplified) ────────────────────────────────────
interface PromoItem {
  id: string; store_id: string; product_id: string; name: string
  promo_type: 'percent'|'fixed'|'buy1get1'; value: number; min_qty: number
  valid_from: string; valid_until: string; is_active: boolean; created_at: string
}

function PromoTab({ currentUser }: { currentUser: User }) {
  const isOwner=currentUser.role==='owner'
  const stores=useLiveQuery(()=>db.stores.filter(s=>s.is_active&&!(s as any).is_virtual).toArray(),[])
  const [selectedStoreId,setSelectedStoreId]=useState(currentUser.store_id)
  const [promos,setPromos]=useState<PromoItem[]>([]);const [loading,setLoading]=useState(true);const [showForm,setShowForm]=useState(false);const [editPromo,setEdit]=useState<PromoItem|null>(null)
  async function loadPromos(storeId: string){setLoading(true);try{const{data}=await supabase.from('promotions').select('*').eq('store_id',storeId).order('created_at',{ascending:false});if(data){setPromos(data);await db.promotions.bulkPut(data as any)}else{const local=await db.promotions.where('store_id').equals(storeId).toArray();setPromos(local as any)}}catch{const local=await db.promotions.where('store_id').equals(storeId).toArray();setPromos(local as any)}setLoading(false)}
  useEffect(()=>{loadPromos(selectedStoreId)},[selectedStoreId])
  async function toggleActive(p: PromoItem){const upd={...p,is_active:!p.is_active};setPromos(prev=>prev.map(x=>x.id===p.id?upd:x));await db.promotions.put(upd as any);await supabase.from('promotions').update({is_active:upd.is_active}).eq('id',p.id)}
  async function handleDelete(p: PromoItem){if(!confirm(`Hapus promo "${p.name}"?`))return;setPromos(prev=>prev.filter(x=>x.id!==p.id));await db.promotions.delete(p.id);await supabase.from('promotions').delete().eq('id',p.id);toast.success('Promo dihapus')}
  const typeLabel=(t:string)=>t==='percent'?'Diskon %':t==='fixed'?'Diskon Nominal':'Buy 1 Get 1'
  const now_=new Date().toISOString();const active=promos.filter(p=>p.is_active&&p.valid_from<=now_&&p.valid_until>=now_);const inactive=promos.filter(p=>!p.is_active||p.valid_from>now_||p.valid_until<now_)
  return (
    <div className="p-4 space-y-3">
      {isOwner&&stores&&stores.length>1&&(<div className="bg-white rounded-xl border border-gray-100 overflow-hidden"><div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2"><Store size={14} className="text-gray-400"/><p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pilih Toko</p></div><div className="flex gap-1.5 p-3 overflow-x-auto scrollbar-hide">{stores.map(s=>(<button key={s.id} onClick={()=>setSelectedStoreId(s.id)} className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${selectedStoreId===s.id?'bg-gray-900 text-white':'bg-gray-100 text-gray-600'}`}>{s.name}</button>))}</div></div>)}
      <div className="flex items-center justify-between"><div><p className="text-sm font-medium text-gray-900">Promo & Diskon</p><p className="text-xs text-gray-400">{active.length} aktif</p></div><button onClick={()=>{setEdit(null);setShowForm(true)}} className="flex items-center gap-1.5 text-sm font-medium text-gray-900 bg-white border border-gray-200 px-3 py-1.5 rounded-lg"><Plus size={14}/> Tambah</button></div>
      {loading?<div className="bg-white rounded-xl border border-gray-100 py-8 text-center text-sm text-gray-400">Memuat...</div>:(
        <>
          {active.length>0&&(<div><p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Aktif Sekarang</p><div className="bg-white rounded-xl border border-gray-100 overflow-hidden">{active.map((p,idx)=><PromoRow key={p.id} promo={p} idx={idx} onToggle={toggleActive} onEdit={pr=>{setEdit(pr);setShowForm(true)}} onDelete={handleDelete} typeLabel={typeLabel}/>)}</div></div>)}
          {inactive.length>0&&(<div><p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Nonaktif</p><div className="bg-white rounded-xl border border-gray-100 overflow-hidden opacity-60">{inactive.map((p,idx)=><PromoRow key={p.id} promo={p} idx={idx} onToggle={toggleActive} onEdit={pr=>{setEdit(pr);setShowForm(true)}} onDelete={handleDelete} typeLabel={typeLabel}/>)}</div></div>)}
          {promos.length===0&&(<div className="bg-white rounded-xl border border-gray-100 py-12 text-center"><Tag size={32} className="mx-auto text-gray-300 mb-2"/><p className="text-sm text-gray-400">Belum ada promo</p></div>)}
        </>
      )}
      {showForm&&(<PromoForm storeId={selectedStoreId} promo={editPromo} onClose={()=>{setShowForm(false);setEdit(null)}} onSaved={()=>{setShowForm(false);setEdit(null);loadPromos(selectedStoreId)}}/>)}
    </div>
  )
}

function PromoRow({promo,idx,onToggle,onEdit,onDelete,typeLabel}:{promo:PromoItem;idx:number;onToggle:(p:PromoItem)=>void;onEdit:(p:PromoItem)=>void;onDelete:(p:PromoItem)=>void;typeLabel:(t:string)=>string}){
  const until=new Date(promo.valid_until).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})
  const valueLabel=promo.promo_type==='percent'?`${promo.value}%`:promo.promo_type==='fixed'?`Rp ${promo.value.toLocaleString('id-ID')}`:'Gratis 1'
  return(<div className={`flex items-center gap-3 px-4 py-3 ${idx!==0?'border-t border-gray-50':''}`}><div className="flex-1 min-w-0"><div className="flex items-center gap-1.5"><p className="text-sm font-medium text-gray-900 truncate">{promo.name}</p><span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${promo.promo_type==='buy1get1'?'bg-purple-100 text-purple-700':promo.promo_type==='percent'?'bg-blue-100 text-blue-700':'bg-green-100 text-green-700'}`}>{typeLabel(promo.promo_type)}</span></div><p className="text-xs text-gray-500">{valueLabel} · s/d {until}</p></div><div className="flex items-center gap-1.5 flex-shrink-0"><button onClick={()=>onEdit(promo)} className="p-1.5 text-gray-400 rounded-lg"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button><button onClick={()=>onToggle(promo)} className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${promo.is_active?'bg-gray-900':'bg-gray-200'}`}><div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${promo.is_active?'left-[18px]':'left-0.5'}`}/></button><button onClick={()=>onDelete(promo)} className="p-1.5 text-red-400 rounded-lg"><Trash2 size={14}/></button></div></div>)
}

function PromoForm({storeId,promo,onClose,onSaved}:{storeId:string;promo:PromoItem|null;onClose:()=>void;onSaved:()=>void}){
  const products=useLiveQuery(()=>db.products.filter(p=>p.is_active).toArray(),[])
  const today=new Date().toISOString().slice(0,10);const nextMonth=new Date(Date.now()+30*86400000).toISOString().slice(0,10)
  const [name,setName]=useState(promo?.name||'');const [productId,setProd]=useState(promo?.product_id||'');const [type,setType]=useState<'percent'|'fixed'|'buy1get1'>(promo?.promo_type||'percent');const [value,setValue]=useState(String(promo?.value||''));const [minQty,setMinQty]=useState(String(promo?.min_qty||'1'));const [from,setFrom]=useState(promo?.valid_from?.slice(0,10)||today);const [until,setUntil]=useState(promo?.valid_until?.slice(0,10)||nextMonth);const [isActive,setActive]=useState(promo?.is_active??true);const [saving,setSaving]=useState(false)
  async function handleSave(){if(!name.trim())return toast.error('Nama promo wajib diisi');if(!productId)return toast.error('Pilih produk');if(type!=='buy1get1'&&!value)return toast.error('Nilai diskon wajib diisi');setSaving(true);try{const data:PromoItem={id:promo?.id||generateId(),store_id:storeId,product_id:productId,name:name.trim(),promo_type:type,value:type==='buy1get1'?1:Number(value),min_qty:Number(minQty)||1,valid_from:new Date(from).toISOString(),valid_until:new Date(until+'T23:59:59').toISOString(),is_active:isActive,created_at:promo?.created_at||now()};await db.promotions.put(data as any);await supabase.from('promotions').upsert(data);toast.success(promo?'Promo diupdate':'Promo ditambahkan');onSaved()}catch(e){console.error(e);toast.error('Gagal menyimpan')}finally{setSaving(false)}}
  return(<Modal title={promo?'Edit Promo':'Tambah Promo'} onClose={onClose}><div><Label required>Nama Promo</Label><input className="input" value={name} onChange={e=>setName(e.target.value)} autoFocus/></div><div><Label required>Produk</Label><select className="input" value={productId} onChange={e=>setProd(e.target.value)}><option value="">-- Pilih produk *</option>{products?.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div><div><Label required>Tipe Promo</Label><div className="grid grid-cols-3 gap-2">{([{id:'percent',label:'Diskon %'},{id:'fixed',label:'Disc Nominal'},{id:'buy1get1',label:'Buy 1 Get 1'}] as const).map(t=>(<button key={t.id} onClick={()=>setType(t.id)} className={`py-2 rounded-xl text-xs font-medium border transition-colors ${type===t.id?'bg-gray-900 text-white border-gray-900':'border-gray-200 text-gray-600'}`}>{t.label}</button>))}</div></div>{type!=='buy1get1'&&(<div><Label required>{type==='percent'?'Diskon (%)':'Diskon (Rp)'}</Label><input className="input" inputMode="decimal" value={value} onChange={e=>setValue(e.target.value.replace(/[^0-9.]/g,''))} placeholder={type==='percent'?'10':'5000'}/></div>)}<div><Label>Min. Qty</Label><input className="input" inputMode="decimal" value={minQty} onChange={e=>setMinQty(e.target.value.replace(/[^0-9]/g,''))} placeholder="1"/></div><div className="grid grid-cols-2 gap-3"><div><Label required>Dari</Label><input className="input" type="date" value={from} onChange={e=>setFrom(e.target.value)}/></div><div><Label required>Sampai</Label><input className="input" type="date" value={until} onChange={e=>setUntil(e.target.value)}/></div></div><div className="flex items-center justify-between py-2 border-t border-gray-100"><p className="text-sm text-gray-700">Aktif</p><button onClick={()=>setActive(!isActive)} className={`w-11 h-6 rounded-full transition-colors relative ${isActive?'bg-gray-900':'bg-gray-200'}`}><div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isActive?'left-[22px]':'left-0.5'}`}/></button></div><div className="flex gap-3 pt-1 border-t border-gray-100"><button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button><button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving?'Menyimpan...':'Simpan'}</button></div></Modal>)
}

// ── TUTUP TAHUN TAB ───────────────────────────────────────────
function TutupTahunTab({ currentUser }: { currentUser: User }) {
  const region='malang';const currentYear=new Date().getFullYear()
  const [selectedYear,setSelectedYear]=useState(currentYear-1);const [step,setStep]=useState<'preview'|'backup'|'done'>('preview');const [stats,setStats]=useState<any>(null);const [loadingStats,setLoadingStats]=useState(false);const [processing,setProcessing]=useState(false);const [log,setLog]=useState<string[]>([])
  async function loadStats(){setLoadingStats(true);try{const from=`${selectedYear}-01-01`;const to=`${selectedYear}-12-31`;const[trx,purchases,mutations,expenses,logs]=await Promise.all([supabase.from('transactions').select('id, total',{count:'exact'}).gte('created_at',from).lte('created_at',to),supabase.from('purchases').select('id, total_amount',{count:'exact'}).gte('created_at',from).lte('created_at',to),supabase.from('warehouse_mutations').select('id',{count:'exact'}).gte('created_at',from).lte('created_at',to),supabase.from('warehouse_expenses').select('id, amount',{count:'exact'}).gte('created_at',from).lte('created_at',to),supabase.from('production_logs').select('id',{count:'exact'}).gte('created_at',from).lte('created_at',to)]);const totalPenjualan=(trx.data||[]).reduce((s:number,t:any)=>s+(t.total||0),0);const totalPembelian=(purchases.data||[]).reduce((s:number,p:any)=>s+(p.total_amount||0),0);const totalBiaya=(expenses.data||[]).reduce((s:number,e:any)=>s+(e.amount||0),0);setStats({tahun:selectedYear,jumlahTransaksi:trx.count||0,totalPenjualan,jumlahPembelian:purchases.count||0,totalPembelian,jumlahMutasi:mutations.count||0,jumlahBiaya:expenses.count||0,totalBiaya,jumlahProduksi:logs.count||0})}catch{toast.error('Gagal load statistik')}finally{setLoadingStats(false)}}
  return (
    <div className="p-4 space-y-4">
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-3"><div className="flex items-start gap-2"><AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5"/><div><p className="text-sm font-medium text-amber-800">Fitur Tutup Tahun</p><p className="text-xs text-amber-600 mt-0.5">Backup semua data transaksi tahunan ke file, lalu hapus dari database. Proses ini tidak bisa dibatalkan.</p></div></div></div>
      {step==='done'?(<div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center"><p className="text-lg font-bold text-green-700">✓ Tutup Tahun Selesai</p><p className="text-sm text-green-600 mt-1">Data tahun {selectedYear} sudah dibackup dan dihapus</p><button onClick={()=>{setStep('preview');setStats(null);setLog([])}} className="mt-3 px-4 py-2 bg-green-700 text-white rounded-xl text-sm font-medium">Tutup Tahun Lain</button></div>):(
        <><div className="bg-white rounded-xl border border-gray-100 p-4"><p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Pilih Tahun</p><div className="flex gap-2">{[currentYear-2,currentYear-1].map(y=>(<button key={y} onClick={()=>{setSelectedYear(y);setStats(null)}} className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${selectedYear===y?'bg-gray-900 text-white border-gray-900':'border-gray-200 text-gray-600'}`}>{y}</button>))}</div></div>
        {!stats?(<button onClick={loadStats} disabled={loadingStats} className="w-full py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 disabled:opacity-50">{loadingStats?'Mengecek data...':`Preview Data Tahun ${selectedYear}`}</button>):(<div className="bg-white rounded-xl border border-gray-100 overflow-hidden"><div className="px-4 py-3 border-b border-gray-50"><p className="text-sm font-semibold text-gray-900">Ringkasan {selectedYear}</p></div><div className="divide-y divide-gray-50">{[{label:'Transaksi',value:`${stats.jumlahTransaksi} · ${formatRupiah(stats.totalPenjualan)}`},{label:'Pembelian',value:`${stats.jumlahPembelian} · ${formatRupiah(stats.totalPembelian)}`},{label:'Mutasi',value:`${stats.jumlahMutasi}`},{label:'Biaya',value:`${stats.jumlahBiaya} · ${formatRupiah(stats.totalBiaya)}`},{label:'Produksi',value:`${stats.jumlahProduksi}`}].map(row=>(<div key={row.label} className="flex items-center justify-between px-4 py-2.5"><p className="text-xs text-gray-500">{row.label}</p><p className="text-xs font-medium text-gray-800">{row.value}</p></div>))}</div></div>)}
        {log.length>0&&(<div className="bg-gray-900 rounded-xl p-3 space-y-1">{log.map((l,i)=><p key={i} className="text-xs text-gray-300 font-mono">{l}</p>)}</div>)}
        </>
      )}
    </div>
  )
}

// ── RESET TAB ─────────────────────────────────────────────────
function ResetDataTab() {
  const [resetting,setResetting]=useState(false);const [log,setLog]=useState<string[]>([])
  function addLog(msg:string){setLog(prev=>[...prev,msg])}
  function clearLocalStorageSaldo(){Object.keys(localStorage).filter(k=>k.startsWith('saldo_awal_')||k.startsWith('saldo_tambahan_')||k.startsWith('close_order_')||k.startsWith('coco_shift_')||k==='shift_active').forEach(k=>localStorage.removeItem(k))}
  async function resetToko(){if(!confirm('Reset data toko? Transaksi kasir, shift, close order, dan stok toko akan dihapus.'))return;setResetting(true);setLog([]);try{addLog('🗑️ Menghapus transaksi dari server...');await supabase.from('transaction_items').delete().neq('id','x');await supabase.from('transactions').delete().neq('id','x');await supabase.from('shifts').delete().neq('id','x');addLog('🗑️ Menghapus close order reports...');await supabase.from('close_order_reports').delete().neq('id','x');addLog('🧹 Membersihkan lokal...');await db.transaction_items.clear();await db.transactions.clear();await db.shifts.clear();await db.stock.clear();await db.sync_queue.clear();if((db as any).close_order_reports)await(db as any).close_order_reports.clear();clearLocalStorageSaldo();addLog('✅ Selesai');toast.success('Data toko direset')}catch(e){toast.error('Gagal: '+String(e));addLog('❌ '+String(e))}finally{setResetting(false)}}
  async function resetGudang(){if(!confirm('Reset data gudang?'))return;setResetting(true);setLog([]);try{addLog('Menghapus dari server...');await supabase.from('warehouse_mutation_items').delete().neq('id','x');await supabase.from('warehouse_mutations').delete().neq('id','x');await supabase.from('purchase_items').delete().neq('id','x');await supabase.from('purchases').delete().neq('id','x');await supabase.from('warehouse_expenses').delete().neq('id','x');addLog('Membersihkan lokal...');await db.warehouse_mutation_items.clear();await db.warehouse_mutations.clear();await db.purchase_items.clear();await db.purchases.clear();await db.warehouse_expenses.clear();await db.warehouse_stock.clear();addLog('✅ Selesai');toast.success('Data gudang direset')}catch(e){toast.error('Gagal: '+String(e));addLog('❌ '+String(e))}finally{setResetting(false)}}
  async function resetProduksi(){if(!confirm('Reset data produksi?'))return;setResetting(true);setLog([]);try{addLog('Menghapus dari server...');await supabase.from('production_log_materials').delete().neq('id','x');await supabase.from('production_logs').delete().neq('id','x');await supabase.from('production_mutation_items').delete().neq('id','x');await supabase.from('production_mutations').delete().neq('id','x');addLog('Membersihkan lokal...');await db.production_log_materials.clear();await db.production_logs.clear();await db.production_mutation_items.clear();await db.production_mutations.clear();await db.production_stock.clear();await db.finished_goods_stock.clear();addLog('✅ Selesai');toast.success('Data produksi direset')}catch(e){toast.error('Gagal: '+String(e));addLog('❌ '+String(e))}finally{setResetting(false)}}
  async function resetSettings(){if(!confirm('Reset promo?'))return;setResetting(true);setLog([]);try{addLog('Mereset promo...');await supabase.from('promotions').delete().neq('id','x');await db.promotions.clear();addLog('✅ Selesai');toast.success('Promo direset')}catch(e){toast.error('Gagal: '+String(e));addLog('❌ '+String(e))}finally{setResetting(false)}}
  async function resetSemua(){const ok1=confirm('PERHATIAN!\n\nIni akan menghapus SEMUA data operasional.\nMaster data tetap aman.\n\nLanjutkan?');if(!ok1)return;const typed=prompt('Ketik RESET untuk konfirmasi:');if(typed!=='RESET'){toast.error('Reset dibatalkan');return}setResetting(true);setLog([]);try{addLog('🗑️ Menghapus semua data...');await supabase.from('transaction_items').delete().neq('id','x');await supabase.from('transactions').delete().neq('id','x');await supabase.from('shifts').delete().neq('id','x');await supabase.from('close_order_reports').delete().neq('id','x');await supabase.from('warehouse_mutation_items').delete().neq('id','x');await supabase.from('warehouse_mutations').delete().neq('id','x');await supabase.from('purchase_items').delete().neq('id','x');await supabase.from('purchases').delete().neq('id','x');await supabase.from('warehouse_expenses').delete().neq('id','x');await supabase.from('production_log_materials').delete().neq('id','x');await supabase.from('production_logs').delete().neq('id','x');await supabase.from('production_mutation_items').delete().neq('id','x');await supabase.from('production_mutations').delete().neq('id','x');await supabase.from('promotions').delete().neq('id','x');addLog('🧹 Membersihkan lokal...');await db.transaction_items.clear();await db.transactions.clear();await db.shifts.clear();await db.warehouse_mutation_items.clear();await db.warehouse_mutations.clear();await db.purchase_items.clear();await db.purchases.clear();await db.warehouse_expenses.clear();await db.production_log_materials.clear();await db.production_logs.clear();await db.production_mutation_items.clear();await db.production_mutations.clear();await db.production_stock.clear();await db.finished_goods_stock.clear();await db.warehouse_stock.clear();await db.stock.clear();await db.promotions.clear();await db.sync_queue.clear();if((db as any).close_order_reports)await(db as any).close_order_reports.clear();clearLocalStorageSaldo();addLog('✅ Selesai — siap Go-Live!');toast.success('Semua data direset. Siap Go-Live!')}catch(e){toast.error('Gagal: '+String(e));addLog('❌ Error: '+String((e as any)?.message||e))}finally{setResetting(false)}}
  return (
    <div className="p-4 space-y-4">
      <div className="bg-red-50 border border-red-100 rounded-xl p-3"><p className="text-sm font-medium text-red-700 mb-1">⚠️ Hati-hati — Data tidak bisa dikembalikan</p><p className="text-xs text-red-500">Master data (bahan, produk, supplier, resep, user) tetap aman.</p></div>
      {[{label:'Reset Data Gudang',sub:'Pembelian, mutasi, biaya, stok gudang',fn:resetGudang},{label:'Reset Data Produksi',sub:'Log produksi, stok produksi & produk jadi',fn:resetProduksi},{label:'Reset Data Toko',sub:'Transaksi kasir, shift, close order, stok toko',fn:resetToko},{label:'Reset Promo',sub:'Semua promo & diskon',fn:resetSettings}].map(btn=>(<div key={btn.label} className="bg-white rounded-xl border border-gray-100 overflow-hidden"><div className="px-4 py-3 border-b border-gray-50"><p className="text-sm font-medium text-gray-900">{btn.label}</p><p className="text-xs text-gray-400 mt-0.5">{btn.sub}</p></div><div className="px-4 py-3"><button onClick={btn.fn} disabled={resetting} className="w-full py-2.5 rounded-xl border border-red-200 text-sm font-medium text-red-600 disabled:opacity-50 active:bg-red-50">{resetting?'Mereset...':btn.label}</button></div></div>))}
      <div className="bg-red-50 border border-red-200 rounded-xl overflow-hidden"><div className="px-4 py-3 border-b border-red-100"><p className="text-sm font-bold text-red-800">🚀 Reset Semua Data (Go-Live)</p><p className="text-xs text-red-600 mt-0.5">Hapus SEMUA data operasional. Master data tetap aman.</p></div><div className="px-4 py-3"><button onClick={resetSemua} disabled={resetting} className="w-full py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-50">{resetting?'Mereset...':'Reset Semua Data (Go-Live)'}</button></div></div>
      {log.length>0&&(<div className="bg-gray-900 rounded-xl p-3 space-y-1">{log.map((l,i)=><p key={i} className="text-xs text-gray-300 font-mono">{l}</p>)}</div>)}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden"><div className="px-4 py-3 border-b border-gray-50"><p className="text-sm font-medium text-gray-900">Bersihkan Data Lokal Device</p><p className="text-xs text-gray-400 mt-0.5">Hapus cache di device ini. Data server tidak ikut terhapus.</p></div><div className="px-4 py-3"><button onClick={async()=>{if(!confirm('Hapus semua data lokal device ini?'))return;await hardResetLocal();toast.success('Data lokal dihapus.');setTimeout(()=>{window.location.href='/login'},1500)}} className="w-full py-2.5 rounded-xl border border-orange-200 text-sm font-medium text-orange-600 active:bg-orange-50">Bersihkan Data Lokal & Logout</button></div></div>
    </div>
  )
}

// ── Shared ────────────────────────────────────────────────────
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

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
      {children}{required && <span className="text-red-500 font-bold ml-0.5">*</span>}
    </label>
  )
}

function UserForm({ user, currentUser, stores, onClose }: { user: User|null; currentUser: User; stores: any[]; onClose: () => void }) {
  const [name,setName]=useState(user?.name||'');const [username,setUname]=useState(user?.username||'');const [password,setPass]=useState('');const [role,setRole]=useState<Role>(user?.role||'kasir');const [storeId,setStore]=useState(user?.store_id||currentUser.store_id);const [isActive,setActive]=useState(user?.is_active??true);const [saving,setSaving]=useState(false)
  // Filter toko berdasarkan role
  const kasirStores = stores.filter(s => !s.id.includes('gudang') && !s.id.includes('produksi'))
  const gudangStores = stores.filter(s => s.id.includes('gudang'))
  const produksiStores = stores.filter(s => s.id.includes('produksi'))
  const storeOptions = role === 'kasir' ? kasirStores : role === 'gudang' ? gudangStores : role === 'produksi' ? produksiStores : stores
  const needStorePick = ['kasir','gudang','produksi'].includes(role)

  async function handleSave(){if(!name||!username)return toast.error('Nama dan username wajib diisi');if(!user&&!password)return toast.error('Password wajib untuk user baru');setSaving(true);try{const isNew=!user;const finalStoreId=needStorePick?storeId:currentUser.store_id;const data:any={id:user?.id||generateId(),store_id:finalStoreId,name,username,password_hash:password?await hashPassword(password):(user as any)!.password_hash,role,is_active:isActive,created_at:user?.created_at||now()};await db.users.put(data);await supabase.from('users').upsert(data);await addToSyncQueue('users',data.id,isNew?'insert':'update',data,finalStoreId);toast.success(isNew?'User ditambahkan':'User diupdate');onClose()}finally{setSaving(false)}}
  return(<Modal title={user?'Edit User':'Tambah User'} onClose={onClose}><div><Label required>Nama Lengkap</Label><input className="input" value={name} onChange={e=>setName(e.target.value)} autoFocus/></div><div><Label required>Username</Label><input className="input" value={username} onChange={e=>setUname(e.target.value)}/></div><div><Label required>Password {user?'(kosongkan jika tidak diubah)':''}</Label><input className="input" type="password" value={password} onChange={e=>setPass(e.target.value)} placeholder={user?'••••':'Min. 4 karakter'}/></div><div><Label required>Role</Label><div className="grid grid-cols-2 gap-2">{(['kasir','gudang','produksi','manager'] as Role[]).map(r=>(<button key={r} onClick={()=>{setRole(r);if(r==='kasir'&&kasirStores.length>0)setStore(kasirStores[0].id);else if(r==='gudang'&&gudangStores.length>0)setStore(gudangStores[0].id);else if(r==='produksi'&&produksiStores.length>0)setStore(produksiStores[0].id)}} className={`py-2 rounded-xl text-sm font-medium border capitalize transition-colors ${role===r?'bg-gray-900 text-white border-gray-900':'border-gray-200 text-gray-600'}`}>{r}</button>))}</div></div>{needStorePick&&storeOptions.length>0&&(<div><Label required>{role==='kasir'?'Toko':role==='gudang'?'Gudang':'Divisi Produksi'}</Label><select className="input" value={storeId} onChange={e=>setStore(e.target.value)}>{storeOptions.map(s=><option key={s.id} value={s.id}>{s.name.replace(/ Malang$/,'').replace(/ Bali$/,'')} · {s.city}</option>)}</select><p className="text-xs text-gray-400 mt-1">User ini akan login ke {role==='kasir'?'toko':role} yang dipilih</p></div>)}<div className="flex items-center justify-between py-2 border-t border-gray-100"><p className="text-sm text-gray-700">Aktif</p><button onClick={()=>setActive(!isActive)} className={`w-11 h-6 rounded-full transition-colors relative ${isActive?'bg-gray-900':'bg-gray-200'}`}><div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isActive?'left-[22px]':'left-0.5'}`}/></button></div><div className="flex gap-3 pt-1 border-t border-gray-100"><button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button><button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving?'Menyimpan...':'Simpan'}</button></div></Modal>)
}

function SupplierForm({supplier,onClose}:{supplier:Supplier|null;onClose:()=>void}){const[name,setName]=useState(supplier?.name||'');const[phone,setPhone]=useState(supplier?.phone||'');const[address,setAddr]=useState(supplier?.address||'');const[isActive,setActive]=useState(supplier?.is_active??true);const[saving,setSaving]=useState(false);async function handleSave(){if(!name.trim())return toast.error('Nama wajib diisi');setSaving(true);try{const data:Supplier={id:supplier?.id||generateId(),name:name.trim(),phone:phone||undefined,address:address||undefined,is_active:isActive,created_at:supplier?.created_at||now()};await db.suppliers.put(data);await supabase.from('suppliers').upsert(data);toast.success(supplier?'Diupdate':'Ditambahkan');onClose()}finally{setSaving(false)}}
return(<Modal title={supplier?'Edit Supplier':'Tambah Supplier'} onClose={onClose}><div><Label required>Nama Supplier</Label><input className="input" value={name} onChange={e=>setName(e.target.value)} autoFocus/></div><div><Label>No. Telepon</Label><input className="input" type="tel" value={phone} onChange={e=>setPhone(e.target.value)}/></div><div><Label>Alamat</Label><input className="input" value={address} onChange={e=>setAddr(e.target.value)} placeholder="Opsional"/></div><div className="flex items-center justify-between py-2 border-t border-gray-100"><p className="text-sm text-gray-700">Aktif</p><button onClick={()=>setActive(!isActive)} className={`w-11 h-6 rounded-full transition-colors relative ${isActive?'bg-gray-900':'bg-gray-200'}`}><div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isActive?'left-[22px]':'left-0.5'}`}/></button></div><div className="flex gap-3 pt-1 border-t border-gray-100"><button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button><button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving?'Menyimpan...':'Simpan'}</button></div></Modal>)}

function MitraForm({partner,onClose}:{partner:Partner|null;onClose:()=>void}){const[name,setName]=useState(partner?.name||'');const[contact,setContact]=useState(partner?.contact||'');const[city,setCity]=useState(partner?.city||'');const[address,setAddr]=useState(partner?.address||'');const[isActive,setActive]=useState(partner?.is_active??true);const[saving,setSaving]=useState(false);async function handleSave(){if(!name.trim())return toast.error('Nama wajib diisi');setSaving(true);try{const data:Partner={id:partner?.id||generateId(),name:name.trim(),contact:contact||undefined,city:city||undefined,address:address||undefined,is_active:isActive,created_at:partner?.created_at||now()};await db.partners.put(data);await supabase.from('partners').upsert(data);toast.success(partner?'Diupdate':'Ditambahkan');onClose()}finally{setSaving(false)}}
return(<Modal title={partner?'Edit Mitra':'Tambah Franchise'} onClose={onClose}><div><Label required>Nama Franchise</Label><input className="input" value={name} onChange={e=>setName(e.target.value)} autoFocus/></div><div className="grid grid-cols-2 gap-3"><div><Label required>Kota</Label><input className="input" value={city} onChange={e=>setCity(e.target.value)}/></div><div><Label required>No. Telepon</Label><input className="input" type="tel" value={contact} onChange={e=>setContact(e.target.value)}/></div></div><div><Label>Alamat</Label><input className="input" value={address} onChange={e=>setAddr(e.target.value)} placeholder="Opsional"/></div><div className="flex items-center justify-between py-2 border-t border-gray-100"><p className="text-sm text-gray-700">Aktif</p><button onClick={()=>setActive(!isActive)} className={`w-11 h-6 rounded-full transition-colors relative ${isActive?'bg-gray-900':'bg-gray-200'}`}><div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isActive?'left-[22px]':'left-0.5'}`}/></button></div><div className="flex gap-3 pt-1 border-t border-gray-100"><button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Batal</button><button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving?'Menyimpan...':'Simpan'}</button></div></Modal>)}


function SistemTab() {
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('app_config').select('maintenance_mode').eq('id', 'main').maybeSingle()
      .then(({ data }) => { setMaintenanceMode(!!data?.maintenance_mode); setLoading(false) })
  }, [])

  async function toggle() {
    setSaving(true)
    try {
      const newVal = !maintenanceMode
      const { error } = await supabase.from('app_config').update({ maintenance_mode: newVal, updated_at: new Date().toISOString() }).eq('id', 'main')
      if (error) throw error
      setMaintenanceMode(newVal)
      toast.success(newVal ? 'Mode perbaikan diaktifkan untuk semua role' : 'Mode perbaikan dimatikan')
    } catch (e) { toast.error('Gagal mengubah mode perbaikan') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="p-4 text-sm text-gray-400">Memuat...</div>

  return (
    <div className="p-4 space-y-3">
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">Mode Perbaikan</p>
            <p className="text-xs text-gray-400 mt-0.5">Tampilkan banner "Aplikasi dalam perbaikan" di semua role secara real-time</p>
          </div>
          <button onClick={toggle} disabled={saving}
            className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${maintenanceMode ? 'bg-red-600' : 'bg-gray-200'}`}>
            <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${maintenanceMode ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>
      {maintenanceMode && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3">
          <p className="text-xs text-red-700">Banner sedang tampil di semua role. Matikan toggle di atas untuk menghilangkannya.</p>
        </div>
      )}
    </div>
  )
}
