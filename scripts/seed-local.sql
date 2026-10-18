-- Local development only. Does not replace an existing event.
INSERT OR IGNORE INTO events (id, name) VALUES (1, 'つくる、つながる。ミートアップ');
INSERT OR IGNORE INTO event_live_state (event_id) VALUES (1);
