-- CreateTable
CREATE TABLE `connector_db_metadata` (
    `connector_id` CHAR(36) NOT NULL,
    `introspected_schema` JSON NULL,
    `introspected_at` DATETIME(3) NULL,
    `er_diagram_draft` JSON NULL,
    `er_diagram_published` JSON NULL,
    `er_published_version` INTEGER NULL,
    `er_published_at` DATETIME(3) NULL,

    PRIMARY KEY (`connector_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `connector_db_metadata` ADD CONSTRAINT `connector_db_metadata_connector_id_fkey` FOREIGN KEY (`connector_id`) REFERENCES `connector`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
