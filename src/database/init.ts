import { Database } from './database.js';

export const initializeDatabase = async () => {
  try {
    const db = Database.getInstance();
    await db.initialize();
    
    // Create authentication tables
    await createAuthTables(db);
    
    // Create audit logging tables
    await createAuditTables(db);
    

    
    // Create initial admin user and API key
    await createInitialData(db);
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
}; 

async function createAuthTables(db: Database) {
  // Users table
  await db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      auth_token TEXT UNIQUE,
      role TEXT NOT NULL DEFAULT 'user',
      permissions TEXT NOT NULL DEFAULT '[]',
      is_active BOOLEAN NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // API keys table
  await db.run(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key_hash TEXT UNIQUE NOT NULL,
      permissions TEXT NOT NULL DEFAULT '[]',
      is_active BOOLEAN NOT NULL DEFAULT 1,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // API key usage logging
  await db.run(`
    CREATE TABLE IF NOT EXISTS api_key_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      api_key_id TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (api_key_id) REFERENCES api_keys (id)
    )
  `);
}

async function createAuditTables(db: Database) {
  // Audit logs table
  await db.run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      api_key_id TEXT,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      details TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (api_key_id) REFERENCES api_keys (id)
    )
  `);

  // Security events table
  await db.run(`
    CREATE TABLE IF NOT EXISTS security_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      description TEXT NOT NULL,
      ip_address TEXT,
      user_id TEXT,
      api_key_id TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (api_key_id) REFERENCES api_keys (id)
    )
  `);
}

async function createInitialData(db: Database) {
  // Check if admin user already exists
  const existingAdmin = await db.get('SELECT id FROM users WHERE email = ?', ['admin@crossborderpayments.com']);
  
  if (!existingAdmin) {
    // Create admin user
    const { authService, UserRole } = await import('../middleware/auth.js');
    const adminToken = await authService.createUser(
      'admin@crossborderpayments.com',
      'admin123',
      UserRole.ADMIN
    );
    
    console.log('Created admin user with token:', adminToken);
    
    // Create default API key with admin permissions
    const apiKey = await authService.generateApiKey(
      'Default API Key',
      ['payments:read', 'payments:write', 'system:admin'],
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
    );
    
    console.log('Created default API key:', apiKey);
  }
} 