function initJourneySchema(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS Journey (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
        revision INTEGER NOT NULL DEFAULT 1, document TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_journey_owner ON Journey(user_id, updated_at);
      CREATE TABLE IF NOT EXISTS JourneyDraft (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
        journey_id TEXT REFERENCES Journey(id) ON DELETE CASCADE, base_revision INTEGER NOT NULL DEFAULT 0,
        revision INTEGER NOT NULL, document TEXT NOT NULL, content_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active', published_id TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_journey_draft_owner ON JourneyDraft(user_id,status,updated_at);
      CREATE TABLE IF NOT EXISTS JourneyRevision (
        journey_id TEXT NOT NULL REFERENCES Journey(id) ON DELETE CASCADE,
        revision INTEGER NOT NULL, document TEXT NOT NULL, created_at TEXT NOT NULL,
        PRIMARY KEY(journey_id, revision)
      );
      CREATE TABLE IF NOT EXISTS JourneyMedia (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
        data BLOB NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS JourneyJob (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
        status TEXT NOT NULL, input TEXT NOT NULL, output TEXT, error TEXT,
        attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_journey_job ON JourneyJob(status, created_at);
      CREATE TABLE IF NOT EXISTS JourneyJobRequest (
        user_id TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
        request_id TEXT NOT NULL, input_hash TEXT NOT NULL, job_id TEXT NOT NULL,
        created_at TEXT NOT NULL, PRIMARY KEY(user_id,request_id), UNIQUE(job_id)
      );
      CREATE INDEX IF NOT EXISTS idx_journey_request_budget ON JourneyJobRequest(user_id,created_at);
      CREATE TABLE IF NOT EXISTS JourneyClarificationRequest (
        job_id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
        draft_id TEXT NOT NULL REFERENCES JourneyDraft(id) ON DELETE CASCADE, created_at TEXT NOT NULL
      );
      INSERT OR IGNORE INTO JourneyJobRequest(user_id,request_id,input_hash,job_id,created_at)
        SELECT user_id,'legacy_' || id,'legacy',id,created_at FROM JourneyJob;
      CREATE TABLE IF NOT EXISTS JourneyCorrection (
        id TEXT PRIMARY KEY, journey_id TEXT NOT NULL REFERENCES Journey(id) ON DELETE CASCADE,
        revision INTEGER NOT NULL, stop_id TEXT NOT NULL, field TEXT NOT NULL,
        before_value TEXT NOT NULL, after_value TEXT NOT NULL, reason TEXT NOT NULL,
        created_at TEXT NOT NULL, UNIQUE(journey_id,revision,stop_id,field)
      );
      CREATE TABLE IF NOT EXISTS JourneyMergeRequest (
        user_id TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
        request_id TEXT NOT NULL, preview_hash TEXT NOT NULL, journey_id TEXT NOT NULL, created_at TEXT NOT NULL,
        PRIMARY KEY(user_id,request_id)
      );
      CREATE TABLE IF NOT EXISTS MapConsent (
        user_id TEXT PRIMARY KEY REFERENCES User(id) ON DELETE CASCADE,
        feedback INTEGER NOT NULL DEFAULT 0, research INTEGER NOT NULL DEFAULT 0,
        discovery INTEGER NOT NULL DEFAULT 0, tags TEXT NOT NULL DEFAULT '[]',
        version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS PublicCollection (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
        title TEXT NOT NULL, is_public INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS PublicCollectionItem (
        collection_id TEXT NOT NULL REFERENCES PublicCollection(id) ON DELETE CASCADE,
        place_id INTEGER NOT NULL REFERENCES Place(id) ON DELETE CASCADE,
        PRIMARY KEY(collection_id, place_id)
      );
      CREATE TABLE IF NOT EXISTS MapInteraction (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
        session_id TEXT NOT NULL, kind TEXT NOT NULL, surface TEXT NOT NULL,
        decision_id TEXT, place_id INTEGER, rank INTEGER, reason TEXT,
        research_allowed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_map_interaction_owner ON MapInteraction(user_id, created_at);
      CREATE TABLE IF NOT EXISTS MapInteractionContext (
        event_id TEXT PRIMARY KEY REFERENCES MapInteraction(id) ON DELETE CASCADE,
        context TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS MapDecision (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
        request_hash TEXT NOT NULL, snapshot TEXT NOT NULL, result TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TRIGGER IF NOT EXISTS journey_collection_unfavorite AFTER DELETE ON Favorite
      BEGIN
        DELETE FROM PublicCollectionItem WHERE place_id=OLD.place_id
          AND collection_id IN (SELECT id FROM PublicCollection WHERE user_id=OLD.user_id);
      END;
      CREATE TRIGGER IF NOT EXISTS journey_favorite_feedback AFTER INSERT ON UserBehaviorEvent
      WHEN NEW.event_type IN ('favorite_add','favorite_remove')
      BEGIN
        INSERT OR IGNORE INTO MapInteraction(id,user_id,session_id,kind,surface,place_id,research_allowed,created_at)
        SELECT NEW.event_id,NEW.user_id,'server_' || NEW.event_id,
          CASE NEW.event_type WHEN 'favorite_add' THEN 'favorite' ELSE 'unfavorite' END,
          'favorites',NEW.place_id,c.research,strftime('%Y-%m-%dT%H:%M:%fZ',NEW.occurred_at/1000.0,'unixepoch')
        FROM MapConsent c WHERE c.user_id=NEW.user_id AND c.feedback=1;
      END;
    `);
}
module.exports = { initJourneySchema };
