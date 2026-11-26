<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        /*
         * Limiter umum untuk seluruh grup `api`. Dikunci per user bila
         * sudah terautentikasi, kalau belum per IP. 120 permintaan per
         * menit cukup longgar untuk polling notifikasi (60 detik) dan
         * navigasi normal, tapi tetap membatasi penyalahgunaan.
         */
        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(120)->by(
                $request->user()?->getAuthIdentifier() ?: $request->ip()
            );
        });

        /*
         * Limiter ketat untuk login/register. Dibatasi ganda: per IP
         * (mencegah banyak akun dari satu sumber) dan per email
         * (mencegah brute-force satu akun dari banyak IP).
         */
        RateLimiter::for('login', function (Request $request) {
            $email = strtolower((string) $request->input('email'));

            return [
                Limit::perMinute(5)->by('login-ip:'.$request->ip()),
                Limit::perMinute(10)->by('login-email:'.$email),
            ];
        });
    }
}
