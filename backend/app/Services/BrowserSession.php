<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Cookie;

class BrowserSession
{
    public const COOKIE = '__Host-tracking_tiang_session';

    public function isBrowser(Request $request): bool
    {
        return $request->header('X-Tracking-Client') === 'browser';
    }

    public function login(Request $request, User $user, int $status = 200, array $extra = []): JsonResponse
    {
        $browser = $this->isBrowser($request);
        $expires = $browser ? now()->addHours(12) : null;
        $token = $user->createToken($browser ? 'browser' : ($request->input('device_name') ?: 'web'), ['*'], $expires);
        $response = response()->json($extra + [
            ...($browser ? ['authenticated' => true] : ['token' => $token->plainTextToken]),
            'token_type' => $browser ? 'Cookie' : 'Bearer',
            'user' => $user->toAuthPayload(),
        ], $status)->header('Cache-Control', 'private, no-store');

        return $browser ? $this->attach($response, $token->plainTextToken, $expires) : $response;
    }

    public function migrate(Request $request): JsonResponse
    {
        abort_unless($this->isBrowser($request), 422, 'Browser client header required.');
        $token = $request->user()->currentAccessToken();
        abort_unless($token instanceof PersonalAccessToken && $request->bearerToken(), 422, 'Bearer session required.');
        $expires = $token->expires_at && $token->expires_at->lt(now()->addHours(12)) ? $token->expires_at : now()->addHours(12);
        $token->forceFill(['expires_at' => $expires])->save();

        return $this->attach(response()->json(['authenticated' => true, 'token_type' => 'Cookie'])
            ->header('Cache-Control', 'private, no-store'), $request->bearerToken(), $expires);
    }

    private function attach(JsonResponse $response, string $token, \DateTimeInterface $expires): JsonResponse
    {
        $response->headers->setCookie(Cookie::create(self::COOKIE, $token, $expires, '/', null, true, true, false, Cookie::SAMESITE_STRICT));

        return $response;
    }

    public function forget(JsonResponse $response): JsonResponse
    {
        $response->headers->setCookie(Cookie::create(self::COOKIE, '', 1, '/', null, true, true, false, Cookie::SAMESITE_STRICT));

        return $response->header('Cache-Control', 'private, no-store');
    }
}
