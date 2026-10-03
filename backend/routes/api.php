<?php

use App\Http\Controllers\Api\ProjectController;
use Illuminate\Support\Facades\Route;

Route::get('/projects', [ProjectController::class, 'index']);
Route::post('/projects', [ProjectController::class, 'store']);
Route::get('/projects/{project}', [ProjectController::class, 'show']);

Route::get('/projects/{project}/poles', [\App\Http\Controllers\Api\PoleController::class, 'index']);
Route::post('/projects/{project}/poles', [\App\Http\Controllers\Api\PoleController::class, 'store']);
Route::get('/projects/{project}/poles/{pole}', [\App\Http\Controllers\Api\PoleController::class, 'show']);

Route::get('/projects/{project}/work-items', [\App\Http\Controllers\Api\WorkItemController::class, 'index']);
Route::post('/projects/{project}/work-items', [\App\Http\Controllers\Api\WorkItemController::class, 'store']);
Route::get('/projects/{project}/work-items/{workItem}', [\App\Http\Controllers\Api\WorkItemController::class, 'show']);

Route::get('/projects/{project}/poles/{pole}/progress', [\App\Http\Controllers\Api\ProgressController::class, 'index']);
Route::post('/projects/{project}/poles/{pole}/progress', [\App\Http\Controllers\Api\ProgressController::class, 'store']);

Route::get('/projects/{project}/poles/{pole}/progress', [\App\Http\Controllers\Api\ProgressController::class, 'index']);
Route::post('/projects/{project}/poles/{pole}/progress', [\App\Http\Controllers\Api\ProgressController::class, 'store']);

Route::get('/projects/{project}/curve', [\App\Http\Controllers\Api\CurveController::class, 'show']);
