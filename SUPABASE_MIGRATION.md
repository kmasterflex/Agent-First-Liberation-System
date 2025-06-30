# Supabase Migration Guide

## Overview
The ABC Terminal has been migrated from SQLite to Supabase for better scalability, real-time features, and cloud-based storage.

## Prerequisites

1. Create a Supabase account at https://supabase.com
2. Create a new project
3. Obtain your project URL and anon key from the project settings

## Environment Variables

Add these to your `.env` file:

```env
SUPABASE_URL=your_project_url
SUPABASE_ANON_KEY=your_anon_key
```

## Database Schema

Execute the following SQL in your Supabase SQL editor:

```sql
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
```

## Real-time Configuration

1. Go to your Supabase project dashboard
2. Navigate to Database > Replication
3. Enable replication for the following tables:
   - `abc_events`
   - `users`

## Features Added

### Real-time Subscriptions
- Automatic real-time updates when events are created, updated, or deleted
- Custom event subscriptions for specific event types
- Event filtering support

### User Management
- New user table with profile information
- User-event relationship tracking
- Metadata support for custom user data

### Improved Performance
- Cloud-based infrastructure
- Automatic indexing
- Query optimization
- Connection pooling

## Migration from SQLite

If you have existing data in SQLite:

1. Export your SQLite data to CSV
2. Use Supabase's CSV import feature in the Table Editor
3. Map the following fields:
   - SQLite `id` → Supabase `id` (convert to UUID format)
   - SQLite `timestamp` (integer) → Supabase `timestamp` (convert to ISO string)
   - SQLite `data` (JSON string) → Supabase `data` (JSONB)

## API Changes

The EventDatabase API remains mostly the same with these additions:

- `createUser(email, userData)` - Create a new user
- `getUser(id)` - Get user by ID
- `updateUser(id, updates)` - Update user information
- Real-time subscriptions now use Supabase's built-in real-time features

## Testing

After setup, run:

```bash
npm install
npm run dev
```

The system will automatically test the Supabase connection on startup.

## Troubleshooting

### Connection Issues
- Verify your SUPABASE_URL and SUPABASE_ANON_KEY are correct
- Check that your Supabase project is active
- Ensure tables are created with proper permissions

### Real-time Not Working
- Verify replication is enabled for your tables
- Check that Row Level Security policies allow read access
- Ensure your network allows WebSocket connections

### Performance Tips
- Use appropriate indexes for your query patterns
- Consider partitioning for very large event tables
- Use connection pooling for high-traffic applications