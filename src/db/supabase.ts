/**
 * Supabase Client - Manages connection to Supabase backend
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';

// Database types
export interface AbcEvent {
  id: string;
  type: string;
  source: string;
  data: any;
  timestamp: string;
  processed: boolean;
  created_at?: string;
  user_id?: string;
}

export interface User {
  id: string;
  email: string;
  username?: string;
  full_name?: string;
  avatar_url?: string;
  created_at?: string;
  updated_at?: string;
  metadata?: any;
}

export interface Database {
  public: {
    Tables: {
      abc_events: {
        Row: AbcEvent;
        Insert: Omit<AbcEvent, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<AbcEvent, 'id'>>;
      };
      users: {
        Row: User;
        Insert: Omit<User, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<User, 'id' | 'created_at'>>;
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
  };
}

class SupabaseService {
  private client: SupabaseClient<Database> | null = null;
  private url: string;
  private anonKey: string;

  constructor() {
    // Get Supabase credentials from environment variables
    this.url = process.env.SUPABASE_URL || '';
    this.anonKey = process.env.SUPABASE_ANON_KEY || '';
    
    // Debug logging to see what values are being loaded
    logger.debug('Supabase constructor - environment variables:', {
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
      url_loaded: this.url,
      anonKey_loaded: this.anonKey,
      has_url: !!this.url,
      has_anonKey: !!this.anonKey
    });
  }

  initialize(): SupabaseClient<Database> {
    if (this.client) {
      return this.client;
    }

    if (!this.url || !this.anonKey) {
      throw new Error(
        'Supabase credentials not found. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.'
      );
    }

    try {
      this.client = createClient<Database>(this.url, this.anonKey, {
        auth: {
          persistSession: false
        },
        realtime: {
          params: {
            eventsPerSecond: 10
          }
        }
      });

      logger.info('Supabase client initialized successfully');
      return this.client;
    } catch (error) {
      logger.error('Failed to initialize Supabase client:', error);
      throw error;
    }
  }

  getClient(): SupabaseClient<Database> {
    if (!this.client) {
      return this.initialize();
    }
    return this.client;
  }

  async testConnection(): Promise<boolean> {
    try {
      const client = this.getClient();
      const { error } = await client.from('abc_events').select('id').limit(1);

      if (error && error.code !== 'PGRST116') {
        // PGRST116 is "no rows found" which is fine for testing
        logger.error('Supabase connection test failed:', error);
        return false;
      }

      logger.info('Supabase connection test successful');
      return true;
    } catch (error) {
      logger.error('Supabase connection test error:', error);
      return false;
    }
  }

  // Create tables schema (for documentation - actual tables should be created in Supabase dashboard)
  getSchema(): string {
    return `
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
`;
  }
}

// Export singleton instance
export const supabase = new SupabaseService();
export type { SupabaseClient };