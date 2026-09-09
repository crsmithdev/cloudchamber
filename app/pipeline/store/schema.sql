-- Fog Belt store. Read by both runtimes: Python (extract/) writes sources,
-- stories, passages and facet_fit; TypeScript (app/) owns the rest.
-- SQLite is the working store and is rebuildable from sources/ plus
-- bank/verdicts.jsonl and bank/themes.jsonl.
--
-- Every statement is IF NOT EXISTS, so this file only creates. Changes to an
-- existing table go through the user_version migration in store/db.ts, which
-- the TypeScript side owns; bump SCHEMA_VERSION there and in extract/store.py.

CREATE TABLE IF NOT EXISTS sources (
  id        TEXT PRIMARY KEY,
  path      TEXT NOT NULL,
  reader    TEXT NOT NULL,
  genre     TEXT NOT NULL,
  author    TEXT NOT NULL DEFAULT '',
  license   TEXT NOT NULL DEFAULT '',
  dev       INTEGER NOT NULL DEFAULT 0,
  read_at   TEXT
);

CREATE TABLE IF NOT EXISTS stories (
  id        TEXT PRIMARY KEY,          -- <source_id>/<slug>
  source_id TEXT NOT NULL REFERENCES sources(id),
  ord       INTEGER NOT NULL,          -- position in the source
  title     TEXT NOT NULL,
  author    TEXT NOT NULL DEFAULT '',
  genre     TEXT NOT NULL,
  words     INTEGER NOT NULL,
  text      TEXT NOT NULL,             -- prose blocks joined by blank lines
  locator   TEXT NOT NULL DEFAULT '',  -- pages or file
  split_by  TEXT NOT NULL DEFAULT ''   -- outline | cues | manifest | single
);

CREATE TABLE IF NOT EXISTS passages (
  id        TEXT PRIMARY KEY,          -- hash(story_id, normalised text)
  story_id  TEXT NOT NULL REFERENCES stories(id),
  text      TEXT NOT NULL,
  words     INTEGER NOT NULL,
  stratum   INTEGER NOT NULL,
  position  REAL NOT NULL,             -- 0..1 within the story
  seed      INTEGER NOT NULL,
  withheld  INTEGER NOT NULL DEFAULT 0,
  suspect   TEXT,                      -- JSON array of artifact-screen reasons, NULL when clean
  d1 REAL, d2 REAL, d3 REAL, d4 REAL, d5 REAL, d6 REAL,
  voice     TEXT,                      -- tercile label on d1
  mode      TEXT,                      -- tercile label on d2
  first_seen TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS passages_story ON passages(story_id);

CREATE TABLE IF NOT EXISTS facet_fit (
  id        INTEGER PRIMARY KEY CHECK (id = 1),
  backend   TEXT NOT NULL,
  n         INTEGER NOT NULL,
  stats     TEXT NOT NULL,             -- JSON: feature and dimension means/sds, terciles
  fitted_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS themes (
  id           TEXT PRIMARY KEY,       -- hash(normalised sentence)
  text         TEXT NOT NULL,
  attestation  INTEGER NOT NULL DEFAULT 1,
  stories      TEXT NOT NULL,          -- JSON array of story ids
  embedding    BLOB,
  drafted_at   TEXT NOT NULL,
  duplicate_of TEXT REFERENCES themes(id)
);

CREATE TABLE IF NOT EXISTS theme_drafts (        -- one row per story drafted
  story_id   TEXT PRIMARY KEY,
  at         TEXT NOT NULL,
  drafted    INTEGER NOT NULL,
  banked     INTEGER NOT NULL,
  attested   INTEGER NOT NULL,             -- rows folded into an existing theme
  rejected   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS theme_failures (      -- one row per story draftAll gave up on
  story_id TEXT PRIMARY KEY,
  stage    TEXT NOT NULL,
  reason   TEXT NOT NULL,                   -- shape, refusal or error
  error    TEXT NOT NULL,
  at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS theme_rejections (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id TEXT NOT NULL,
  text     TEXT NOT NULL,
  reason   TEXT NOT NULL,
  at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS verdicts (                -- replay of bank/verdicts.jsonl
  id               TEXT PRIMARY KEY,
  kind             TEXT NOT NULL CHECK (kind IN ('example','theme','brief','story','finding','draft')),
  target_id        TEXT NOT NULL,
  verdict          TEXT NOT NULL CHECK (verdict IN ('keep','pass')),
  artifact         INTEGER NOT NULL DEFAULT 0,
  note             TEXT NOT NULL DEFAULT '',
  method           TEXT NOT NULL CHECK (method IN ('queue','browse','gate','cli','draw')),
  at               TEXT NOT NULL,
  by               TEXT NOT NULL,
  pipeline_version TEXT NOT NULL,
  inherited_from   TEXT
);
CREATE INDEX IF NOT EXISTS verdicts_target ON verdicts(kind, target_id, at);

CREATE TABLE IF NOT EXISTS draws (
  id            TEXT PRIMARY KEY,
  setting       TEXT,
  genre         TEXT NOT NULL,
  mode          TEXT NOT NULL CHECK (mode IN ('auto','manual')),
  segment       TEXT,
  seed_mode     TEXT NOT NULL CHECK (seed_mode IN ('drawn','picked','typed')),
  seed_text     TEXT NOT NULL,
  seed_theme_id TEXT,
  example_ids   TEXT NOT NULL,         -- JSON array
  domains       TEXT,                  -- JSON array of the setting's drawn domain slugs; NULL when unrestricted
  sampling      TEXT NOT NULL DEFAULT 'tail',   -- where in the stated distribution the premises were asked for
  status        TEXT NOT NULL,         -- running | awaiting_gate | done | failed | rejected
                                       -- | awaiting_check_gate | repairing | repaired | drafting | awaiting_draft_gate | drafted | passed
  gate_method   TEXT,                  -- auto | manual
  chosen_step   TEXT,
  flagged       INTEGER NOT NULL DEFAULT 0,
  flag_note     TEXT NOT NULL DEFAULT '',
  superseded_by TEXT REFERENCES draws(id),
  repaired_from TEXT REFERENCES draws(id),   -- the brief this one repairs
  forked_from   TEXT REFERENCES draws(id),   -- the draw whose candidate this one develops
  draft_config  TEXT,                  -- JSON: the resolved draft.toml values a draft ran under
  archived_at   TEXT,                  -- set to hide the draw from the lists; nothing else changes
  created_at    TEXT NOT NULL,
  ended_at      TEXT
);

CREATE TABLE IF NOT EXISTS steps (
  id            TEXT PRIMARY KEY,
  draw_id        TEXT REFERENCES draws(id),  -- NULL for theme drafting, which is not a draw
  story_id      TEXT,                      -- set for theme drafting
  parent_id     TEXT REFERENCES steps(id),
  stage         TEXT NOT NULL,
  model         TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  prompt        TEXT NOT NULL,
  raw_response  TEXT,
  parsed        TEXT,                  -- JSON
  status        TEXT NOT NULL,         -- running | done | failed
  fail_reason   TEXT,                  -- shape | refusal | error
  attempt       INTEGER NOT NULL DEFAULT 1,
  tools         TEXT NOT NULL DEFAULT '',   -- comma-separated tool list the call was allowed
  started_at    TEXT NOT NULL,
  ended_at      TEXT,
  error         TEXT
);
CREATE INDEX IF NOT EXISTS steps_draw ON steps(draw_id);

CREATE TABLE IF NOT EXISTS artifacts (
  id       TEXT PRIMARY KEY,
  step_id  TEXT NOT NULL REFERENCES steps(id),
  kind     TEXT NOT NULL,              -- premise | vignette | outline | job | ending | brief
                                       -- | finding | ledger | profile | claim | schedule | scene | slop | draft
  content  TEXT NOT NULL,
  meta     TEXT NOT NULL DEFAULT '{}'  -- JSON
);
