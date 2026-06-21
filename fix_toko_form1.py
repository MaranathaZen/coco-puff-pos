with open('src/pages/stok/UnifiedStokPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update signature + tambah state isActive
old1 = """function EditStokTokoForm({ stock, onClose }: { stock: any; onClose: () => void }) {
  const materials = useLiveQuery(() => db.materials.filter(m => m.is_active).toArray(), [])
  const mat = materials?.find(m => m.id === stock.ingredient_id)

  const [name, setName] = useState(stock.displayName || '')
  const [category, setCategory] = useState('')
  const [unit, setUnit] = useState(stock.displayUnit || '')
  const [unitCost, setUnitCost] = useState('0')
  const [minStock, setMinStock] = useState('0')
  const [customUnit, setCustom] = useState(false)
  const [qty, setQty] = useState(String(stock.qty_on_hand || 0))
  const [avg, setAvg] = useState(String(stock.avg_cost || 0))
  const [saving, setSaving] = useState(false)"""

new1 = """function EditStokTokoForm({ stock, isOwner, onClose }: { stock: any; isOwner?: boolean; onClose: () => void }) {
  const materials = useLiveQuery(() => db.materials.filter(m => m.is_active).toArray(), [])
  const mat = materials?.find(m => m.id === stock.ingredient_id)

  const [name, setName] = useState(stock.displayName || '')
  const [category, setCategory] = useState('')
  const [unit, setUnit] = useState(stock.displayUnit || '')
  const [unitCost, setUnitCost] = useState('0')
  const [minStock, setMinStock] = useState('0')
  const [customUnit, setCustom] = useState(false)
  const [qty, setQty] = useState(String(stock.qty_on_hand || 0))
  const [avg, setAvg] = useState(String(stock.avg_cost || 0))
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)"""

content = content.replace(old1, new1)
print('1:', new1 in content)

# 2. Load is_active + tambah handleDelete
old2 = """    setCustom(!SATUAN.map(s => s.toLowerCase()).includes((mat.unit || '').toLowerCase()))
  }, [mat?.id])

  async function handleSave() {
    if (!name.trim()) return toast.error('Nama wajib diisi')
    if (!unit) return toast.error('Satuan wajib diisi')
    setSaving(true)
    try {
      // Update material data kalau ada
      if (mat) {"""

new2 = """    setCustom(!SATUAN.map(s => s.toLowerCase()).includes((mat.unit || '').toLowerCase()))
    setIsActive(mat.is_active ?? true)
  }, [mat?.id])

  async function handleDelete() {
    if (!mat) return
    if (!confirm(`Hapus permanen "${mat.name}"? Tindakan ini tidak bisa dibatalkan.`)) return
    setSaving(true)
    try {
      await db.stock.delete(stock.stockId)
      await supabase.from('stock').delete().eq('id', stock.stockId)
      await db.materials.delete(mat.id)
      await supabase.from('materials').delete().eq('id', mat.id)
      toast.success(`"${mat.name}" dihapus`)
      onClose()
    } catch (e) { toast.error('Gagal hapus: ' + String((e as any)?.message || e)) }
    finally { setSaving(false) }
  }

  async function handleSave() {
    if (!name.trim()) return toast.error('Nama wajib diisi')
    if (!unit) return toast.error('Satuan wajib diisi')
    setSaving(true)
    try {
      // Update material data kalau ada
      if (mat) {"""

content = content.replace(old2, new2)
print('2:', new2 in content)

with open('src/pages/stok/UnifiedStokPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
