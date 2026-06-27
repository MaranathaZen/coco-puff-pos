import { db } from '@/lib/db'

export async function shareWaMutasi(m: any, mutNo: string, tcLabel: string, pengirim: string, penerima: string) {
  const tgl = new Date(m.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  const mats = await db.materials.toArray()
  const matMap = Object.fromEntries(mats.map((mat: any) => [mat.id, mat.name]))
  const fgsList = await db.finished_goods_stock.toArray()
  const fgsMap = Object.fromEntries(fgsList.map((f: any) => [f.product_id ?? f.id, f.product_name]))
  const fmtRp = (n: number) => 'Rp' + Math.round(n || 0).toLocaleString('id-ID')
  let totalNilai = 0
  const items = m.items.map((i: any) => {
    const name = i.name || matMap[i.material_id] || fgsMap[i.material_id] || i.material_id
    const cost = Number(i.unit_cost) || 0
    const subtotal = Number(i.qty) * cost
    totalNilai += subtotal
    const hargaInfo = cost > 0 ? ` @ ${fmtRp(cost)} = ${fmtRp(subtotal)}` : ''
    return `- ${name}: ${i.qty} ${i.unit || ''}${hargaInfo}`
  }).join('\n')
  const totalLine = totalNilai > 0 ? `\n💰 Total: ${fmtRp(totalNilai)}` : ''
  const msg = `📋 ${mutNo}\n📦 Mutasi ${tcLabel}\n📅 ${tgl}\n${pengirim} -> ${penerima}\n${items}${totalLine}`
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank')
}
