CREATE TABLE schema_versions (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
--> statement-breakpoint
INSERT INTO schema_versions(version, applied_at) VALUES (0, 0);
--> statement-breakpoint
INSERT INTO schema_versions(version, applied_at) VALUES (1, 0);
