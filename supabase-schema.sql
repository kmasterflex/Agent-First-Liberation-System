-- ABC Terminal Supabase Schema
-- Run this SQL in your Supabase SQL Editor

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ABC Events table
CREATE TABLE IF NOT EXISTS abc_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  source TEXT NOT NULL,
  data JSONB NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_abc_events_type ON abc_events(type);
CREATE INDEX idx_abc_events_source ON abc_events(source);
CREATE INDEX idx_abc_events_timestamp ON abc_events(timestamp);
CREATE INDEX idx_abc_events_processed ON abc_events(processed);
CREATE INDEX idx_abc_events_user_id ON abc_events(user_id);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE abc_events ENABLE ROW LEVEL SECURITY;

-- Policies (adjust based on your needs)
CREATE POLICY "Enable read access for all users" ON users
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON abc_events
  FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users" ON abc_events
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update for event owners" ON abc_events
  FOR UPDATE USING (user_id = auth.uid());

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();