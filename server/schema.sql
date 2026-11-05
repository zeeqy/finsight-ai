-- FinSight AI Database Schema
-- Compatible with MySQL 5.7+ / MySQL 8.0+ / MariaDB (XAMPP)

CREATE DATABASE IF NOT EXISTS `finsight_ai` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `finsight_ai`;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `full_name` VARCHAR(150) NOT NULL,
  `email` VARCHAR(191) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `monthly_income` DECIMAL(12, 2) DEFAULT 0.00,
  `age` INT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Bank Statements Table
CREATE TABLE IF NOT EXISTS `bank_statements` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `filename` VARCHAR(255) NOT NULL,
  `uploaded_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_statements_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Transactions Table
CREATE TABLE IF NOT EXISTS `transactions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `statement_id` INT DEFAULT NULL,
  `user_id` INT NOT NULL,
  `txn_date` DATE NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `category` VARCHAR(100) NOT NULL DEFAULT 'Others',
  `category_source` VARCHAR(30) DEFAULT NULL, -- model | model_low_confidence | rules | sign | user
  `is_anomaly` TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_transactions_statement` FOREIGN KEY (`statement_id`) REFERENCES `bank_statements` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_transactions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Budgets Table
CREATE TABLE IF NOT EXISTS `budgets` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `category` VARCHAR(100) NOT NULL,
  `budget_limit` DECIMAL(12, 2) NOT NULL,
  `month` INT NOT NULL,
  `year` INT NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_user_cat_month_year` (`user_id`, `category`, `month`, `year`),
  CONSTRAINT `fk_budgets_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Chat Sessions Table
CREATE TABLE IF NOT EXISTS `chat_sessions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `started_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_chatsessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Chat Messages Table
CREATE TABLE IF NOT EXISTS `chat_messages` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `session_id` INT NOT NULL,
  `role` ENUM('user', 'assistant') NOT NULL,
  `content` TEXT NOT NULL,
  `sent_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_chatmessages_session` FOREIGN KEY (`session_id`) REFERENCES `chat_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Module 3 & 4 (added Oct 2026) ──
-- The server also creates these on startup (src/db.js) and seeds cost_templates.

ALTER TABLE `users` ADD COLUMN `income_group` ENUM('B40', 'M40', 'T20') NULL;

-- 7. Loan Predictions (Module 3)
CREATE TABLE IF NOT EXISTS `loan_predictions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `loan_type` ENUM('personal', 'car', 'house') NOT NULL,
  `interest_method` ENUM('flat', 'reducing') NOT NULL,
  `item_price` DECIMAL(12, 2) NOT NULL,
  `down_payment` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `loan_amount` DECIMAL(12, 2) NOT NULL,
  `interest_rate` FLOAT NOT NULL,
  `tenure_years` INT NOT NULL,
  `monthly_income` DECIMAL(10, 2) NOT NULL,
  `existing_commitments` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `employment_type` VARCHAR(30) DEFAULT NULL,
  `years_employed` FLOAT DEFAULT NULL,
  `dependants` INT DEFAULT 0,
  `age` INT DEFAULT NULL,
  `monthly_instalment` DECIMAL(10, 2) NOT NULL,
  `total_payment` DECIMAL(12, 2) NOT NULL,
  `total_interest` DECIMAL(12, 2) NOT NULL,
  `dsr` FLOAT NOT NULL,
  `dsr_band` VARCHAR(20) NOT NULL,
  `default_probability` FLOAT DEFAULT NULL,
  `risk_level` VARCHAR(20) DEFAULT NULL,
  `risk_source` VARCHAR(30) DEFAULT NULL,
  `risk_counts` BOOLEAN NOT NULL DEFAULT TRUE, -- false = score outside the model's training range (reference only)
  `overall_verdict` VARCHAR(20) NOT NULL,
  `predicted_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_loanpred_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. Life Goals (Module 4)
CREATE TABLE IF NOT EXISTS `life_goals` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `goal_type` ENUM('kahwin', 'children', 'haji', 'house', 'car', 'custom') NOT NULL,
  `title` VARCHAR(150) NOT NULL,
  `target_amount` DECIMAL(12, 2) NOT NULL,
  `current_saved` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `target_date` DATE NOT NULL,
  `savings_vehicle` ENUM('piggybank', 'savings', 'tabung_haji', 'asb', 'gold') NOT NULL DEFAULT 'piggybank',
  `expected_rate` FLOAT DEFAULT NULL,
  `required_monthly` DECIMAL(10, 2) DEFAULT NULL,
  `feasibility` VARCHAR(20) DEFAULT NULL,
  `asset_price` DECIMAL(12, 2) DEFAULT NULL,
  `loan_rate` FLOAT DEFAULT NULL,
  `loan_tenure_months` INT DEFAULT NULL,
  `est_monthly_instalment` DECIMAL(10, 2) DEFAULT NULL,
  `projected_dsr` FLOAT DEFAULT NULL,
  `status` ENUM('active', 'completed', 'paused') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_goals_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. Goal Cost Items
CREATE TABLE IF NOT EXISTS `goal_cost_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `goal_id` INT NOT NULL,
  `item_name` VARCHAR(150) NOT NULL,
  `estimated_cost` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  CONSTRAINT `fk_costitems_goal` FOREIGN KEY (`goal_id`) REFERENCES `life_goals` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. Goal Contributions
CREATE TABLE IF NOT EXISTS `goal_contributions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `goal_id` INT NOT NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `contributed_at` DATE NOT NULL,
  CONSTRAINT `fk_contrib_goal` FOREIGN KEY (`goal_id`) REFERENCES `life_goals` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11. Cost Templates (seed data, see src/data/costTemplates.js for figures + sources)
CREATE TABLE IF NOT EXISTS `cost_templates` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `goal_type` VARCHAR(20) NOT NULL,
  `income_group` ENUM('B40', 'M40', 'T20', 'ALL') NOT NULL DEFAULT 'ALL',
  `item_name` VARCHAR(150) NOT NULL,
  `default_cost` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `source` VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 12. Insurance Predictions (Module 5)
-- region from the original spec is not stored: the dataset's regions are US-only, so the model does not use it
CREATE TABLE IF NOT EXISTS `insurance_predictions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `age` INT NOT NULL,
  `height_cm` FLOAT DEFAULT NULL,
  `weight_kg` FLOAT DEFAULT NULL,
  `bmi` FLOAT NOT NULL,
  `smoker` BOOLEAN NOT NULL,
  `children` INT NOT NULL DEFAULT 0,
  `risk_score` FLOAT NOT NULL,
  `risk_tier` VARCHAR(20) NOT NULL,
  `shap_values` JSON NOT NULL,
  `predicted_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_inspred_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Saved monthly commitments (loans, PTPTN, card, takaful), read by the financial profile
CREATE TABLE IF NOT EXISTS `commitments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `kind` ENUM('car_loan','house_loan','personal_loan','ptptn','credit_card','insurance','other') NOT NULL,
  `label` VARCHAR(100) NOT NULL,
  `monthly_amount` DECIMAL(10,2) NOT NULL,
  `balance` DECIMAL(12,2) DEFAULT NULL,
  `annual_rate` FLOAT DEFAULT NULL,
  `end_date` DATE DEFAULT NULL,
  `paid_from_statement` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_commit_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Recurring payments the user confirmed or hid (Phase 2)
CREATE TABLE IF NOT EXISTS `recurring_overrides` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `merchant_key` VARCHAR(100) NOT NULL,
  `status` ENUM('confirmed','dismissed') NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_recurring_user_key` (`user_id`, `merchant_key`),
  CONSTRAINT `fk_recurring_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
