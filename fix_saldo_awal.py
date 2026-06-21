with open('src/pages/cashier/EndOfDayPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old = """          if (prev?.saldo_akhir != null && prev.saldo_akhir > 0) {
            setSaldoAwal(String(Math.max(0, prev.saldo_akhir)))
            toast.success(`Saldo awal Rp ${prev.saldo_akhir.toLocaleString('id-ID')} dari ${prev.report_date}`, { duration: 3000 })"""

new = """          if (prev?.uang_fisik != null && prev.uang_fisik > 0) {
            setSaldoAwal(String(Math.max(0, prev.uang_fisik)))
            toast.success(`Saldo awal Rp ${prev.uang_fisik.toLocaleString('id-ID')} dari ${prev.report_date} (uang fisik laci)`, { duration: 3000 })"""

content = content.replace(old, new)

# Update select query untuk ambil uang_fisik juga
content = content.replace(
    ".from('close_order_reports').select('saldo_akhir, report_date')",
    ".from('close_order_reports').select('saldo_akhir, uang_fisik, report_date')"
)

with open('src/pages/cashier/EndOfDayPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')
