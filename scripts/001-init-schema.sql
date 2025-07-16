CREATE TABLE IF NOT EXISTS users (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
username TEXT NOT NULL UNIQUE,
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rooms (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
host_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
guest_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
word TEXT,
state TEXT DEFAULT 'waiting' NOT NULL, -- 'waiting', 'playing', 'finished'
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS moves (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
user_id UUID REFERENCES users(id) ON DELETE CASCADE,
letter TEXT NOT NULL,
correct BOOLEAN NOT NULL,
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
user_id UUID REFERENCES users(id) ON DELETE CASCADE,
message TEXT NOT NULL,
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Realtime for tables
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE moves;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
