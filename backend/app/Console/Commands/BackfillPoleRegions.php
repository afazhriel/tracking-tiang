<?php

namespace App\Console\Commands;

use App\Models\Region;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class BackfillPoleRegions extends Command
{
    protected $signature = 'tiang:backfill-regions';

    protected $description = 'Isi wilayah tiang otomatis dari provinsi (nama = provinsi, kode = kode BPS provinsi).';

    public function handle(): int
    {
        $pairs = DB::table('poles')
            ->join('provinces', 'provinces.id', '=', 'poles.province_id')
            ->whereNotNull('poles.province_id')
            ->whereNull('poles.region_id')
            ->select('poles.project_id', 'poles.province_id', 'provinces.name as province_name')
            ->distinct()
            ->get();

        if ($pairs->isEmpty()) {
            $this->info('Tidak ada tiang yang perlu diisi wilayah.');

            return self::SUCCESS;
        }

        $updated = 0;

        foreach ($pairs as $pair) {
            $region = Region::firstOrCreate(
                [
                    'project_id' => $pair->project_id,
                    'code' => (string) $pair->province_id,
                ],
                [
                    'name' => $pair->province_name,
                ]
            );

            $updated += DB::table('poles')
                ->where('project_id', $pair->project_id)
                ->where('province_id', $pair->province_id)
                ->whereNull('region_id')
                ->update(['region_id' => $region->id]);
        }

        $this->info("Wilayah tiang diperbarui: {$updated} baris.");

        return self::SUCCESS;
    }
}
