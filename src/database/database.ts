import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';

export class Database {
  private db: sqlite3.Database;
  private static instance: Database;

  private constructor() {
    const dbPath = path.join(process.cwd(), 'payments.db');
    this.db = new sqlite3.Database(dbPath);
    this.db.configure('busyTimeout', 5000);
  }

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  public async run(sql: string, params: any[] = []): Promise<sqlite3.RunResult> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err:any) {
        if (err) {
          reject(err);
        } else {
          resolve(this);
        }
      });
    });
  }

  public async get<T>(sql: string, params: any[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err:any, row:any) => {
        if (err) {
          reject(err);
        } else {
          resolve(row as T);
        }
      });
    });
  }

  public async all<T>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err:any, rows:any) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  public async initialize(): Promise<void> {
    await this.createTables();
  }

  private async createTables(): Promise<void> {
    // Payments table
    await this.run(`
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        idempotency_key TEXT UNIQUE NOT NULL,
        source_amount DECIMAL(15,2) NOT NULL,
        source_currency TEXT NOT NULL DEFAULT 'USD',
        destination_amount DECIMAL(15,2) NOT NULL,
        destination_currency TEXT NOT NULL,
        exchange_rate DECIMAL(15,8) NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        onramp_reference TEXT,
        offramp_reference TEXT,
        fee_amount DECIMAL(15,2) NOT NULL,
        total_amount DECIMAL(15,2) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Fee configurations table
    await this.run(`
      CREATE TABLE IF NOT EXISTS fee_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        currency TEXT NOT NULL,
        base_fee DECIMAL(15,2) NOT NULL DEFAULT 0,
        percentage_fee DECIMAL(5,4) NOT NULL DEFAULT 0,
        minimum_fee DECIMAL(15,2) NOT NULL DEFAULT 0,
        maximum_fee DECIMAL(15,2),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Transactions table (for audit trail)
    await this.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        payment_id TEXT,
        type TEXT NOT NULL, -- 'onramp', 'offramp', 'fee'
        amount DECIMAL(15,2) NOT NULL,
        currency TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        external_reference TEXT,
        provider TEXT,
        metadata TEXT, -- JSON string
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (payment_id) REFERENCES payments (id)
      )
    `);

    // Webhooks table
    await this.run(`
      CREATE TABLE IF NOT EXISTS webhooks (
        id TEXT PRIMARY KEY,
        payment_id TEXT,
        event_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, failed
        payload TEXT NOT NULL, -- JSON string
        response TEXT, -- JSON string
        retry_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        sent_at DATETIME,
        FOREIGN KEY (payment_id) REFERENCES payments (id)
      )
    `);

    // Exchange rates table (for caching)
    await this.run(`
      CREATE TABLE IF NOT EXISTS exchange_rates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_currency TEXT NOT NULL,
        to_currency TEXT NOT NULL,
        rate DECIMAL(15,8) NOT NULL,
        provider TEXT NOT NULL DEFAULT 'mock',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        UNIQUE(from_currency, to_currency, provider)
      )
    `);

    // Insert default fee configurations
    await this.insertDefaultFeeConfigs();
  }

  private async insertDefaultFeeConfigs(): Promise<void> {
    const feeConfigs = [
      { currency: 'EUR', base_fee: 2.50, percentage_fee: 0.0299, minimum_fee: 1.00, maximum_fee: 50.00 },
      { currency: 'GBP', base_fee: 2.00, percentage_fee: 0.0299, minimum_fee: 1.00, maximum_fee: 50.00 },
      { currency: 'CAD', base_fee: 3.00, percentage_fee: 0.0349, minimum_fee: 1.50, maximum_fee: 75.00 },
      { currency: 'AUD', base_fee: 3.50, percentage_fee: 0.0349, minimum_fee: 1.50, maximum_fee: 75.00 },
      { currency: 'JPY', base_fee: 300, percentage_fee: 0.0399, minimum_fee: 100, maximum_fee: 7500 },
      { currency: 'INR', base_fee: 200, percentage_fee: 0.0399, minimum_fee: 100, maximum_fee: 5000 },
      { currency: 'BRL', base_fee: 15, percentage_fee: 0.0449, minimum_fee: 5, maximum_fee: 300 },
      { currency: 'MXN', base_fee: 50, percentage_fee: 0.0449, minimum_fee: 20, maximum_fee: 1000 }
    ];

    for (const config of feeConfigs) {
      try {
        await this.run(
          `INSERT OR IGNORE INTO fee_configs (currency, base_fee, percentage_fee, minimum_fee, maximum_fee)
           VALUES (?, ?, ?, ?, ?)`,
          [config.currency, config.base_fee, config.percentage_fee, config.minimum_fee, config.maximum_fee]
        );
      } catch (error) {
        // Ignore duplicate entries
      }
    }
  }

  public async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err:any) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
} 