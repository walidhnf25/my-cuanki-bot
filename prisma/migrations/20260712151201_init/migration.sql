-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "wa_number" TEXT NOT NULL,
    "display_name" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "is_onboarded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_wa_number_key" ON "users"("wa_number");
