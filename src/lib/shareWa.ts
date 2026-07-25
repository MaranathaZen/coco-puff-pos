import { db } from '@/lib/db'

export async function shareWaMutasi(m: any, mutNo: string, tcLabel: string, pengirim: string, penerima: string) {
  const tgl = new Date(m.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  const mats = await db.materials.toArray()
  const matMap = Object.fromEntries(mats.map((mat: any) => [mat.id, mat.name]))
  const matUnitMap = Object.fromEntries(mats.map((mat: any) => [mat.id, mat.unit]))
  const fgsList = await db.finished_goods_stock.toArray()
  const fgsMap = Object.fromEntries(fgsList.map((f: any) => [f.product_id ?? f.id, f.product_name]))
  const fmtRp = (n: number) => 'Rp' + Math.round(n || 0).toLocaleString('id-ID')

  // Ambil item langsung dari DB by mutation id (jangan andalkan m.items yang
  // bisa kosong/stale saat share). Dukung mutasi gudang & produksi.
  let rawItems: any[] = []
  try { rawItems = await db.warehouse_mutation_items.where('mutation_id').equals(m.id).toArray() } catch {}
  let fromProduction = false
  if (!rawItems.length) {
    try { rawItems = await db.production_mutation_items.where('mutation_id').equals(m.id).toArray(); fromProduction = true } catch {}
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
