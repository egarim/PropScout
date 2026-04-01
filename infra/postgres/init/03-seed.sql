INSERT INTO data_sources (name, display_name, config) VALUES
  ('redfin', 'Redfin', '{"base_url": "https://www.redfin.com"}'),
  ('zillow', 'Zillow', '{"base_url": "https://www.zillow.com"}'),
  ('realtor', 'Realtor.com', '{"base_url": "https://www.realtor.com"}')
ON CONFLICT (name) DO NOTHING;

SELECT 'Seed data inserted' AS status;
