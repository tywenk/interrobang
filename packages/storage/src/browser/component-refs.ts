/**
 * TODO(components): helpers for reading/writing the `components` and
 * `component_refs` tables will live here. The tables exist as of migration
 * 0002; no code uses them yet. See
 * docs/superpowers/plans/2026-04-19-maintainability-rfc.md for the
 * forward-compat design notes.
 */
export const COMPONENT_REFS_TABLE = 'component_refs' as const;
export const COMPONENTS_TABLE = 'components' as const;
