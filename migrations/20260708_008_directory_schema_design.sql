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

-- Stage 9.2.1 custom field definitions.
-- Users can create domain-specific Directory columns such as:
-- pet_name, pet_type, pet_breed, car_model, vin, plate_number,
-- birth_date, policy_number.
-- Supported field_type values:
-- string, text, number, date, boolean, select, phone, email.
-- Visibility values:
-- common: visible to all users that can see the contact.
-- personal: available only to the owner of a personal contact.
-- private: visible only to the owner/private field context.
CREATE TABLE IF NOT EXISTS directory_custom_fields (
  id VARCHAR(64) NOT NULL,
  field_key VARCHAR(100) NOT NULL,
  field_name VARCHAR(255) NOT NULL,
  field_type ENUM('string', 'text', 'number', 'date', 'boolean', 'select', 'phone', 'email') NOT NULL DEFAULT 'string',
  entity_type VARCHAR(64) NOT NULL DEFAULT 'directory_contact',
  is_required TINYINT(1) NOT NULL DEFAULT 0,
  is_visible TINYINT(1) NOT NULL DEFAULT 1,
  visibility ENUM('common', 'personal', 'private') NOT NULL DEFAULT 'common',
  sort_order INT NOT NULL DEFAULT 100,
  show_in_card TINYINT(1) NOT NULL DEFAULT 1,
  show_in_search TINYINT(1) NOT NULL DEFAULT 0,
  show_in_caller_popup TINYINT(1) NOT NULL DEFAULT 0,
  created_by VARCHAR(64) NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_directory_custom_fields_key (entity_type, field_key),
  INDEX idx_directory_custom_fields_entity (entity_type),
  INDEX idx_directory_custom_fields_visibility (visibility),
  INDEX idx_directory_custom_fields_sort_order (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Stage 9.2.1 custom field values and preserved legacy metadata.
-- Designed custom fields should use field_id + value.
-- Legacy JSON details can temporarily use metadata_key, metadata_value,
-- and metadata_json until promoted to directory_custom_fields.
CREATE TABLE IF NOT EXISTS directory_contact_metadata (
  id BIGINT NOT NULL AUTO_INCREMENT,
  contact_id VARCHAR(64) NOT NULL,
  field_id VARCHAR(64) NULL,
  value LONGTEXT NULL,
  metadata_key VARCHAR(100) NULL,
  metadata_value TEXT NULL,
  metadata_json LONGTEXT NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_directory_contact_metadata_field (contact_id, field_id),
  UNIQUE KEY uniq_directory_contact_metadata_key (contact_id, metadata_key),
  INDEX idx_directory_contact_metadata_contact_id (contact_id),
  INDEX idx_directory_contact_metadata_field_id (field_id),
  INDEX idx_directory_contact_metadata_key (metadata_key),
  CONSTRAINT fk_directory_contact_metadata_contact
    FOREIGN KEY (contact_id) REFERENCES directory_contacts (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_directory_contact_metadata_field
    FOREIGN KEY (field_id) REFERENCES directory_custom_fields (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
