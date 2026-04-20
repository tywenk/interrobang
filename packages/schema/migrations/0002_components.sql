CREATE TABLE components (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  layer_json TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE component_refs (
  glyph_id TEXT NOT NULL REFERENCES glyphs(id) ON DELETE CASCADE,
  layer_id TEXT NOT NULL REFERENCES layers(id) ON DELETE CASCADE,
  component_id TEXT NOT NULL REFERENCES components(id) ON DELETE RESTRICT,
  PRIMARY KEY (glyph_id, layer_id, component_id)
);
--> statement-breakpoint
CREATE INDEX component_refs_by_component ON component_refs(component_id);
