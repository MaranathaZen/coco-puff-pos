export async function shareWaMutasi(m: any, mutNo: string, tcLabel: string, pengirim: string, penerima: string) {
  const tgl = new Date(m.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  const fmtRp = (n: number) => 'Rp' + Math.round(n || 0).toLocaleString('id-ID')
  // Hanya tampilkan total (tanpa rincian item) — sesuai permintaan
  const totalNilai = (m.items || []).reduce((s: number, i: any) => s + Number(i.qty) * (Number(i.unit_cost) || 0), 0)
  const msg = `📋 ${mutNo}\n📦 Mutasi ${tcLabel}\n📅 ${tgl}\n${pengirim} -> ${penerima}\n💰 Total: ${fmtRp(totalNilai)}`
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank')
}
