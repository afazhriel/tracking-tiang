<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('provinces', function (Blueprint $table) {
            $table->string('id', 10)->primary();
            $table->string('name', 255);
            $table->decimal('latitude', 10, 7)->default(0);
            $table->decimal('longitude', 10, 7)->default(0);
            $table->timestamps();
        });

        Schema::create('regencies', function (Blueprint $table) {
            $table->string('id', 10)->primary();
            $table->string('province_id', 10);
            $table->string('name', 255);
            $table->decimal('latitude', 10, 7)->default(0);
            $table->decimal('longitude', 10, 7)->default(0);
            $table->timestamps();

            $table->foreign('province_id')
                ->references('id')
                ->on('provinces')
                ->cascadeOnDelete();

            $table->index('province_id');
        });

        Schema::create('districts', function (Blueprint $table) {
            $table->string('id', 10)->primary();
            $table->string('regency_id', 10);
            $table->string('name', 255);
            $table->decimal('latitude', 10, 7)->default(0);
            $table->decimal('longitude', 10, 7)->default(0);
            $table->timestamps();

            $table->foreign('regency_id')
                ->references('id')
                ->on('regencies')
                ->cascadeOnDelete();

            $table->index('regency_id');
        });

        Schema::create('villages', function (Blueprint $table) {
            $table->string('id', 10)->primary();
            $table->string('district_id', 10);
            $table->string('name', 255);
            $table->decimal('latitude', 10, 7)->default(0);
            $table->decimal('longitude', 10, 7)->default(0);
            $table->timestamps();

            $table->foreign('district_id')
                ->references('id')
                ->on('districts')
                ->cascadeOnDelete();

            $table->index('district_id');
        });

        Schema::table('poles', function (Blueprint $table) {
            $table->string('province_id', 10)->nullable();
            $table->string('regency_id', 10)->nullable();
            $table->string('district_id', 10)->nullable();
            $table->string('village_id', 10)->nullable();

            $table->foreign('province_id')
                ->references('id')
                ->on('provinces')
                ->nullOnDelete();

            $table->foreign('regency_id')
                ->references('id')
                ->on('regencies')
                ->nullOnDelete();

            $table->foreign('district_id')
                ->references('id')
                ->on('districts')
                ->nullOnDelete();

            $table->foreign('village_id')
                ->references('id')
                ->on('villages')
                ->nullOnDelete();

            $table->index(['province_id', 'regency_id', 'district_id', 'village_id']);
        });
    }

    public function down(): void
    {
        Schema::table('poles', function (Blueprint $table) {
            $table->dropForeign(['province_id']);
            $table->dropForeign(['regency_id']);
            $table->dropForeign(['district_id']);
            $table->dropForeign(['village_id']);

            $table->dropIndex([
                'province_id',
                'regency_id',
                'district_id',
                'village_id',
            ]);

            $table->dropColumn([
                'province_id',
                'regency_id',
                'district_id',
                'village_id',
            ]);
        });

        Schema::dropIfExists('villages');
        Schema::dropIfExists('districts');
        Schema::dropIfExists('regencies');
        Schema::dropIfExists('provinces');
    }
};
