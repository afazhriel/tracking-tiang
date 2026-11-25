<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Asisten AI Tracking Pekerjaan — mesin yang sama dengan AI Si Tani.
 *
 * Si Tani memakai klien OpenAI-compatible (Groq/NVIDIA) dengan kunci
 * dari env. Layanan ini memakai pola yang sama di Laravel: endpoint,
 * kunci, dan model dibaca dari env (AI_BASE_URL, AI_API_KEY,
 * AI_MODEL), tanpa menyimpan kunci di kode.
 *
 * Tanpa kunci yang dikonfigurasi, chat menjawab 503 yang jelas
 * (bukan 500) — persis pola "plumbed but inactive" di Si Tani.
 */
class AiAssistant
{
    private const SYSTEM_PROMPT = <<<'PROMPT'
Kamu adalah Asisten AI "Tracking Pekerjaan", sistem monitoring proyek pekerjaan lapangan.
Jawab dalam Bahasa Indonesia yang singkat, padat, dan langsung ke inti — gaya percakapan
kasual, bukan bahasa formal kaku. Jangan mengarang data: angka proyek, tiang, dan progres
hanya dari konteks yang diberikan di bawah. Tulis angka persis seperti di konteks,
tanpa menambahkan nol atau titik ribuan. Kalau data tidak ada di konteks, katakan
terus terang bahwa data itu tidak tersedia, jangan menebak.

Kamu bisa membantu:
- Menjelaskan progres proyek, membaca kurva S, dan menunjukkan titik yang tertinggal.
- Menjelaskan cara memakai fitur: proyek, lokasi & progres, tim, kurva S, laporan, surat job.
- Merangkum kondisi proyek untuk dilaporkan ke atasan.
- Menyarankan langkah berikutnya berdasarkan data (mis. titik mana yang belum mulai).

Jangan pernah mengubah data, menghapus, atau menjanjikan tindakan di sistem — kamu hanya
menjawab dan menjelaskan. Kalau user meminta perubahan data, arahkan ke menu yang tepat.
PROMPT;

    public function isConfigured(): bool
    {
        return (string) config('services.ai.key') !== ''
            && (string) config('services.ai.base_url') !== '';
    }

    /**
     * Konteks proyek yang sedang aktif (ringkas, supaya tidak
     * membengkakkan prompt): proyek, target, progres, titik, kurva.
     */
    public function projectContext(?int $projectId, int $userId): string
    {
        if ($projectId === null) {
            return 'Tidak ada proyek yang dipilih.';
        }

        $project = \App\Models\Project::query()
            ->withCount(['poles'])
            ->find($projectId);

        if (! $project) {
            return 'Proyek tidak ditemukan.';
        }

        $org = $project->organization?->name ?? '—';
        $poles = \App\Models\Pole::query()
            ->where('project_id', $project->id)
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        $done = (int) ($poles['selesai'] ?? 0);
        $total = (int) $project->poles_count;

        $lines = [
            'Proyek: '.$project->name.' ('.$project->code.')',
            'Organisasi: '.$org,
            'Periode: '.($project->start_date ?? '—').' s.d. '.($project->end_date ?? '—'),
            'Target: '.($project->target_quantity ?? '—').' '.($project->unit_code ?? ''),
            'Mode pencatatan: '.($project->progress_source ?? '—'),
            'Titik lokasi tercatat: '.$total.' (selesai 100%: '.$done.')',
        ];

        foreach ($poles as $status => $count) {
            $lines[] = '- status '.$status.': '.$count;
        }

        return implode("\n", $lines);
    }

    /**
     * @param  array<int, array{role: string, content: string}>  $history
     */
    public function chat(string $message, string $context, array $history = []): string
    {
        if (! $this->isConfigured()) {
            throw new RuntimeException('AI belum dikonfigurasi. Isi AI_API_KEY dan AI_BASE_URL di .env backend, lalu restart.');
        }

        $messages = [
            ['role' => 'system', 'content' => self::SYSTEM_PROMPT."\n\nKonteks proyek saat ini:\n".$context],
        ];

        foreach (array_slice($history, -10) as $turn) {
            $messages[] = [
                'role' => $turn['role'] === 'assistant' ? 'assistant' : 'user',
                'content' => (string) $turn['content'],
            ];
        }

        $messages[] = ['role' => 'user', 'content' => $message];

        $response = Http::timeout((int) config('services.ai.timeout', 45))
            ->withHeaders([
                'Authorization' => 'Bearer '.config('services.ai.key'),
                'Content-Type' => 'application/json',
            ])
            ->post(rtrim((string) config('services.ai.base_url'), '/').'/chat/completions', [
                'model' => config('services.ai.model', 'meta/llama-3.3-70b-instruct'),
                'messages' => $messages,
                'temperature' => 0.3,
                'max_tokens' => 800,
            ]);

        if ($response->status() === 401 || $response->status() === 403) {
            throw new RuntimeException('API key AI ditolak. Periksa konfigurasi backend.');
        }

        if ($response->status() === 429) {
            throw new RuntimeException('Kuota penyedia AI terlampaui. Coba kembali nanti.');
        }

        if (! $response->successful()) {
            throw new RuntimeException('Penyedia AI tidak menjawab (HTTP '.$response->status().'). Coba lagi.');
        }

        $reply = trim((string) ($response->json('choices.0.message.content') ?? ''));

        if ($reply === '') {
            throw new RuntimeException('Penyedia AI memberikan jawaban kosong. Silakan coba lagi.');
        }

        return $reply;
    }
}
