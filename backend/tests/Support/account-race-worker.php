<?php

use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Contracts\Http\Kernel as HttpKernel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Tests\Support\IsolatedDatabase;

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
IsolatedDatabase::assertSafe($app, postgresOnly: true);
[$script, $actorId, $targetId, $name] = $argv;
if (! ctype_digit($actorId) || ! ctype_digit($targetId) || ! in_array($name, ['tracking-admin-race-a', 'tracking-admin-race-b', 'tracking-invite-race-a', 'tracking-invite-race-b'], true)) {
    exit(2);
}
DB::select("SELECT set_config('application_name', ?, false)", [$name]);
$action = $argv[4] ?? 'suspend';
if (! in_array($action, ['suspend', 'accept', 'revoke'], true)) {
    exit(2);
}
if ($action !== 'accept') {
    Auth::guard('sanctum')->setUser(User::findOrFail($actorId));
}
[$method, $url, $payload] = match ($action) {
    'accept' => ['POST', '/api/invitations/'.str_repeat('a', 64).'/accept', ['name' => 'Invited', 'password' => 'fixture-password', 'password_confirmation' => 'fixture-password']],
    'revoke' => ['DELETE', '/api/invitations/'.$targetId, []],
    default => ['PATCH', '/api/users/'.$targetId.'/status', ['status' => 'suspended']],
};
$request = Request::create($url, $method, server: [
    'CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json',
], content: json_encode($payload, JSON_THROW_ON_ERROR));
$response = $app->make(HttpKernel::class)->handle($request);
echo json_encode(['status' => $response->getStatusCode()], JSON_THROW_ON_ERROR);
