-- PBXPuls Stage 9.2 Directory SQL Schema Design
--
-- Design-only migration skeleton.
-- This file is intentionally not registered in server/pbxpulsMigrations.ts.
-- Do not execute automatically until a later controlled migration stage.

CREATE TABLE IF NOT EXISTS directory_contacts (
  id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL DEFAULT '',
  company VARCHAR(255) NOT NULL DEFAULT '',
  phone VARCHAR(64) NOT NULL DEFAULT '',
  phone_normalized VARCHAR(32) NOT NULL DEFAULT '',
  phone2 VARCHAR(255) NOT NULL DEFAULT '',
  email VARCHAR(255) NOT NULL DEFAULT '',
  comment TEXT NULL,
  contact_type ENUM('common', 'personal') NOT NULL DEFAULT 'common',
  owner_user_id VARCHAR(64) NULL,
  visibility ENUM('shared', 'private') NULL,
  type ENUM('internal', 'client', 'supplier', 'government') NOT NULL DEFAULT 'client',
  is_spam TINYINT(1) NOT NULL DEFAULT 0,
  is_blacklisted TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  PRIMARY KEY (id),
  INDEX idx_directory_contacts_phone_normalized (phone_normalized),
  INDEX idx_directory_contacts_owner_user_id (owner_user_id),
  INDEX idx_directory_contacts_contact_type (contact_type),
  INDEX idx_directory_contacts_company (company),
  INDEX idx_directory_contacts_name (name),
  INDEX idx_directory_contacts_type_owner (contact_type, owner_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS directory_contact_metadata (
  id BIGINT NOT NULL AUTO_INCREMENT,
  contact_id VARCHAR(64) NOT NULL,
  metadata_key VARCHAR(100) NOT NULL,
  metadata_value TEXT NULL,
  metadata_json LONGTEXT NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_directory_contact_metadata_key (contact_id, metadata_key),
  INDEX idx_directory_contact_metadata_contact_id (contact_id),
  INDEX idx_directory_contact_metadata_key (metadata_key),
  CONSTRAINT fk_directory_contact_metadata_contact
    FOREIGN KEY (contact_id) REFERENCES directory_contacts (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
