<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Penerima webhook HAFI Pay untuk Tracking Pekerjaan.
 *
 * Menerima event payment.paid dari pay.hafi.digital, memverifikasi tanda
 * tangan HMAC atas isi mentah, lalu mencatat event (anti-duplikat) untuk
 * audit. Tracking Pekerjaan belum punya model pembayaran, jadi belum ada
 * aksi bisnis yang dipicu oleh event ini.
 */
class HafiWebhookController extends Controller
{
    public function handle(Request $request): JsonResponse
    {
        $secret = (string) env('HAFI_WEBHOOK_SECRET', '');
        if ($secret === '') {
            return response()->json(['detail' => 'Penerima webhook belum dikonfigurasi.'], 503);
        }

        $body = $request->getContent();
        $timestamp = (string) $request->header('X-Hafi-Timestamp', '');
        $signature = (string) $request->header('X-Hafi-Signature', '');
        if (! $this->verify($secret, $timestamp, $body, $signature)) {
            return response()->json(['detail' => 'Tanda tangan tidak valid.'], 401);
        }

        $event = json_decode($body, true);
        if (! is_array($event)) {
            return response()->json(['detail' => 'Isi tidak valid.'], 422);
        }

        $eventId = (string) $request->header('X-Hafi-Event-Id', '');
        if ($eventId === '' || ($event['id'] ?? null) !== $eventId || ($event['type'] ?? null) !== 'payment.paid') {
            return response()->json(['detail' => 'Event tidak dikenali.'], 422);
        }
        if (($event['app_id'] ?? null) !== 'tracking-pekerjaan' || ($event['currency'] ?? null) !== 'IDR') {
            return response()->json(['detail' => 'Event bukan untuk aplikasi ini.'], 422);
        }
        if (($event['environment'] ?? 'live') !== env('HAFI_ENVIRONMENT', 'live')) {
            return response()->json(['detail' => 'Lingkungan transaksi berbeda.'], 409);
        }

        if (DB::table('hafi_events')->where('event_id', $eventId)->exists()) {
            return response()->json(['received' => true, 'duplicate' => true]);
        }

        try {
            DB::table('hafi_events')->insert([
                'event_id' => $eventId,
                'invoice_id' => isset($event['invoice_id']) ? (string) $event['invoice_id'] : null,
                'order_id' => isset($event['order_id']) ? (string) $event['order_id'] : null,
                'amount' => isset($event['amount']) && is_int($event['amount']) ? $event['amount'] : null,
                'outcome' => 'recorded',
                'payload' => $body,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } catch (QueryException $e) {
            // Pengiriman ganda yang bersamaan: baris sudah tercatat.
            return response()->json(['received' => true, 'duplicate' => true]);
        }

        return response()->json(['received' => true, 'outcome' => 'recorded']);
    }

    private function verify(string $secret, string $timestamp, string $body, string $signature): bool
    {
        if (! preg_match('/^[0-9]+$/', $timestamp) || (string) (int) $timestamp !== $timestamp) {
            return false;
        }
        if (abs(time() - (int) $timestamp) > 300) {
            return false;
        }
        $expected = hash_hmac('sha256', $timestamp.'.'.$body, $secret);

        return hash_equals($expected, $signature);
    }
}
