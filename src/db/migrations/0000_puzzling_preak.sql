CREATE TABLE `accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(100) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`role` enum('super_admin','school_admin','teacher') NOT NULL DEFAULT 'teacher',
	`school_id` int,
	`must_change_password` boolean NOT NULL DEFAULT false,
	`auth_version` int unsigned NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_accounts_username` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `classes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`school_id` int NOT NULL,
	`teacher_account_id` int NOT NULL,
	`class_name` varchar(100) NOT NULL,
	`grade_level` varchar(20),
	`academic_year` varchar(20),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `classes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `interactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`session_id` int,
	`object_id` int,
	`interaction_type` varchar(30) NOT NULL,
	`gaze_duration` float,
	`timestamp` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `interactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `objects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`object_code` varchar(100) NOT NULL,
	`object_name` varchar(150) NOT NULL,
	`geometry_label` varchar(100) NOT NULL,
	`description` text,
	`formula` varchar(255),
	`cultural_context` text,
	CONSTRAINT `objects_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_objects_code` UNIQUE(`object_code`)
);
--> statement-breakpoint
CREATE TABLE `predictions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`session_id` int,
	`object_id` int,
	`predicted_label` varchar(100) NOT NULL,
	`confidence_score` float NOT NULL,
	`is_correct` tinyint,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `predictions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quiz_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`session_id` int,
	`question_id` varchar(100) NOT NULL,
	`answer` varchar(255) NOT NULL,
	`is_correct` tinyint NOT NULL,
	`response_time` float,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `quiz_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `schools` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`code` varchar(30),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `schools_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_schools_code` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`student_id` int,
	`school_id` int,
	`class_id` int,
	`write_token_hash` varchar(64),
	`scene_name` varchar(100) NOT NULL,
	`started_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`ended_at` datetime,
	`duration_seconds` int,
	`device_type` varchar(20),
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` int AUTO_INCREMENT NOT NULL,
	`school_id` int NOT NULL,
	`class_id` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`student_number` varchar(50) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`auth_version` int unsigned NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `students_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_student_number_per_school` UNIQUE(`school_id`,`student_number`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`role` varchar(20),
	`school_id` int,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `classes` ADD CONSTRAINT `classes_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `classes` ADD CONSTRAINT `classes_teacher_account_id_accounts_id_fk` FOREIGN KEY (`teacher_account_id`) REFERENCES `accounts`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `interactions` ADD CONSTRAINT `interactions_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `interactions` ADD CONSTRAINT `interactions_object_id_objects_id_fk` FOREIGN KEY (`object_id`) REFERENCES `objects`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `predictions` ADD CONSTRAINT `predictions_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `predictions` ADD CONSTRAINT `predictions_object_id_objects_id_fk` FOREIGN KEY (`object_id`) REFERENCES `objects`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `quiz_results` ADD CONSTRAINT `quiz_results_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `students` ADD CONSTRAINT `students_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `students` ADD CONSTRAINT `students_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX `idx_accounts_school` ON `accounts` (`school_id`);--> statement-breakpoint
CREATE INDEX `idx_classes_school` ON `classes` (`school_id`);--> statement-breakpoint
CREATE INDEX `idx_classes_teacher` ON `classes` (`teacher_account_id`);--> statement-breakpoint
CREATE INDEX `idx_interactions_session` ON `interactions` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_interactions_object` ON `interactions` (`object_id`);--> statement-breakpoint
CREATE INDEX `idx_predictions_session` ON `predictions` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_predictions_object` ON `predictions` (`object_id`);--> statement-breakpoint
CREATE INDEX `idx_quiz_results_session` ON `quiz_results` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_quiz_results_question` ON `quiz_results` (`question_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_student` ON `sessions` (`student_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_school` ON `sessions` (`school_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_class` ON `sessions` (`class_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_started` ON `sessions` (`started_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_report_scope` ON `sessions` (`school_id`,`class_id`,`student_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_students_class` ON `students` (`class_id`);--> statement-breakpoint
CREATE INDEX `idx_users_school` ON `users` (`school_id`);