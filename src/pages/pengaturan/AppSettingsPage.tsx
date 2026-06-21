// src/pages/pengaturan/AppSettingsPage.tsx
// Halaman pengaturan tampilan app — hanya owner
// Fitur: ganti nama app, logo login, icon browser, foto produk

import { useState, useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { useAppSettings } from '@/hooks/useAppSettings'
import { formatRupiah } from '@/lib/utils'
import { Upload, RefreshCw, Check, Image, Smartphone, Monitor, X } from 'lucide-react'
import toast from 'react-hot-toast'

// ── Upload ke Supabase Storage ────────────────────────────────
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
  } catch (e) {
    console.error('[UPLOAD]', e)
    return null
  }
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
  } catch (e) {
    console.error('[UPLOAD PRODUCT]', e)
    return null
  }
}

function UploadBox({ label, hint, currentUrl, onUpload, loading }: {
  label: string
  hint: string
  currentUrl: string | null
  onUpload: (file: File) => Promise<any>
  loading: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
      </div>
      <div className="flex items-center gap-4">
        {/* Preview */}
        <div className="w-16 h-16 rounded-xl border border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50 flex-shrink-0">
          {currentUrl
            ? <img src={currentUrl} alt="preview" className="w-full h-full object-cover" />
            : <Image size={24} className="text-gray-300" />}
        </div>
        {/* Upload button */}
        <div className="flex-1 space-y-2">
          <input
            ref={ref}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async e => {
              const file = e.target.files?.[0]
              if (file) await onUpload(file)
              if (ref.current) ref.current.value = ''
            }}
          />
          <button
            onClick={() => ref.current?.click()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
            {loading ? 'Mengupload...' : 'Pilih Gambar'}
          </button>
          {currentUrl && (
            <p className="text-xs text-green-600 flex items-center gap-1">
              <Check size={11} /> Sudah diatur
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AppSettingsPage() {
  const { user } = useAuthStore()
  const { settings, refresh } = useAppSettings()
  const isOwner = ['owner', 'manager'].includes(user?.role || '')

  const [appName,      setAppName]      = useState('')
  const [savingName,   setSavingName]   = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingIcon, setUploadingIcon] = useState(false)

  // Product image states
  const [productSearch,    setProductSearch]    = useState('')
  const [uploadingProduct, setUploadingProduct] = useState<string | null>(null)

  useEffect(() => {
    setAppName(settings.app_name)
  }, [settings.app_name])

  const products = useLiveQuery(async () => {
    const all = await db.products.filter(p => p.is_active).toArray()
    if (!productSearch) return all
    return all.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()))
  }, [productSearch])

  async function handleSaveName() {
    if (!appName.trim()) return toast.error('Nama app tidak boleh kosong')
    setSavingName(true)
    try {
      await supabase.from('app_settings')
        .update({ app_name: appName.trim(), updated_at: new Date().toISOString() })
        .eq('id', 'default')
      await refresh()
      document.title = appName.trim()
      toast.success('Nama app diperbarui')
    } catch { toast.error('Gagal menyimpan') }
    finally { setSavingName(false) }
  }

  async function handleUploadLogo(file: File) {
    setUploadingLogo(true)
    try {
      const url = await uploadToStorage(file, 'logo')
      if (!url) return toast.error('Gagal upload logo')
      await supabase.from('app_settings')
        .update({ app_logo_url: url, updated_at: new Date().toISOString() })
        .eq('id', 'default')
      await refresh()
      toast.success('Logo diperbarui')
    } catch { toast.error('Gagal upload logo') }
    finally { setUploadingLogo(false) }
  }

  async function handleUploadIcon(file: File) {
    setUploadingIcon(true)
    try {
      const url = await uploadToStorage(file, 'icon')
      if (!url) return toast.error('Gagal upload icon')
      await supabase.from('app_settings')
        .update({ app_icon_url: url, updated_at: new Date().toISOString() })
        .eq('id', 'default')
      await refresh()
      // Apply favicon langsung
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
      // Update di Supabase
      await supabase.from('products').update({ image_url: url }).eq('id', productId)
      // Update di Dexie
      await db.products.update(productId, { image_url: url } as any)
      toast.success('Foto produk diperbarui')
    } catch { toast.error('Gagal upload foto produk') }
    finally { setUploadingProduct(null) }
  }

  async function handleRemoveProductImage(productId: string) {
    try {
      await supabase.from('products').update({ image_url: null }).eq('id', productId)
      await db.products.update(productId, { image_url: null } as any)
      toast.success('Foto produk dihapus')
    } catch { toast.error('Gagal menghapus foto') }
  }

  if (!isOwner) {
    return (
      <div className="flex flex-col h-full bg-gray-50 items-center justify-center">
        <p className="text-sm text-gray-400">Hanya owner/manager yang bisa mengakses halaman ini</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-900">Pengaturan Tampilan</h1>
        <p className="text-xs text-gray-400 mt-0.5">Logo, icon, dan foto produk</p>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6 max-w-2xl mx-auto w-full">

        {/* ── IDENTITAS APP ── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Monitor size={14} className="text-gray-400" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Identitas App</p>
          </div>

          {/* Nama App */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
            <p className="text-sm font-medium text-gray-900">Nama Aplikasi</p>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={appName}
                onChange={e => setAppName(e.target.value)}
                placeholder="Coco Puff POS"
              />
              <button
                onClick={handleSaveName}
                disabled={savingName || appName === settings.app_name}
                className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-40">
                {savingName ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
            <p className="text-xs text-gray-400">Tampil di halaman login, sidebar, dan tab browser</p>
          </div>

          {/* Logo */}
          <UploadBox
            label="Logo Aplikasi"
            hint="Tampil di halaman login dan pojok kiri sidebar. Ukuran ideal: 128×128px"
            currentUrl={settings.app_logo_url}
            onUpload={handleUploadLogo}
            loading={uploadingLogo}
          />

          {/* Icon */}
          <UploadBox
            label="Icon Browser (Favicon)"
            hint="Tampil di tab browser dan bookmark. Gunakan PNG ukuran 32×32px atau 64×64px"
            currentUrl={settings.app_icon_url}
            onUpload={handleUploadIcon}
            loading={uploadingIcon}
          />

          {settings.app_logo_url || settings.app_icon_url ? (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
              <p className="text-xs text-blue-700">
                💡 Perubahan logo & icon akan aktif setelah semua user melakukan hard refresh (<kbd className="bg-blue-100 px-1 rounded">Ctrl+Shift+R</kbd>)
              </p>
            </div>
          ) : null}
        </div>

        {/* ── FOTO PRODUK ── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Smartphone size={14} className="text-gray-400" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Foto Produk</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-sm text-gray-500 mb-3">Foto tampil di halaman kasir saat memilih produk</p>
            <input
              className="input mb-3"
              placeholder="Cari nama produk..."
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
            />
            <div className="space-y-2">
              {products?.map(product => {
                const imgUrl   = (product as any).image_url as string | null
                const isUploading = uploadingProduct === product.id
                const fileRef  = { current: null as HTMLInputElement | null }
                return (
                  <ProductImageRow
                    key={product.id}
                    product={product}
                    imgUrl={imgUrl}
                    isUploading={isUploading}
                    onUpload={file => handleUploadProductImage(file, product.id)}
                    onRemove={() => handleRemoveProductImage(product.id)}
                  />
                )
              })}
              {products?.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">Produk tidak ditemukan</p>
              )}
            </div>
          </div>
        </div>

        <div className="h-8" />
      </div>
    </div>
  )
}

function ProductImageRow({ product, imgUrl, isUploading, onUpload, onRemove }: {
  product: any
  imgUrl: string | null
  isUploading: boolean
  onUpload: (file: File) => Promise<any>
  onRemove: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
      {/* Foto preview */}
      <div className="w-12 h-12 rounded-xl border border-gray-200 overflow-hidden bg-gray-50 flex-shrink-0 flex items-center justify-center">
        {imgUrl
          ? <img src={imgUrl} alt={product.name} className="w-full h-full object-cover" />
          : <Image size={18} className="text-gray-300" />}
      </div>

      {/* Nama + harga */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
        <p className="text-xs text-gray-400">{formatRupiah(product.price || 0)}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async e => {
            const file = e.target.files?.[0]
            if (file) await onUpload(file)
            if (fileRef.current) fileRef.current.value = ''
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={isUploading}
          className="text-xs text-blue-600 border border-blue-200 px-2.5 py-1.5 rounded-lg hover:bg-blue-50 disabled:opacity-50 flex items-center gap-1">
          {isUploading
            ? <><RefreshCw size={11} className="animate-spin" /> Upload...</>
            : <><Upload size={11} /> {imgUrl ? 'Ganti' : 'Upload'}</>}
        </button>
        {imgUrl && !isUploading && (
          <button
            onClick={onRemove}
            className="text-xs text-red-400 border border-red-200 p-1.5 rounded-lg hover:bg-red-50">
            <X size={11} />
          </button>
        )}
      </div>
    </div>
  )
}
