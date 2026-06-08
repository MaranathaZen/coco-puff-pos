# patch_stok.ps1 — Fix UnifiedStokPage.tsx
# Jalankan: powershell -ExecutionPolicy Bypass -File patch_stok.ps1

$file = "src\pages\stok\UnifiedStokPage.tsx"
$content = Get-Content $file -Raw

Write-Host "Applying fixes to $file..."

# ── FIX 1: Tambah helper formatAvgCost setelah KATEGORI array ──
$old1 = @'
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
'@
$new1 = @'
function formatAvgCost(cost: number, unit: string): string {
  if (!cost || cost === 0) return `Rp 0/${unit}`
  if (cost < 100) {
    const formatted = parseFloat(cost.toFixed(3)).toString()
    return `Rp ${formatted}/${unit}`
  }
  return `Rp ${Math.round(cost).toLocaleString('id-ID')}/${unit}`
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
'@
$content = $content.Replace($old1, $new1)

# ── FIX 2: StokGudangView avg display ──
$old2 = '`>{formatKategori(item.category)} · Avg {formatRupiah(item.avg_cost)}/{item.unit}</p>'
$new2 = '`>{formatKategori(item.category)} · Avg {formatAvgCost(item.avg_cost, item.unit)}</p>'
$content = $content.Replace($old2, $new2)

# ── FIX 3: StokProduksiView avg display ──
$old3 = '`>{formatKategori(s.material?.category)} · Avg {formatRupiah(s.displayAvgCost)}/{s.material?.unit}</p>'
$new3 = '`>{formatKategori(s.material?.category)} · Avg {formatAvgCost(s.displayAvgCost, s.material?.unit || ``)}</p>'
$content = $content.Replace($old3, $new3)

# ── FIX 4: StokTokoContent avg display ──
$old4 = '{s.avg_cost > 0 && <p className="text-xs text-gray-300">· Avg {formatRupiah(s.avg_cost)}/{s.displayUnit}</p>}'
$new4 = '{s.avg_cost > 0 && <p className="text-xs text-gray-300">· Avg {formatAvgCost(s.avg_cost, s.displayUnit)}</p>}'
$content = $content.Replace($old4, $new4)

# ── FIX 5: MaterialForm handleSave — sync avg_cost ──
$old5 = @'
      const data: Material = {
        id: material?.id || generateId(), name: name.trim(), category, unit,
        unit_cost: Number(unitCost), min_stock: Number(minStock),
        is_active: isActive, created_at: material?.created_at || now(), updated_at: now(),
      }
      await db.materials.put(data)
      const { error } = await supabase.from('materials').upsert(data)
'@
$new5 = @'
      const hasPurchaseHistory = ((material as any)?.total_qty_purchased || 0) > 0
      const data: any = {
        id: material?.id || generateId(), name: name.trim(), category, unit,
        unit_cost: Number(unitCost),
        avg_cost: hasPurchaseHistory ? (material as any)?.avg_cost : Number(unitCost),
        min_stock: Number(minStock),
        is_active: isActive, created_at: material?.created_at || now(), updated_at: now(),
      }
      await db.materials.put(data)
      const { error } = await supabase.from('materials').upsert(data)
'@
$content = $content.Replace($old5, $new5)

# ── FIX 6: PsEditForm — sync avg_cost ke Supabase ──
$old6 = "      await supabase.from('materials').update({ name: name.trim(), category, unit, unit_cost: Number(unitCost), min_stock: Number(minStock) }).eq('id', matId)"
$new6 = @'
      const hasHistoryPs = (mat as any)?.total_qty_purchased > 0
      const newAvgPs = hasHistoryPs ? (mat as any)?.avg_cost : Number(unitCost)
      await supabase.from('materials').update({ name: name.trim(), category, unit, unit_cost: Number(unitCost), avg_cost: newAvgPs, min_stock: Number(minStock) }).eq('id', matId)
'@
$content = $content.Replace($old6, $new6)

# ── FIX 7: EditStokTokoForm — sync avg_cost ke Supabase ──
$old7 = @'
      // Update material data kalau ada
      if (mat) {
        await db.materials.update(mat.id, { name: name.trim(), category, unit, unit_cost: Number(unitCost), min_stock: Number(minStock), updated_at: now() } as any)
        await supabase.from('materials').update({ name: name.trim(), category, unit, unit_cost: Number(unitCost), min_stock: Number(minStock) }).eq('id', mat.id)
      }
'@
$new7 = @'
      // Update material data kalau ada
      if (mat) {
        const hasHistoryToko = (mat as any)?.total_qty_purchased > 0
        const newAvgToko = hasHistoryToko ? (mat as any)?.avg_cost : Number(unitCost)
        await db.materials.update(mat.id, { name: name.trim(), category, unit, unit_cost: Number(unitCost), avg_cost: newAvgToko, min_stock: Number(minStock), updated_at: now() } as any)
        await supabase.from('materials').update({ name: name.trim(), category, unit, unit_cost: Number(unitCost), avg_cost: newAvgToko, min_stock: Number(minStock) }).eq('id', mat.id)
      }
'@
$content = $content.Replace($old7, $new7)

Set-Content $file $content -NoNewline
Write-Host "All fixes applied!"
