-- Local-only sample data. Re-running preserves existing rows and live state.
INSERT INTO events (id, name) VALUES (1, 'Workshop Commons / 交流機能デモ') ON CONFLICT DO NOTHING;
INSERT INTO participants (id, event_id, nickname) VALUES (1, 1, '佐藤 あかり'), (2, 1, '田中 悠') ON CONFLICT DO NOTHING;
INSERT INTO talks (id, event_id, speaker_id, title, sort_order, duration_seconds) VALUES
  (1, 1, 1, '小さな自動化から始めよう', 1, 300),
  (2, 1, 2, 'チームでつくる開発文化', 2, 300)
ON CONFLICT DO NOTHING;
INSERT INTO event_live_state (event_id, selected_talk_id) VALUES (1, 1) ON CONFLICT DO NOTHING;
