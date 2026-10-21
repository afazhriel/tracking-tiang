<?php

use App\Http\Controllers\Api\ActivityController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CurveController;
use App\Http\Controllers\Api\InvitationController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PhotoController;
use App\Http\Controllers\Api\PoleAssignmentController;
use App\Http\Controllers\Api\PoleController;
use App\Http\Controllers\Api\PoleWorkItemController;
use App\Http\Controllers\Api\ProgressController;
use App\Http\Controllers\Api\ProjectController;
use App\Http\Controllers\Api\RegionController;
use App\Http\Controllers\Api\TeamController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\UserProfileController;
use App\Http\Controllers\Api\WorkItemController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Public routes
|--------------------------------------------------------------------------
*/

Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');

/*
 * Pendaftaran mandiri (self sign-up).
 * Akun dibuat dengan status `pending` + role default (pic);
 * admin menyetujui lewat `PATCH /api/users/{user}/status`.
 */
Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:login');

/*
 * Invitation preview/accept.
 * Tidak membutuhkan login.
 */
Route::get('/invitations/{token}', [InvitationController::class, 'show'])
    ->name('invitations.accept.show');

Route::post('/invitations/{token}/accept', [InvitationController::class, 'accept'])
    ->name('invitations.accept');

/*
|--------------------------------------------------------------------------
| Region / wilayah Indonesia
|--------------------------------------------------------------------------
|
| Endpoint master wilayah digunakan oleh form cascading:
| provinsi -> kabupaten/kota -> kecamatan -> desa/kelurahan.
|
| Endpoint ini public agar form dapat memuat master wilayah
| tanpa harus memiliki session/auth Sanctum terlebih dahulu.
|
*/

Route::get('/regions/provinces', [RegionController::class, 'provinces']);
Route::get('/regions/provinces/{province}/regencies', [RegionController::class, 'regencies']);
Route::get('/regions/regencies/{regency}/districts', [RegionController::class, 'districts']);
Route::get('/regions/districts/{district}/villages', [RegionController::class, 'villages']);

/*
 * Foto progress.
 * Public dengan ULID acak (img di browser tidak bisa kirim header
 * Authorization). Lihat PhotoController.
 */
Route::get('/photos/{ulid}', [PhotoController::class, 'show']);

/*
 * Avatar user — public karena `<img>` tidak bisa kirim header
 * Authorization. Lihat `UserProfileController::showAvatar`.
 */
Route::get('/user/avatar/{user}', [UserProfileController::class, 'showAvatar']);

/*
|--------------------------------------------------------------------------
| Protected routes
|--------------------------------------------------------------------------
*/

Route::middleware(['auth:sanctum', 'active'])->group(function () {

    /* Auth */
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::post('/logout-all', [UserProfileController::class, 'logoutAll']);
    Route::get('/me', [AuthController::class, 'me']);

    /* Profil sendiri — selalu menempel pada user yang login. */
    Route::get('/user/profile', [UserProfileController::class, 'show']);
    Route::put('/user/profile', [UserProfileController::class, 'update']);
    Route::put('/user/password', [UserProfileController::class, 'updatePassword']);
    Route::post('/user/avatar', [UserProfileController::class, 'updateAvatar']);
    Route::delete('/user/avatar', [UserProfileController::class, 'destroyAvatar']);

    /* Project */
    Route::get('/projects', [ProjectController::class, 'index']);
    Route::post('/projects', [ProjectController::class, 'store']);
    Route::get('/projects/{project}', [ProjectController::class, 'show']);

    /* Tiang / Pole */
    Route::get('/projects/{project}/poles', [PoleController::class, 'index']);
    Route::get('/projects/{project}/poles/summary', [PoleController::class, 'summary']);
    Route::post('/projects/{project}/poles', [PoleController::class, 'store']);
    Route::get('/projects/{project}/poles/{pole}', [PoleController::class, 'show']);

    /* Work Item */
    Route::get('/projects/{project}/work-items', [WorkItemController::class, 'index']);
    Route::post('/projects/{project}/work-items', [WorkItemController::class, 'store']);
    Route::post('/projects/{project}/work-items/normalize', [WorkItemController::class, 'normalize']);
    Route::get('/projects/{project}/work-items/{workItem}', [WorkItemController::class, 'show']);
    Route::put('/projects/{project}/work-items/{workItem}', [WorkItemController::class, 'update']);
    Route::patch('/projects/{project}/work-items/{workItem}', [WorkItemController::class, 'update']);
    Route::delete('/projects/{project}/work-items/{workItem}', [WorkItemController::class, 'destroy']);

    /* Pekerjaan independen per tiang. */
    Route::get('/projects/{project}/poles/{pole}/work-items', [PoleWorkItemController::class, 'index']);
    Route::post('/projects/{project}/poles/{pole}/work-items', [PoleWorkItemController::class, 'store']);
    Route::post('/projects/{project}/poles/{pole}/work-items/apply-template', [PoleWorkItemController::class, 'applyTemplate']);
    Route::put('/projects/{project}/poles/{pole}/work-items/{workItem}', [PoleWorkItemController::class, 'update']);
    Route::patch('/projects/{project}/poles/{pole}/work-items/{workItem}', [PoleWorkItemController::class, 'update']);
    Route::delete('/projects/{project}/poles/{pole}/work-items/{workItem}', [PoleWorkItemController::class, 'destroy']);

    /* Progress */
    Route::get('/projects/{project}/poles/{pole}/progress', [ProgressController::class, 'index']);
    Route::post('/projects/{project}/poles/{pole}/progress', [ProgressController::class, 'store']);

    /* Kurva S */
    Route::get('/projects/{project}/curve', [CurveController::class, 'show']);
    Route::get('/projects/{project}/poles/{pole}/curve', [CurveController::class, 'poleCurve']);

    /* Aktivitas lapangan — bersumber dari histori progress tiang. */
    Route::get('/projects/{project}/activities', [ActivityController::class, 'index']);

    /* Notifikasi tersimpan milik pengguna. */
    Route::get('/projects/{project}/notifications', [NotificationController::class, 'projectIndex']);
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead']);
    Route::post('/notifications/{notification}/read', [NotificationController::class, 'markRead']);

    /*
     * Team management.
     */
    Route::get('/teams', [TeamController::class, 'index']);
    Route::post('/teams', [TeamController::class, 'store']);
    Route::get('/teams/{team}', [TeamController::class, 'show']);
    Route::put('/teams/{team}', [TeamController::class, 'update']);
    Route::patch('/teams/{team}', [TeamController::class, 'update']);
    Route::post('/teams/{team}/members', [TeamController::class, 'addMember']);
    Route::delete('/teams/{team}/members/{user}', [TeamController::class, 'removeMember']);

    /*
     * Pole assignment.
     */
    Route::get('/users/{user}/poles', [PoleAssignmentController::class, 'index']);
    Route::post('/users/{user}/poles', [PoleAssignmentController::class, 'store']);
    Route::delete('/users/{user}/poles/{pole}', [PoleAssignmentController::class, 'destroy']);

    /*
     * User management.
     * Authorization tetap dilakukan di controller/policy,
     * bukan hanya dengan menyembunyikan route dari UI.
     */
    Route::get('/users', [UserController::class, 'index']);
    Route::get('/users/{user}', [UserController::class, 'show']);
    Route::put('/users/{user}', [UserController::class, 'update']);
    Route::patch('/users/{user}/status', [UserController::class, 'updateStatus']);
    Route::patch('/users/{user}/provinces', [UserController::class, 'updateProvinces']);

    /*
     * Invitation management.
     * Controller melakukan authorization admin.
     */
    Route::post('/invitations', [InvitationController::class, 'store']);
    Route::get('/invitations', [InvitationController::class, 'index']);
    Route::delete('/invitations/{invitation}', [InvitationController::class, 'destroy']);
});
