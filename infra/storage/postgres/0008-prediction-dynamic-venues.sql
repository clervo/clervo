ALTER TABLE clervo_prediction_markets
  DROP CONSTRAINT IF EXISTS clervo_prediction_venue_check;

ALTER TABLE clervo_prediction_markets
  ADD CONSTRAINT clervo_prediction_venue_check
  CHECK (venue_id ~ '^[a-z][a-z0-9_]{1,63}$');
