<?php

namespace App\Http\Controllers;

use Illuminate\Foundation\Auth\Access\AuthorizesRequests;

abstract class Controller
{
    /*
     * Laravel 11+ tidak lagi menaruh trait ini di base controller,
     * tapi aplikasi ini butuh `$this->authorize()` di controller
     * existing (Project, Pole, WorkItem, Progress) supaya
     * authorization tidak hanya di frontend.
     */
    use AuthorizesRequests;
}
