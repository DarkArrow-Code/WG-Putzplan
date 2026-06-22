-- schema.sql
-- Drop tables if they exist
DROP TABLE IF EXISTS weekly_assignments;
DROP TABLE IF EXISTS absences;
DROP TABLE IF EXISTS task_templates;
DROP TABLE IF EXISTS users;

-- Users table
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    is_setup BOOLEAN DEFAULT 0,
    floor TEXT NOT NULL DEFAULT 'OG1' -- 'OG1' or 'OG2' or 'EG'
);

-- Task Templates
CREATE TABLE task_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL DEFAULT 'weekly', -- 'weekly' or 'monthly'
    default_priority INTEGER NOT NULL DEFAULT 5, -- Lower number = higher priority
    floor_restriction TEXT -- 'OG1', 'OG2', 'EG' or NULL
);

-- Absences
CREATE TABLE absences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    start_date TEXT NOT NULL, -- YYYY-MM-DD format
    end_date TEXT NOT NULL,   -- YYYY-MM-DD format
    FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Weekly Assignments
CREATE TABLE weekly_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    week_start_date TEXT NOT NULL, -- YYYY-MM-DD (Monday of the week)
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'completed'
    current_priority INTEGER NOT NULL,
    FOREIGN KEY(task_id) REFERENCES task_templates(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Insert initial tasks
-- 1. Floor-specific bathroom tasks (Priority 1)
INSERT INTO task_templates (title, description, type, default_priority, floor_restriction) VALUES
('Bad OG1 (Klo & Waschbecken)', 'Badezimmer im 1. OG putzen (nur Toilette und Waschbecken).', 'weekly', 1, 'OG1'),
('Bad OG1 Spezial (inkl. Dusche & Spiegel)', 'Badezimmer im 1. OG gründlich putzen (Toilette, Waschbecken, Dusche und Spiegel).', 'weekly', 1, 'OG1'),
('Bad OG2 (Klo & Waschbecken)', 'Badezimmer im 2. OG putzen (nur Toilette und Waschbecken).', 'weekly', 1, 'OG2'),
('Bad OG2 Spezial (inkl. Dusche & Spiegel)', 'Badezimmer im 2. OG gründlich putzen (Toilette, Waschbecken, Dusche und Spiegel).', 'weekly', 1, 'OG2');

-- 2. General weekly tasks (Priority 2)
INSERT INTO task_templates (title, description, type, default_priority, floor_restriction) VALUES
('Treppenhaus saugen', 'Treppenhaus komplett saugen (vom Dachgeschoss bis zum Keller).', 'weekly', 2, NULL),
('Küchenoberflächen', 'Arbeitsplatten, Herd und Spüle gründlich wischen und aufräumen.', 'weekly', 2, NULL),
('Bad EG', 'Gästebad im Erdgeschoss putzen (Klo, Waschbecken und Spiegel).', 'weekly', 2, NULL);

-- 3. Monthly tasks (Priority 3)
INSERT INTO task_templates (title, description, type, default_priority, floor_restriction) VALUES
('Kühlschrank ausräumen & wischen', 'Alle Fächer des Kühlschranks leeren, abgelaufene Lebensmittel entsorgen und Fächer auswischen.', 'monthly', 3, NULL),
('Backofen putzen', 'Backofen mit Ofenreiniger einsprühen, einwirken lassen und gründlich säubern.', 'monthly', 3, NULL),
('Abzugshaube putzen', 'Fettfilter der Dunstabzugshaube reinigen/waschen und Gehäuse abwischen.', 'monthly', 3, NULL),
('Treppenhaus wischen', 'Treppenhaus nass wischen (vom Dachgeschoss bis zum Keller).', 'monthly', 3, NULL);

-- Create unique index to prevent duplicate task assignments per week
CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_assignments_task_week ON weekly_assignments (task_id, week_start_date);
