export default function CurveBasisNotice({ curve }) {
  if (curve?.calculation_basis !== 'current_active_weights') return null
  const quality = curve.data_quality ?? {}
  const unbalanced = (quality.scope_weights ?? []).filter((scope) => Math.abs(scope.total_weight - 100) >= 0.01)
  return <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-neutral-800" role="note">
    <p>Realisasi pada setiap tanggal dihitung ulang dengan bobot pekerjaan aktif saat ini. Perubahan bobot dapat mengubah garis ini; catatan realisasi asli tetap disimpan.</p>
    {unbalanced.length > 0 && <p>{unbalanced.length} tiang memiliki total bobot aktif belum 100%. Periksa kelengkapan pekerjaan sebelum menormalkan bobot.</p>}
    {quality.missing_weight_snapshots > 0 && <p>{quality.missing_weight_snapshots} catatan lama tidak memiliki bobot historis. Bobot historis tidak diisi dengan perkiraan.</p>}
    {quality.records_before_project_start > 0 && <p>{quality.records_before_project_start} catatan tercatat sebelum tanggal mulai proyek. Periksa tanggal sumber.</p>}
    {quality.current_matches_latest_history === false && <p>Progres tersimpan berbeda dengan histori terakhir. Perlu rekonsiliasi catatan.</p>}
    {quality.plan_issues?.length > 0 && <p>Kalender rencana belum valid: periksa tanggal proyek dan rentang bulan pekerjaan.</p>}
  </div>
}
