import { db } from '@/lib/db'
import { supabase } from '@/lib/supabase'

export async function shareWaMutasi(m: any, mutNo: string, tcLabel: string, pengirim: string, penerima: string) {
  const tgl = new Date(m.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  const mats = await db.materials.toArray()
  const matMap = Object.fromEntries(mats.map((mat: any) => [mat.id, mat.name]))
  const matUnitMap = Object.fromEntries(mats.map((mat: any) => [mat.id, mat.unit]))
  const fgsList = await db.finished_goods_stock.toArray()
  const fgsMap = Object.fromEntries(fgsList.map((f: any) => [f.product_id ?? f.id, f.product_name]))
  const fmtRp = (n: number) => 'Rp' + Math.round(n || 0).toLocaleString('id-ID')

  // Ambil item dari SERVER dulu (sumber kebenaran) — device yang share belum
  // tentu sudah pull item-nya ke Dexie. Fallback Dexie -> m.items saat offline.
  let rawItems: any[] = []
  let fromProduction = false
  try {
    const { data } = await supabase.from('warehouse_mutation_items').select('*').eq('mutation_id', m.id)
    if (data?.length) rawItems = data
  } catch {}
  if (!rawItems.length) {
    try {
      const { data } = await supabase.from('production_mutation_items').select('*').eq('mutation_id', m.id)
      if (data?.length) { rawItems = data; fromProduction = true }
    } catch {}
  }
  if (!rawItems.length) {
    try { rawItems = await db.warehouse_mutation_items.where('mutation_id').equals(m.id).toArray() } catch {}
  }
  if (!rawItems.length) {
    try { rawItems = await db.production_mutation_items.where('mutation_id').equals(m.id).toArray(); if (rawItems.length) fromProduction = true } catch {}
  }
  if (!rawItems.length && Array.isArray(m.items)) rawItems = m.items

  // List barang (nama + qty + satuan, tanpa harga per-item) + Total semua
  let totalNilai = 0
  const items = rawItems.map((i: any) => {
    const pid  = i.material_id || i.product_id
    const name = i.product_name || i.name || matMap[pid] || fgsMap[pid] || pid
    const unit = i.unit || matUnitMap[pid] || ((fgsMap[pid] || fromProduction) ? 'pcs' : '')
    totalNilai += Number(i.qty) * (Number(i.unit_cost) || 0)
    return `- ${name}: ${i.qty} ${unit}`.trimEnd()
  }).join('\n')

  const totalLine = totalNilai > 0 ? `\n💰 Total: ${fmtRp(totalNilai)}` : ''
  const msg = `📋 ${mutNo}\n📦 Mutasi ${tcLabel}\n📅 ${tgl}\n${pengirim} -> ${penerima}\n${items}${totalLine}`
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank')
}
