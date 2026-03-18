-- CreateTable: datasets
CREATE TABLE IF NOT EXISTS "datasets" (
    "id"         TEXT        NOT NULL,
    "name"       TEXT        NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable: records
CREATE TABLE IF NOT EXISTS "records" (
    "id"         TEXT        NOT NULL,
    "dataset_id" TEXT        NOT NULL,
    "date"       TIMESTAMP(3) NOT NULL,
    "asset_name" TEXT        NOT NULL,
    "value"      DOUBLE PRECISION NOT NULL,
    "category"   TEXT        NOT NULL,
    CONSTRAINT "records_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "records"
    ADD CONSTRAINT "records_dataset_id_fkey"
    FOREIGN KEY ("dataset_id")
    REFERENCES "datasets"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
