import Database from 'better-sqlite3';
import { User, Transaction } from '../types';
import * as crypto from 'crypto';

export class AirtimeDatabase {
  private db: Database.Database;
  private encryptionKey: string;
  
  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.encryptionKey = process.env.ENCRYPTION_KEY || 'default_key_change_this_in_prod';
    this.initialize();
  }
  
  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone_number TEXT UNIQUE NOT NULL,
        wallet_address TEXT NOT NULL,
        encrypted_private_key TEXT NOT NULL,
        ens_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_active DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        from_phone TEXT NOT NULL,
        to_phone TEXT,
        airtime_amount REAL NOT NULL,
        currency TEXT NOT NULL,
        txtc_amount REAL NOT NULL,
        eth_amount REAL DEFAULT 0,
        fee REAL DEFAULT 0,
        telco_tx_id TEXT NOT NULL,
        blockchain_tx_hash TEXT,
        status TEXT DEFAULT 'pending',
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
      );
      
      CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
      CREATE INDEX IF NOT EXISTS idx_transactions_from ON transactions(from_phone);
      CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
      CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);
    `);
    
    console.log('✅ Database initialized');
  }
  
  // User Management
  
  getUser(phoneNumber: string): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE phone_number = ?');
    const row = stmt.get(phoneNumber) as any;
    
    if (!row) return null;
    
    return {
      id: row.id,
      phoneNumber: row.phone_number,
      walletAddress: row.wallet_address,
      encryptedPrivateKey: row.encrypted_private_key,
      ensName: row.ens_name || undefined,
      createdAt: new Date(row.created_at),
      lastActive: new Date(row.last_active),
    };
  }
  
  createUser(phoneNumber: string, walletAddress: string, privateKey: string): User {
    const encryptedKey = this.encrypt(privateKey);
    
    const stmt = this.db.prepare(`
      INSERT INTO users (phone_number, wallet_address, encrypted_private_key)
      VALUES (?, ?, ?)
    `);
    
    const result = stmt.run(phoneNumber, walletAddress, encryptedKey);
    
    return {
      id: Number(result.lastInsertRowid),
      phoneNumber,
      walletAddress,
      encryptedPrivateKey: encryptedKey,
      createdAt: new Date(),
      lastActive: new Date(),
    };
  }
  
  updateUserActivity(phoneNumber: string): void {
    const stmt = this.db.prepare('UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE phone_number = ?');
    stmt.run(phoneNumber);
  }
  
  updateUserEnsName(phoneNumber: string, ensName: string): void {
    const stmt = this.db.prepare('UPDATE users SET ens_name = ? WHERE phone_number = ?');
    stmt.run(ensName, phoneNumber);
  }
  
  isEnsNameTaken(ensName: string): boolean {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM users WHERE ens_name = ?');
    const result = stmt.get(ensName) as any;
    return result.count > 0;
  }
  
  decryptPrivateKey(encryptedKey: string): string {
    return this.decrypt(encryptedKey);
  }
  
  // Transaction Management
  
  createTransaction(tx: Partial<Transaction>): number {
    const stmt = this.db.prepare(`
      INSERT INTO transactions (
        type, from_phone, to_phone, airtime_amount, currency,
        txtc_amount, eth_amount, fee, telco_tx_id, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      tx.type,
      tx.fromPhone,
      tx.toPhone || null,
      tx.airtimeAmount,
      tx.currency,
      tx.txtcAmount,
      tx.ethAmount || 0,
      tx.fee || 0,
      tx.telcoTxId,
      tx.status || 'pending'
    );
    
    return Number(result.lastInsertRowid);
  }
  
  updateTransaction(id: number, updates: Partial<Transaction>): void {
    const fields: string[] = [];
    const values: any[] = [];
    
    if (updates.blockchainTxHash) {
      fields.push('blockchain_tx_hash = ?');
      values.push(updates.blockchainTxHash);
    }
    
    if (updates.status) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    
    if (updates.errorMessage) {
      fields.push('error_message = ?');
      values.push(updates.errorMessage);
    }
    
    if (updates.status === 'completed' || updates.status === 'failed') {
      fields.push('completed_at = CURRENT_TIMESTAMP');
    }
    
    if (fields.length === 0) return;
    
    const stmt = this.db.prepare(`UPDATE transactions SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values, id);
  }
  
  getTransaction(id: number): Transaction | null {
    const stmt = this.db.prepare('SELECT * FROM transactions WHERE id = ?');
    const row = stmt.get(id) as any;
    
    if (!row) return null;
    
    return this.rowToTransaction(row);
  }
  
  getTransactionsByPhone(phoneNumber: string, limit: number = 10): Transaction[] {
    const stmt = this.db.prepare(`
      SELECT * FROM transactions 
      WHERE from_phone = ? OR to_phone = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    
    const rows = stmt.all(phoneNumber, phoneNumber, limit) as any[];
    return rows.map(row => this.rowToTransaction(row));
  }
  
  private rowToTransaction(row: any): Transaction {
    return {
      id: row.id,
      type: row.type,
      fromPhone: row.from_phone,
      toPhone: row.to_phone,
      airtimeAmount: row.airtime_amount,
      currency: row.currency,
      txtcAmount: row.txtc_amount,
      ethAmount: row.eth_amount,
      fee: row.fee,
      telcoTxId: row.telco_tx_id,
      blockchainTxHash: row.blockchain_tx_hash,
      status: row.status,
      errorMessage: row.error_message,
      createdAt: new Date(row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    };
  }
  
  // Encryption helpers
  
  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  }
  
  private decrypt(text: string): string {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
  
  close(): void {
    this.db.close();
  }
}
