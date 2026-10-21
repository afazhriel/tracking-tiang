<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ApiContractTest extends TestCase
{
    #[DataProvider('protectedEndpoints')]
    public function test_protected_endpoint_returns_401_without_a_token(string $method, string $path): void
    {
        $this->json($method, $path)->assertUnauthorized();
    }

    public static function protectedEndpoints(): array
    {
        $cases = [];
        foreach (self::contract() as $route) {
            if ($route['authenticated']) {
                $path = preg_replace('/\{[^}]+\}/', '1', $route['path']);
                $cases[$route['method'].' '.$route['path']] = [$route['method'], $path];
            }
        }

        return $cases;
    }

    public function test_documented_routes_and_authentication_match_the_application(): void
    {
        $actual = [];
        foreach (Route::getRoutes() as $route) {
            if (! str_starts_with($route->uri(), 'api/')) {
                continue;
            }
            foreach (array_diff($route->methods(), ['HEAD']) as $method) {
                $middleware = $route->gatherMiddleware();
                $actual[] = [
                    'method' => $method, 'path' => '/'.$route->uri(),
                    'authenticated' => in_array('auth:sanctum', $middleware, true),
                    'active_user' => in_array('active', $middleware, true),
                ];
            }
        }
        usort($actual, fn ($a, $b) => [$a['path'], $a['method']] <=> [$b['path'], $b['method']]);

        $this->assertSame(self::contract(), $actual);
    }

    private static function contract(): array
    {
        return json_decode(file_get_contents(dirname(__DIR__, 3).'/docs/api-routes.json'), true, flags: JSON_THROW_ON_ERROR);
    }
}
