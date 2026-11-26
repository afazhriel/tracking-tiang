<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hafi_events', function (Blueprint $table) {
            $table->string('event_id')->primary();
            $table->string('invoice_id')->nullable();
            $table->string('order_id')->nullable();
            $table->bigInteger('amount')->nullable();
            $table->string('outcome');
            $table->text('payload');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hafi_events');
    }
};
