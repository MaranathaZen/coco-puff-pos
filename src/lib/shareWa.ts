import { db } from '@/lib/db'

export async function shareWaMutasi(m: any, mutNo: string, tcLabel: string, pengirim: string, penerima: string) {
  const tgl = new Date(m.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  const mats = await db.materials.toArray()
  const matMap = Object.fromEntries(mats.map((mat: any) => [mat.id, mat.name]))
  const matUnitMap = Object.fromEntries(mats.map((mat: any) => [mat.id, mat.unit]))
  const fgsList = await db.finished_goods_stock.toArray()
  const fgsMap = Object.fromEntries(fgsList.map((f: any) => [f.product_id ?? f.id, f.product_name]))
  const fmtRp = (n: number) => 'Rp' + Math.round(n || 0).toLocaleString('id-ID')
  // List barang (nama + qty + satuan, tanpa harga per-item) + Total semua
  // Satuan diresolve dari material (item mutasi tak simpan unit)
  let totalNilai = 0
  const items = (m.items || []).map((i: any) => {
    const name = i.name || matMap[i.material_id] || fgsMap[i.material_id] || i.material_id
    const unit = i.unit || matUnitMap[i.material_id] || (fgsMap[i.material_id] ? 'pcs' : '')
    totalNilai += Number(i.qty) * (Number(i.unit_cost) || 0)
    return `- ${name}: ${i.qty} ${unit}`.trimEnd()
  }).join('\n')
  const msg = `📋 ${mutNo}\n📦 Mutasi ${tcLabel}\n📅 ${tgl}\n${pengirim} -> ${penerima}\n${items}\n💰 Total: ${fmtRp(totalNilai)}`
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank')
}
