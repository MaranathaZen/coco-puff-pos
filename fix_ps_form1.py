with open('src/pages/stok/UnifiedStokPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update PsEditForm signature + tambah state isActive + handleDelete
old = """function PsEditForm({ ps, onClose }: { ps: any; onClose: () => void }) {
  const materials = useLiveQuery(() => db.materials.filter(m => m.is_active).toArray(), [])
  const mat = materials?.find(m => m.id === ps?.material_id)

  const [matId, setMatId] = useState(ps?.material_id || '')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('bahan_baku')
  const [unit, setUnit] = useState('')
  const [unitCost, setUnitCost] = useState('0')
  const [minStock, setMinStock] = useState('0')
  const [customUnit, setCustom] = useState(false)
  const [qty, setQty] = useState(String(ps?.qty_on_hand || ''))
  const [avg, setAvg] = useState(String((ps as any)?.avg_cost || ''))
  const [saving, setSaving] = useState(false)"""

new = """function PsEditForm({ ps, isOwner, onClose }: { ps: any; isOwner?: boolean; onClose: () => void }) {
  const materials = useLiveQuery(() => db.materials.filter(m => m.is_active).toArray(), [])
  const mat = materials?.find(m => m.id === ps?.material_id)

  const [matId, setMatId] = useState(ps?.material_id || '')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('bahan_baku')
  const [unit, setUnit] = useState('')
  const [unitCost, setUnitCost] = useState('0')
  const [minStock, setMinStock] = useState('0')
  const [customUnit, setCustom] = useState(false)
  const [qty, setQty] = useState(String(ps?.qty_on_hand || ''))
  const [avg, setAvg] = useState(String((ps as any)?.avg_cost || ''))
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)"""
content = content.replace(old, new)
print('1:', new in content)

# 2. Load is_active dari mat di useEffect
old = """    setCustom(!SATUAN.map(s => s.toLowerCase()).includes((mat.unit || '').toLowerCase()))
  }, [mat?.id])

  async function handleSave() {
    if (!matId) return toast.error('Pilih bahan')"""
new = """    setCustom(!SATUAN.map(s => s.toLowerCase()).includes((mat.unit || '').toLowerCase()))
    setIsActive(mat.is_active ?? true)
  }, [mat?.id])

  async function handleDelete() {
    if (!matId || !mat) return
    if (!confirm(`Hapus permanen "${mat.name}"? Tindakan ini tidak bisa dibatalkan.`)) return
    setSaving(true)
    try {
      await db.production_stock.where('material_id').equals(matId).delete()
      await supabase.from('production_stock').delete().eq('material_id', matId)
      await db.materials.delete(matId)
      await supabase.from('materials').delete().eq('id', matId)
      toast.success(`"${mat.name}" dihapus`)
      onClose()
    } catch (e) { toast.error('Gagal hapus: ' + String((e as any)?.message || e)) }
    finally { setSaving(false) }
  }

  async function handleSave() {
    if (!matId) return toast.error('Pilih bahan')"""
content = content.replace(old, new)
print('2:', new in content)

with open('src/pages/stok/UnifiedStokPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
