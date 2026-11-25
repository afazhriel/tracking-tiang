<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
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
         * Parameter rute yang berupa id model selalu numerik. Tanpa pola
         * ini, id seperti "abc" lolos ke query PostgreSQL dan meledak
         * sebagai error 500; dengan pola ini rute tidak cocok dan
         * Laravel menjawab 404.
         */
        foreach (['project', 'pole', 'user', 'team', 'workItem', 'baseline', 'assignment', 'invitation', 'notification'] as $param) {
            Route::pattern($param, '[0-9]+');
        }

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
         * Limiter untuk login/register. Dibatasi ganda: per IP dan per
         * email (mencegah brute-force satu akun dari banyak IP). Batas
         * per IP dilonggarkan (20/menit) atas permintaan user 25 Nov
         * 2026: satu kantor bisa berbagi satu IP publik, jadi batas
         * ketat membuat kegagalan login beberapa orang saling
         * mengunci. Perlindungan utama tetap di batas per email.
         */
        RateLimiter::for('login', function (Request $request) {
            $email = strtolower((string) $request->input('email'));

            return [
                Limit::perMinute(20)->by('login-ip:'.$request->ip()),
                Limit::perMinute(10)->by('login-email:'.$email),
            ];
        });
    }
}
