import fs from 'fs';
import path from 'path';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import {
  Invoice,
  Product,
  Customer,
  PackerLog,
  AppSettings,
  FacebookPage
} from './types';

const SQLITE_DB_PATH = path.join(process.cwd(), 'server', 'pos.db');

let SQL: SqlJsStatic | null = null;
let dbInstance: Database | null = null;

export async function getSqliteDb(): Promise<Database> {
  if (dbInstance) return dbInstance;

  if (!SQL) {
    SQL = await initSqlJs();
  }

  if (fs.existsSync(SQLITE_DB_PATH)) {
    try {
      const fileBuffer = fs.readFileSync(SQLITE_DB_PATH);
      dbInstance = new SQL.Database(fileBuffer);
      console.log(`[SQLite] Loaded existing database from ${SQLITE_DB_PATH} (${fileBuffer.length} bytes)`);
    } catch (err) {
      console.error('[SQLite] Failed to load existing pos.db, creating fresh DB:', err);
      dbInstance = new SQL.Database();
    }
  } else {
    dbInstance = new SQL.Database();
    console.log(`[SQLite] Initialized new SQLite database in memory`);
  }

  initTables(dbInstance);
  return dbInstance;
}

function initTables(db: Database) {
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS live_sessions (
        live_id TEXT PRIMARY KEY,
        title TEXT,
        live_date TEXT,
        created_at TEXT,
        total_baskets INTEGER DEFAULT 0,
        total_revenue REAL DEFAULT 0,
        status TEXT DEFAULT 'ACTIVE'
      );

      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY,
        code TEXT,
        name TEXT,
        stock_qty INTEGER DEFAULT 0,
        price REAL DEFAULT 0,
        cost_price REAL DEFAULT 0,
        image_file TEXT,
        live_id TEXT
      );

      CREATE TABLE IF NOT EXISTS invoices (
        invoice_id INTEGER PRIMARY KEY,
        basket_no INTEGER,
        live_id TEXT,
        created_at TEXT,
        created_date TEXT,
        facebook_user_id TEXT,
        facebook_name TEXT,
        phone_number TEXT,
        address TEXT,
        location_zone TEXT,
        location_label TEXT,
        total_amount REAL DEFAULT 0,
        shipping_fee REAL DEFAULT 2.0,
        is_free_ship INTEGER DEFAULT 0,
        status TEXT DEFAULT 'Pending',
        packing_stage TEXT DEFAULT 'UNPICKED',
        staged_by TEXT,
        staged_at TEXT,
        verified_by TEXT,
        verified_at TEXT,
        paid_by TEXT,
        paid_at TEXT,
        msg_status TEXT DEFAULT 'UNSENT',
        comments_json TEXT,
        unmatched_comments_json TEXT,
        items_json TEXT,
        last_comment_id TEXT,
        comment_ids_json TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_invoices_live_id ON invoices(live_id);
      CREATE INDEX IF NOT EXISTS idx_invoices_created_date ON invoices(created_date);
      CREATE INDEX IF NOT EXISTS idx_invoices_basket_no ON invoices(basket_no);
      CREATE INDEX IF NOT EXISTS idx_invoices_last_comment_id ON invoices(last_comment_id);

      CREATE TABLE IF NOT EXISTS invoice_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER,
        product_id INTEGER,
        product_code TEXT,
        product_name TEXT,
        quantity INTEGER,
        price REAL,
        is_packed INTEGER DEFAULT 0,
        item_comment TEXT,
        image_file TEXT,
        FOREIGN KEY(invoice_id) REFERENCES invoices(invoice_id)
      );

      CREATE TABLE IF NOT EXISTS customers (
        customer_id INTEGER PRIMARY KEY AUTOINCREMENT,
        facebook_user_id TEXT,
        facebook_name TEXT,
        phone_number TEXT,
        address TEXT,
        is_vip INTEGER DEFAULT 0,
        is_blacklist INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS packer_logs (
        log_id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER,
        packer_name TEXT,
        items_count INTEGER,
        duration_seconds INTEGER,
        packed_at TEXT,
        facebook_name TEXT,
        total_amount REAL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS raw_comments (
        comment_id TEXT PRIMARY KEY,
        live_id TEXT,
        invoice_id INTEGER,
        facebook_user_id TEXT,
        facebook_name TEXT,
        comment_text TEXT,
        created_at TEXT,
        picture_url TEXT,
        is_matched INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_raw_comments_live_id ON raw_comments(live_id);
      CREATE INDEX IF NOT EXISTS idx_raw_comments_customer ON raw_comments(facebook_user_id, facebook_name);
    `);
  } catch (err) {
    console.warn('[SQLite] Table creation warning:', err);
  }

  // Schema migrations for legacy/existing tables
  const ensureColumns = (tableName: string, requiredColumns: [string, string][]) => {
    try {
      const tableInfo = db.exec(`PRAGMA table_info(${tableName});`);
      if (tableInfo.length > 0 && tableInfo[0].values) {
        const existingCols = new Set(tableInfo[0].values.map((row: any) => String(row[1]).toLowerCase()));
        for (const [colName, colType] of requiredColumns) {
          if (!existingCols.has(colName.toLowerCase())) {
            try {
              db.run(`ALTER TABLE ${tableName} ADD COLUMN ${colName} ${colType};`);
              console.log(`[SQLite Migration] Added column ${colName} (${colType}) to ${tableName}`);
            } catch (addErr) {
              console.warn(`[SQLite Migration] Failed to add column ${colName} to ${tableName}:`, addErr);
            }
          }
        }
      }
    } catch (migErr) {
      console.warn(`[SQLite Migration] Error inspecting columns for ${tableName}:`, migErr);
    }
  };

  ensureColumns('invoice_items', [
    ['image_file', 'TEXT'],
    ['item_comment', 'TEXT'],
    ['is_packed', 'INTEGER DEFAULT 0'],
    ['product_name', 'TEXT'],
    ['product_code', 'TEXT'],
    ['product_id', 'INTEGER'],
    ['quantity', 'INTEGER DEFAULT 1'],
    ['price', 'REAL DEFAULT 0']
  ]);

  ensureColumns('invoices', [
    ['basket_no', 'INTEGER'],
    ['shipping_fee', 'REAL DEFAULT 2.0'],
    ['is_free_ship', 'INTEGER DEFAULT 0'],
    ['location_zone', 'TEXT'],
    ['location_label', 'TEXT'],
    ['comments_json', 'TEXT'],
    ['unmatched_comments_json', 'TEXT'],
    ['items_json', 'TEXT'],
    ['last_comment_id', 'TEXT'],
    ['comment_ids_json', 'TEXT'],
    ['msg_status', "TEXT DEFAULT 'UNSENT'"],
    ['staged_by', 'TEXT'],
    ['staged_at', 'TEXT'],
    ['verified_by', 'TEXT'],
    ['verified_at', 'TEXT'],
    ['paid_by', 'TEXT'],
    ['paid_at', 'TEXT']
  ]);

  ensureColumns('products', [
    ['cost_price', 'REAL DEFAULT 0'],
    ['image_file', 'TEXT'],
    ['live_id', 'TEXT']
  ]);

  // Migration: Drop UNIQUE constraint on products.code if it exists from older schema
  try {
    const prodTableInfo = db.exec("SELECT sql FROM sqlite_master WHERE tbl_name = 'products' AND type = 'table';");
    if (prodTableInfo.length > 0 && prodTableInfo[0].values && prodTableInfo[0].values[0]) {
      const sql = String(prodTableInfo[0].values[0][0] || '');
      if (sql.includes('code TEXT UNIQUE') || sql.toUpperCase().includes('UNIQUE (CODE)') || sql.toUpperCase().includes('UNIQUE(CODE)')) {
        console.log('[SQLite Migration] Removing legacy UNIQUE constraint on products.code to support per-live session catalogs...');
        db.run(`
          CREATE TABLE products_new (
            id INTEGER PRIMARY KEY,
            code TEXT,
            name TEXT,
            stock_qty INTEGER DEFAULT 0,
            price REAL DEFAULT 0,
            cost_price REAL DEFAULT 0,
            image_file TEXT,
            live_id TEXT
          );
          INSERT INTO products_new (id, code, name, stock_qty, price, cost_price, image_file, live_id)
            SELECT id, code, name, stock_qty, price, cost_price, image_file, live_id FROM products;
          DROP TABLE products;
          ALTER TABLE products_new RENAME TO products;
        `);
        console.log('[SQLite Migration] Successfully removed UNIQUE constraint on products.code.');
      }
    }
  } catch (migProdErr) {
    console.warn('[SQLite Migration] Warning while migrating products table:', migProdErr);
  }

  // Ensure index on live_id and code
  try {
    db.run('CREATE INDEX IF NOT EXISTS idx_products_live_code ON products(live_id, code);');
  } catch {}

  ensureColumns('customers', [
    ['is_vip', 'INTEGER DEFAULT 0'],
    ['is_blacklist', 'INTEGER DEFAULT 0']
  ]);
}

let isPersisting = false;
let pendingPersistData: Parameters<typeof persistToSqlite>[0] | null = null;

/**
 * Saves all in-memory entities into SQLite tables and writes binary pos.db to disk.
 * Uses a serial lock and ROLLBACK error handling to avoid "cannot start a transaction within a transaction".
 */
export async function persistToSqlite(data: {
  activeLiveId: string;
  settings: AppSettings;
  products: Product[];
  invoices: Invoice[];
  customers: Customer[];
  packerLogs: PackerLog[];
  activeFacebookPage: FacebookPage | null;
  rawComments?: any[];
}) {
  if (isPersisting) {
    pendingPersistData = data;
    return;
  }

  isPersisting = true;

  try {
    const db = await getSqliteDb();

    // Rollback any dangling transaction if previous attempt failed unexpectedly
    try {
      db.run('ROLLBACK;');
    } catch {
      // Ignore if no transaction was active
    }

    db.run('BEGIN TRANSACTION;');

    try {
      // 1. Settings & Meta
      db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?);', ['active_live_id', data.activeLiveId]);
      db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?);', ['settings', JSON.stringify(data.settings)]);
      if (data.activeFacebookPage) {
        db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?);', ['active_facebook_page', JSON.stringify(data.activeFacebookPage)]);
      }

      // 2. Products
      db.run('DELETE FROM products;');
      const stmtProd = db.prepare('INSERT OR REPLACE INTO products (id, code, name, stock_qty, price, cost_price, image_file, live_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?);');
      let currentMaxId = 0;
      for (const p of data.products) {
        if (p.id && p.id > currentMaxId) currentMaxId = p.id;
      }
      for (const p of data.products) {
        const prodId = p.id || ++currentMaxId;
        stmtProd.run([prodId, p.code, p.name, p.stock_qty, p.price, p.cost_price || 0, p.image_file || '', p.live_id || data.activeLiveId || '']);
      }
      stmtProd.free();

      // 3. Customers
      db.run('DELETE FROM customers;');
      const stmtCust = db.prepare('INSERT INTO customers (customer_id, facebook_user_id, facebook_name, phone_number, address, is_vip, is_blacklist) VALUES (?, ?, ?, ?, ?, ?, ?);');
      for (const c of data.customers) {
        stmtCust.run([c.customer_id, c.facebook_user_id, c.facebook_name, c.phone_number || '', c.address || '', c.is_vip ? 1 : 0, c.is_blacklist ? 1 : 0]);
      }
      stmtCust.free();

      // 4. Packer Logs
      db.run('DELETE FROM packer_logs;');
      const stmtLog = db.prepare('INSERT INTO packer_logs (log_id, invoice_id, packer_name, items_count, duration_seconds, packed_at, facebook_name, total_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?);');
      for (const l of data.packerLogs) {
        stmtLog.run([l.log_id, l.invoice_id, l.packer_name, l.items_count, l.duration_seconds, l.packed_at, l.facebook_name, l.total_amount]);
      }
      stmtLog.free();

      // 5. Invoices & Items
      db.run('DELETE FROM invoice_items;');
      db.run('DELETE FROM invoices;');

      const stmtInv = db.prepare(`
        INSERT INTO invoices (
          invoice_id, basket_no, live_id, created_at, created_date,
          facebook_user_id, facebook_name, phone_number, address,
          location_zone, location_label, total_amount, shipping_fee,
          is_free_ship, status, packing_stage, staged_by, staged_at,
          verified_by, verified_at, paid_by, paid_at, msg_status,
          comments_json, unmatched_comments_json, items_json,
          last_comment_id, comment_ids_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `);

      const stmtItem = db.prepare(`
        INSERT INTO invoice_items (
          invoice_id, product_id, product_code, product_name, quantity, price, is_packed, item_comment, image_file
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
      `);

      // Group live sessions statistics
      const liveStats = new Map<string, { totalBaskets: number; totalRevenue: number; date: string }>();

      for (const inv of data.invoices) {
        const rawDate = inv.created_at || new Date().toISOString();
        const dateOnly = rawDate.includes('T') ? rawDate.split('T')[0] : rawDate.split(' ')[0];

        // Update stats
        const liveKey = inv.live_id || 'DEFAULT_LIVE';
        const stat = liveStats.get(liveKey) || { totalBaskets: 0, totalRevenue: 0, date: dateOnly };
        stat.totalBaskets += 1;
        stat.totalRevenue += Number(inv.total_amount || 0);
        liveStats.set(liveKey, stat);

        stmtInv.run([
          inv.invoice_id,
          inv.basket_no || inv.invoice_id,
          inv.live_id || 'LIVE_DEFAULT',
          rawDate,
          dateOnly,
          inv.facebook_user_id || '',
          inv.facebook_name || 'អតិថិជន Live',
          inv.phone_number || '',
          inv.address || '',
          inv.location_zone || 'PP',
          inv.location_label || '🏙️ ភ្នំពេញ',
          inv.total_amount || 0,
          inv.shipping_fee || 2.0,
          inv.is_free_ship ? 1 : 0,
          inv.status || 'Pending',
          inv.packing_stage || 'UNPICKED',
          inv.staged_by || null,
          inv.staged_at || null,
          inv.verified_by || null,
          inv.verified_at || null,
          inv.paid_by || null,
          inv.paid_at || null,
          inv.msg_status || 'UNSENT',
          JSON.stringify(inv.comments || []),
          JSON.stringify(inv.unmatched_comments || []),
          JSON.stringify(inv.items || []),
          inv.last_comment_id || '',
          JSON.stringify(inv.comment_ids || (inv.last_comment_id ? [inv.last_comment_id] : []))
        ]);

        if (inv.items && Array.isArray(inv.items)) {
          for (const it of inv.items) {
            stmtItem.run([
              inv.invoice_id,
              it.product_id || 0,
              it.product_code || '',
              it.product_name || '',
              it.quantity || 1,
              it.price || 0,
              it.is_packed ? 1 : 0,
              it.item_comment || '',
              it.image_file || ''
            ]);
          }
        }
      }
      stmtInv.free();
      stmtItem.free();

      // 6. Raw Comments
      if (data.rawComments && Array.isArray(data.rawComments) && data.rawComments.length > 0) {
        db.run('DELETE FROM raw_comments;');
        const stmtRaw = db.prepare('INSERT OR REPLACE INTO raw_comments (comment_id, live_id, invoice_id, facebook_user_id, facebook_name, comment_text, created_at, picture_url, is_matched) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);');
        for (const rc of data.rawComments) {
          if (rc && rc.comment_id) {
            stmtRaw.run([
              String(rc.comment_id),
              String(rc.live_id || ''),
              rc.invoice_id ? Number(rc.invoice_id) : null,
              String(rc.facebook_user_id || ''),
              String(rc.facebook_name || ''),
              String(rc.comment_text || ''),
              String(rc.created_at || ''),
              String(rc.picture_url || ''),
              rc.is_matched ? 1 : 0
            ]);
          }
        }
        stmtRaw.free();
      }

      // 7. Live sessions
      db.run('DELETE FROM live_sessions;');
      const stmtLive = db.prepare('INSERT INTO live_sessions (live_id, title, live_date, created_at, total_baskets, total_revenue) VALUES (?, ?, ?, ?, ?, ?);');
      for (const [liveId, stat] of liveStats.entries()) {
        stmtLive.run([
          liveId,
          `Live Sales (${stat.date})`,
          stat.date,
          new Date().toISOString(),
          stat.totalBaskets,
          Number(stat.totalRevenue.toFixed(2))
        ]);
      }
      stmtLive.free();

      db.run('COMMIT;');

      // Export binary SQLite database to server/pos.db
      const binaryArray = db.export();
      const buffer = Buffer.from(binaryArray);
      fs.writeFileSync(SQLITE_DB_PATH, buffer);
    } catch (txErr) {
      try {
        db.run('ROLLBACK;');
      } catch {
        // Ignore rollback errors
      }
      throw txErr;
    }
  } catch (err) {
    console.error('[SQLite] Error persisting data to SQLite pos.db:', err);
  } finally {
    isPersisting = false;
    if (pendingPersistData) {
      const nextData = pendingPersistData;
      pendingPersistData = null;
      // Schedule next queued persist
      setTimeout(() => {
        persistToSqlite(nextData);
      }, 50);
    }
  }
}

/**
 * Loads all data from SQLite pos.db if available.
 */
export async function loadFromSqlite(): Promise<{
  activeLiveId?: string;
  settings?: Partial<AppSettings>;
  products?: Product[];
  invoices?: Invoice[];
  customers?: Customer[];
  packerLogs?: PackerLog[];
  activeFacebookPage?: FacebookPage;
  rawComments?: any[];
} | null> {
  if (!fs.existsSync(SQLITE_DB_PATH)) {
    return null;
  }

  try {
    const db = await getSqliteDb();

    const result: any = {};

    // 1. Settings
    const settingsRows = db.exec('SELECT key, value FROM app_settings;');
    if (settingsRows.length > 0 && settingsRows[0].values) {
      for (const row of settingsRows[0].values) {
        const key = String(row[0]);
        const val = String(row[1]);
        if (key === 'active_live_id') result.activeLiveId = val;
        if (key === 'settings') {
          try { result.settings = JSON.parse(val); } catch {}
        }
        if (key === 'active_facebook_page') {
          try { result.activeFacebookPage = JSON.parse(val); } catch {}
        }
      }
    }

    // 2. Products
    const prodRows = db.exec('SELECT id, code, name, stock_qty, price, cost_price, image_file, live_id FROM products ORDER BY id ASC;');
    if (prodRows.length > 0 && prodRows[0].values) {
      result.products = prodRows[0].values.map((r: any) => ({
        id: Number(r[0]),
        code: String(r[1]),
        name: String(r[2]),
        stock_qty: Number(r[3]),
        price: Number(r[4]),
        cost_price: Number(r[5] || 0),
        image_file: String(r[6] || ''),
        live_id: String(r[7] || '').trim() || (result.activeLiveId || '1626350178950100')
      }));
    }

    // 3. Customers
    const custRows = db.exec('SELECT customer_id, facebook_user_id, facebook_name, phone_number, address, is_vip, is_blacklist FROM customers ORDER BY customer_id ASC;');
    if (custRows.length > 0 && custRows[0].values) {
      result.customers = custRows[0].values.map((r: any) => ({
        customer_id: Number(r[0]),
        facebook_user_id: String(r[1]),
        facebook_name: String(r[2]),
        phone_number: String(r[3] || ''),
        address: String(r[4] || ''),
        is_vip: Boolean(r[5]),
        is_blacklist: Boolean(r[6])
      }));
    }

    // 4. Invoices
    const invRows = db.exec('SELECT * FROM invoices ORDER BY invoice_id ASC;');
    if (invRows.length > 0 && invRows[0].values) {
      const cols = invRows[0].columns;
      result.invoices = invRows[0].values.map((r: any) => {
        const rowObj: any = {};
        cols.forEach((col, idx) => {
          rowObj[col] = r[idx];
        });

        let items = [];
        let comments = [];
        let unmatched = [];
        let commentIds: string[] = [];

        try { items = JSON.parse(rowObj.items_json || '[]'); } catch {}
        try { comments = JSON.parse(rowObj.comments_json || '[]'); } catch {}
        try { unmatched = JSON.parse(rowObj.unmatched_comments_json || '[]'); } catch {}
        try { commentIds = JSON.parse(rowObj.comment_ids_json || '[]'); } catch {}

        const lastCommentId = rowObj.last_comment_id ? String(rowObj.last_comment_id).trim() : undefined;
        if (lastCommentId && !commentIds.includes(lastCommentId)) {
          commentIds.unshift(lastCommentId);
        }

        return {
          invoice_id: Number(rowObj.invoice_id),
          basket_no: Number(rowObj.basket_no || rowObj.invoice_id),
          live_id: String(rowObj.live_id || ''),
          created_at: String(rowObj.created_at || ''),
          facebook_user_id: String(rowObj.facebook_user_id || ''),
          facebook_name: String(rowObj.facebook_name || ''),
          phone_number: String(rowObj.phone_number || ''),
          address: String(rowObj.address || ''),
          location_zone: rowObj.location_zone || 'PP',
          location_label: rowObj.location_label || '🏙️ ភ្នំពេញ',
          total_amount: Number(rowObj.total_amount || 0),
          shipping_fee: Number(rowObj.shipping_fee || 2.0),
          is_free_ship: Boolean(rowObj.is_free_ship),
          status: rowObj.status || 'Pending',
          packing_stage: rowObj.packing_stage || 'UNPICKED',
          staged_by: rowObj.staged_by || undefined,
          staged_at: rowObj.staged_at || undefined,
          verified_by: rowObj.verified_by || undefined,
          verified_at: rowObj.verified_at || undefined,
          paid_by: rowObj.paid_by || undefined,
          paid_at: rowObj.paid_at || undefined,
          msg_status: rowObj.msg_status || 'UNSENT',
          last_comment_id: lastCommentId || undefined,
          comment_ids: commentIds.length > 0 ? commentIds : (lastCommentId ? [lastCommentId] : undefined),
          comments,
          unmatched_comments: unmatched,
          items
        };
      });
    }

    // 5. Packer logs
    const logRows = db.exec('SELECT log_id, invoice_id, packer_name, items_count, duration_seconds, packed_at, facebook_name, total_amount FROM packer_logs ORDER BY log_id DESC;');
    if (logRows.length > 0 && logRows[0].values) {
      result.packerLogs = logRows[0].values.map((r: any) => ({
        log_id: Number(r[0]),
        invoice_id: Number(r[1]),
        packer_name: String(r[2]),
        items_count: Number(r[3]),
        duration_seconds: Number(r[4]),
        packed_at: String(r[5]),
        facebook_name: String(r[6]),
        total_amount: Number(r[7])
      }));
    }

    // 6. Raw Comments
    try {
      const rawRows = db.exec('SELECT comment_id, live_id, invoice_id, facebook_user_id, facebook_name, comment_text, created_at, picture_url, is_matched FROM raw_comments ORDER BY created_at ASC;');
      if (rawRows.length > 0 && rawRows[0].values) {
        result.rawComments = rawRows[0].values.map((r: any) => ({
          comment_id: String(r[0]),
          live_id: String(r[1] || ''),
          invoice_id: r[2] !== null && r[2] !== undefined ? Number(r[2]) : undefined,
          facebook_user_id: String(r[3] || ''),
          facebook_name: String(r[4] || ''),
          comment_text: String(r[5] || ''),
          created_at: String(r[6] || ''),
          picture_url: String(r[7] || ''),
          is_matched: Boolean(r[8])
        }));
      }
    } catch {}

    return result;
  } catch (err) {
    console.error('[SQLite] Error reading from pos.db:', err);
    return null;
  }
}

/**
 * Returns raw pos.db buffer for 1-Click Backup.
 */
export function getSqliteDatabaseBuffer(): Buffer | null {
  if (fs.existsSync(SQLITE_DB_PATH)) {
    return fs.readFileSync(SQLITE_DB_PATH);
  }
  return null;
}
