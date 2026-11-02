'use client'

export default function CurveBasisNotice({ curve }) {
  if (curve?.calculation_basis !== 'current_active_weights') return null
  const quality = curve.data_quality ?? {}
  const incomplete = (quality.scope_weights ?? []).filter(scope => Math.abs(Number(scope.total_weight) - 100) >= 0.01)
  const issues = [
    ...(incomplete.length ? [`${incomplete.length} tiang belum memiliki bobot pekerjaan lengkap (100%).`] : []),
    ...(quality.missing_weight_snapshots > 0 ? [`${quality.missing_weight_snapshots} catatan lama tanpa bobot historis.`] : []),
    ...(quality.records_before_project_start > 0 ? [`${quality.records_before_project_start} catatan dibuat sebelum tanggal mulai proyek.`] : []),
    ...(quality.current_matches_latest_history === false ? ['Progres terkini berbeda dari catatan historis terakhir.'] : []),
    ...(quality.plan_issues?.length > 0 ? ['Jadwal rencana perlu diperiksa.'] : []),
  ]

  return (
    <details className={issues.length
      ? 'rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900'
      : 'rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700'}>
      <summary className="cursor-pointer font-medium">
        {issues.length ? `Ada ${issues.length} informasi kualitas data` : 'Dasar perhitungan grafik'}
        <span className="ml-2 text-xs font-normal text-neutral-500">Lihat penjelasan</span>
      </summary>
      <p className="mt-2 leading-6">Realisasi dihitung dengan bobot pekerjaan aktif saat ini, bukan bobot asli tiap tanggal. Catatan lama tetap disimpan dan tidak diubah.</p>
      {issues.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
      <p className="mt-2 text-xs text-neutral-500">Jangan mengubah tanggal atau normalisasi bobot tanpa pemeriksaan dokumen proyek.</p>
    </details>
  )
}
