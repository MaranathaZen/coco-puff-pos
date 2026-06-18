import { db } from '@/lib/db'

export async function shareWaMutasi(m: any, mutNo: string, tcLabel: string, pengirim: string, penerima: string) {
  const tgl = new Date(m.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  const mats = await db.materials.toArray()
  const matMap = Object.fromEntries(mats.map((mat: any) => [mat.id, mat.name]))
  const fgsList = await db.finished_goods_stock.toArray()
  const fgsMap = Object.fromEntries(fgsList.map((f: any) => [f.product_id ?? f.id, f.product_name]))
  const items = m.items.map((i: any) => {
    const name = i.name || matMap[i.material_id] || fgsMap[i.material_id] || i.material_id
    return `- ${name}: ${i.qty} ${i.unit || ''}`
  }).join('\n')
  const msg = `📋 ${mutNo}\n📦 Mutasi ${tcLabel}\n📅 ${tgl}\n${pengirim} -> ${penerima}\n${items}`
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank')
}
