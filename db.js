import Database from 'better-sqlite3';
import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

// Detect Turso / libSQL cloud database environment variables (Vercel Marketplace or explicit config)
function resolveTursoConfig() {
  const urlCandidates = [
    process.env.TURSO_DATABASE_URL,
    process.env.STORAGE_TURSO_DATABASE_URL,
    process.env.LIBSQL_URL,
    process.env.DATABASE_URL
  ];
  const url = urlCandidates.find(v => typeof v === 'string' && /^(libsql|https?):\/\//i.test(v.trim()));
  if (!url) return null;

  // Locally, only use Turso if explicitly configured via TURSO_DATABASE_URL / USE_TURSO
  if (!isVercel && !process.env.TURSO_DATABASE_URL && !process.env.STORAGE_TURSO_DATABASE_URL && process.env.USE_TURSO !== 'true') {
    return null;
  }

  const token = (
    process.env.TURSO_AUTH_TOKEN ||
    process.env.STORAGE_TURSO_AUTH_TOKEN ||
    process.env.LIBSQL_AUTH_TOKEN ||
    ''
  ).trim();

  return { url: url.trim(), authToken: token || undefined };
}

// -------------------------------------------------------------
// Database Driver Adapter (Unified Local SQLite + Cloud Turso)
// -------------------------------------------------------------
const tursoConfig = resolveTursoConfig();
let dbMode = tursoConfig ? 'turso' : 'local-sqlite';
let localDb = null;
let tursoClient = null;
let localDataDir = path.join(__dirname, 'data');

function initAdapter() {
  if (tursoConfig) {
    tursoClient = createClient({
      url: tursoConfig.url,
      authToken: tursoConfig.authToken
    });
    return;
  }

  // Local SQLite setup (with read-only /tmp fallback only if running on Vercel without Turso)
  const candidateDataDirs = [
    path.join(process.cwd(), 'data'),
    path.join(__dirname, 'data')
  ];
  let sourceDataDir = candidateDataDirs.find(d => fs.existsSync(d)) || path.join(__dirname, 'data');
  let dbPath = path.join(sourceDataDir, 'accessify.db');

  if (isVercel) {
    dbMode = 'vercel-ephemeral-fallback';
    const tmpDataDir = path.join('/tmp', 'data');
    try {
      if (!fs.existsSync(tmpDataDir)) fs.mkdirSync(tmpDataDir, { recursive: true });
    } catch (_) {}
    const tmpDbPath = path.join(tmpDataDir, 'accessify.db');
    let sourceDb = null;
    for (const dir of candidateDataDirs) {
      const candidate = path.join(dir, 'accessify.db');
      if (fs.existsSync(candidate)) {
        sourceDb = candidate;
        break;
      }
    }
    if (!fs.existsSync(tmpDbPath) && sourceDb) {
      try {
        fs.copyFileSync(sourceDb, tmpDbPath);
        console.log(`[DB] Copied source database (${fs.statSync(sourceDb).size} bytes) to /tmp`);
      } catch (err) {
        console.error('[DB] Failed copying DB to /tmp:', err);
      }
    }
    if (fs.existsSync(tmpDbPath)) {
      dbPath = tmpDbPath;
      localDataDir = tmpDataDir;
    }
  } else {
    localDataDir = sourceDataDir;
    try {
      if (!fs.existsSync(localDataDir)) fs.mkdirSync(localDataDir, { recursive: true });
    } catch (_) {}
  }

  localDb = new Database(dbPath);
  try {
    localDb.pragma('journal_mode = WAL');
  } catch (_) {
    try { localDb.pragma('journal_mode = DELETE'); } catch (__) {}
  }
  try {
    localDb.pragma('foreign_keys = ON');
  } catch (_) {}
}

initAdapter();

async function queryAll(sql, params = []) {
  if (tursoClient) {
    const res = await tursoClient.execute({ sql, args: params });
    return res.rows.map(row => ({ ...row }));
  }
  return localDb.prepare(sql).all(...params);
}

async function queryOne(sql, params = []) {
  if (tursoClient) {
    const res = await tursoClient.execute({ sql, args: params });
    return res.rows[0] ? { ...res.rows[0] } : undefined;
  }
  return localDb.prepare(sql).get(...params);
}

async function execute(sql, params = []) {
  if (tursoClient) {
    const res = await tursoClient.execute({ sql, args: params });
    return { changes: Number(res.rowsAffected || 0) };
  }
  const info = localDb.prepare(sql).run(...params);
  return { changes: Number(info.changes || 0) };
}

async function execStatements(statements) {
  if (tursoClient) {
    await tursoClient.batch(
      statements.map(s => (typeof s === 'string' ? { sql: s, args: [] } : { sql: s.sql, args: s.args || [] })),
      'write'
    );
    return;
  }
  const tx = localDb.transaction((list) => {
    for (const s of list) {
      if (typeof s === 'string') {
        localDb.exec(s);
      } else {
        localDb.prepare(s.sql).run(...(s.args || []));
      }
    }
  });
  tx(statements);
}

// -------------------------------------------------------------
// Helpers & Normalizers
// -------------------------------------------------------------
function parseJsonArray(val) {
  if (Array.isArray(val)) return val;
  if (!val || typeof val !== 'string') return [];
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || `item-${Date.now().toString().slice(-5)}`;
}

/**
 * Normalizes legacy statuses ('active' -> 'available', 'inactive' -> 'hidden')
 * while keeping canonical 'available', 'sold_out', and 'hidden' values intact.
 */
function normalizeProductStatus(rawStatus) {
  const s = String(rawStatus || 'available').toLowerCase().trim();
  if (s === 'active') return 'available';
  if (s === 'inactive') return 'hidden';
  if (s === 'available' || s === 'sold_out' || s === 'hidden') return s;
  return 'available';
}

function formatProductRow(r) {
  return {
    ...r,
    section: r.section || 'accessories',
    status: normalizeProductStatus(r.status),
    images: parseJsonArray(r.images),
    variants: parseJsonArray(r.variants),
    tags: parseJsonArray(r.tags),
    price: Number(r.price) || 0,
    comparePrice: r.comparePrice !== null && r.comparePrice !== undefined ? Number(r.comparePrice) : null,
    stock: r.stock !== null && r.stock !== undefined ? Number(r.stock) : 25,
    rating: r.rating !== null && r.rating !== undefined ? Number(r.rating) : 4.8,
    numReviews: r.numReviews !== null && r.numReviews !== undefined ? Number(r.numReviews) : 12,
    featured: Boolean(r.featured),
    newArrival: Boolean(r.newArrival)
  };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const testHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(testHash, 'hex'), Buffer.from(hash, 'hex'));
  } catch (_) {
    return testHash === hash;
  }
}

// -------------------------------------------------------------
// Schema Initialization & Non-Destructive Seed Migration
// -------------------------------------------------------------
const DEFAULT_CATEGORIES = [
  {
    id: 'chrome-hearts',
    name: 'Chrome Hearts',
    slug: 'chrome-hearts',
    section: 'accessories',
    display_order: 1,
    description: 'Heavyweight gothic cross signets, belts, and bespoke dark luxury hardware.',
    image: '/assets/images/category-chrome-hearts.jpg?v=3'
  },
  {
    id: 'chains',
    name: 'Chains & Necklaces',
    slug: 'chains',
    section: 'accessories',
    display_order: 2,
    description: '316L stainless steel cuban links, gothic pendants, and statement streetwear chains.',
    image: '/assets/images/category-chains.jpg'
  },
  {
    id: 'combos',
    name: 'Combo Sets',
    slug: 'combos',
    section: 'accessories',
    display_order: 3,
    description: 'Curated layered accessory sets designed for an instant, elevated aesthetic.',
    image: '/assets/images/category-combos.jpg?v=7'
  },
  {
    id: 'bracelets',
    name: 'Bracelets',
    slug: 'bracelets',
    section: 'accessories',
    display_order: 4,
    description: 'Heavy solid cubans, industrial lock cuffs, and surgical steel wristwear.',
    image: '/assets/images/category-bracelets.jpg?v=4'
  },
  {
    id: 'rings',
    name: 'Rings',
    slug: 'rings',
    section: 'accessories',
    display_order: 5,
    description: 'Gothic crosses, signet rings, and textured stainless steel bands.',
    image: '/assets/images/category-rings.jpg?v=3'
  },
  {
    id: 'earrings',
    name: 'Earrings',
    slug: 'earrings',
    section: 'accessories',
    display_order: 6,
    description: 'Hypoallergenic gothic dagger and venom drop earrings.',
    image: '/assets/images/category-earrings.jpg?v=4'
  },
  {
    id: 'wallets',
    name: 'Wallets & Utility',
    slug: 'wallets',
    section: 'accessories',
    display_order: 7,
    description: 'Gothic dagger wallets, embossed metal flip lighters, and tactical utility bags.',
    image: '/assets/images/category-y2k-gothic.jpg'
  },
  {
    id: 'sleek-chains',
    name: 'Sleek Chains',
    slug: 'sleek-chains',
    section: 'accessories',
    display_order: 8,
    description: 'Minimalist stainless steel pendants and everyday chains.',
    image: '/assets/images/sleek-chains.jpg'
  },
  {
    id: 'y2k-gothic-necklaces',
    name: 'Y2K Gothic Necklaces',
    slug: 'y2k-gothic-necklaces',
    section: 'accessories',
    display_order: 9,
    description: 'Statement cross-stitch necklaces and Y2K aesthetic chains.',
    image: '/assets/images/category-y2k-gothic.jpg?v=3'
  },
  {
    id: 'denims',
    name: 'DENIMS',
    slug: 'denims',
    section: 'clothing',
    display_order: 1,
    description: 'Heavyweight raw denim, distressed gothic cuts, and oversized silhouettes.',
    image: '/assets/images/category-denim.jpg?v=3'
  },
  {
    id: 'tops',
    name: 'TOPS',
    slug: 'tops',
    section: 'clothing',
    display_order: 2,
    description: 'Graphic oversized tees, boxy silhouettes, and streetwear drops.',
    image: '/assets/images/category-tops.jpg?v=1'
  }
];

let initPromise = null;
let currentVersion = Date.now();

async function ensureSchema() {
  const ddlStatements = [
    `CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      original_id INTEGER,
      name TEXT NOT NULL,
      slug TEXT UNIQUE,
      section TEXT DEFAULT 'accessories',
      category TEXT NOT NULL,
      price REAL NOT NULL,
      comparePrice REAL,
      description TEXT,
      images TEXT,
      variants TEXT,
      stock INTEGER DEFAULT 25,
      rating REAL DEFAULT 4.8,
      numReviews INTEGER DEFAULT 12,
      featured INTEGER DEFAULT 0,
      newArrival INTEGER DEFAULT 0,
      status TEXT DEFAULT 'available',
      sku_code TEXT,
      branch_id INTEGER DEFAULT 2,
      tags TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      section TEXT DEFAULT 'accessories',
      display_order INTEGER DEFAULT 0,
      description TEXT,
      image TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      details TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT DEFAULT '',
      city TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT UNIQUE,
      customer_id TEXT,
      customer_name TEXT NOT NULL,
      customer_phone TEXT,
      customer_email TEXT,
      shipping_address TEXT DEFAULT '',
      items TEXT DEFAULT '[]',
      subtotal REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      payment_status TEXT DEFAULT 'pending',
      order_status TEXT DEFAULT 'pending',
      source TEXT DEFAULT 'whatsapp',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS banners (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subtitle TEXT DEFAULT '',
      badge_text TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      link_url TEXT DEFAULT '',
      position TEXT DEFAULT 'hero',
      active INTEGER DEFAULT 1,
      display_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`
  ];

  await execStatements(ddlStatements);

  // Safe migrations for older local DBs missing section columns
  try { await execute("ALTER TABLE products ADD COLUMN section TEXT DEFAULT 'accessories'"); } catch (_) {}
  try { await execute("ALTER TABLE categories ADD COLUMN section TEXT DEFAULT 'accessories'"); } catch (_) {}
  try {
    await execute("UPDATE products SET section = 'accessories' WHERE section IS NULL OR section = ''");
    await execute("UPDATE categories SET section = 'accessories' WHERE section IS NULL OR section = ''");
  } catch (_) {}
}

async function seedInitialDataIfEmpty() {
  // 1. Seed categories ONLY if table has zero records (so admin edits & deletes are never overwritten)
  const catCount = await queryOne(`SELECT COUNT(*) as count FROM categories`);
  if (!catCount || Number(catCount.count) === 0) {
    let seedCats = DEFAULT_CATEGORIES;
    const backupFile = findBackupFile();
    if (backupFile) {
      try {
        const parsed = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
        if (Array.isArray(parsed.categories) && parsed.categories.length > 0) {
          seedCats = parsed.categories;
        }
      } catch (_) {}
    }

    const catStatements = seedCats.map(c => ({
      sql: `INSERT OR IGNORE INTO categories (id, name, slug, section, display_order, description, image)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        c.id,
        c.name,
        c.slug || c.id,
        c.section === 'clothing' ? 'clothing' : 'accessories',
        Number(c.display_order) || 0,
        c.description || '',
        c.image || ''
      ]
    }));
    if (catStatements.length > 0) await execStatements(catStatements);
  }

  // 2. Seed default admin user if missing
  const username = process.env.ADMIN_USER || 'admin';
  const rawPassword = process.env.ADMIN_PASSWORD || 'accessify2026';
  const existingAdmin = await queryOne(`SELECT id FROM admin_users WHERE username = ?`, [username]);
  if (!existingAdmin) {
    const { hash, salt } = hashPassword(rawPassword);
    await execute(
      `INSERT INTO admin_users (id, username, password_hash, salt) VALUES (?, ?, ?, ?)`,
      [crypto.randomUUID(), username, hash, salt]
    );
    console.log(`[DB] Default admin user initialized: ${username}`);
  }

  // 3. Ensure session secret exists in settings so serverless instances verify the same HMAC tokens
  const secretRow = await queryOne(`SELECT value FROM settings WHERE key = 'session_secret'`);
  if (!secretRow || !secretRow.value) {
    const newSecret = crypto.randomBytes(48).toString('hex');
    await execute(
      `INSERT OR IGNORE INTO settings (key, value) VALUES ('session_secret', ?)`,
      [newSecret]
    );
  }

  // 4. Seed products ONLY when products table is empty (preserve all existing data!)
  const prodCount = await queryOne(`SELECT COUNT(*) as count FROM products`);
  if (prodCount && Number(prodCount.count) > 0) {
    return;
  }

  // First try reading directly from bundled local SQLite if migrating to empty Turso
  if (tursoClient) {
    const localDbCandidate = [
      path.join(process.cwd(), 'data', 'accessify.db'),
      path.join(__dirname, 'data', 'accessify.db')
    ].find(p => fs.existsSync(p));

    if (localDbCandidate) {
      try {
        const srcDb = new Database(localDbCandidate, { readonly: true });
        const srcRows = srcDb.prepare(`SELECT * FROM products`).all();
        srcDb.close();
        if (srcRows.length > 0) {
          console.log(`[DB] Migrating ${srcRows.length} products from local accessify.db into Turso...`);
          const chunkSize = 40;
          for (let i = 0; i < srcRows.length; i += chunkSize) {
            const chunk = srcRows.slice(i, i + chunkSize).map(r => ({
              sql: `INSERT OR IGNORE INTO products (
                id, original_id, name, slug, section, category, price, comparePrice,
                description, images, variants, stock, rating, numReviews,
                featured, newArrival, status, sku_code, branch_id, tags, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              args: [
                r.id, r.original_id ?? null, r.name, r.slug ?? null, r.section || 'accessories',
                r.category, Number(r.price) || 0, r.comparePrice ?? null, r.description || '',
                r.images || '[]', r.variants || '[]', r.stock ?? 25, r.rating ?? 4.8,
                r.numReviews ?? 12, r.featured ? 1 : 0, r.newArrival ? 1 : 0,
                r.status || 'available', r.sku_code || '', r.branch_id ?? 2, r.tags || '[]',
                r.created_at || new Date().toISOString(), r.updated_at || new Date().toISOString()
              ]
            }));
            await execStatements(chunk);
          }
          await bumpVersion();
          console.log(`[DB] Successfully migrated ${srcRows.length} products into Turso.`);
          return;
        }
      } catch (err) {
        console.warn('[DB] Local SQLite read fallback skipped:', err.message);
      }
    }
  }

  // Fallback to JSON seed/backup
  const jsonCandidates = [
    path.join(localDataDir, 'database_backup.json'),
    path.join(localDataDir, 'initial_products.json'),
    path.join(process.cwd(), 'data', 'database_backup.json'),
    path.join(process.cwd(), 'data', 'initial_products.json'),
    path.join(__dirname, 'data', 'database_backup.json'),
    path.join(__dirname, 'data', 'initial_products.json')
  ];
  const jsonPath = jsonCandidates.find(p => fs.existsSync(p));
  if (!jsonPath) {
    console.warn('[DB] No seed JSON file found, skipping product seed.');
    return;
  }

  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const products = Array.isArray(raw) ? raw : (raw.products || []);
  console.log(`[DB] Seeding ${products.length} authentic products from ${jsonPath}...`);

  const chunkSize = 40;
  for (let i = 0; i < products.length; i += chunkSize) {
    const chunk = products.slice(i, i + chunkSize).map(item => ({
      sql: `INSERT OR IGNORE INTO products (
        id, original_id, name, slug, section, category, price, comparePrice,
        description, images, variants, stock, rating, numReviews,
        featured, newArrival, status, sku_code, branch_id, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        item.id || `acc_${item.original_id || Date.now()}`,
        item.original_id ?? null,
        item.name,
        item.slug || `${slugify(item.name)}-${item.original_id || Math.floor(Math.random() * 10000)}`,
        item.section === 'clothing' ? 'clothing' : 'accessories',
        item.category,
        Number(item.price) || 0,
        item.comparePrice ? Number(item.comparePrice) : null,
        item.description || '',
        JSON.stringify(Array.isArray(item.images) ? item.images : []),
        JSON.stringify(Array.isArray(item.variants) ? item.variants : []),
        item.stock !== undefined ? Number(item.stock) : 25,
        item.rating || 4.8,
        item.numReviews || 12,
        item.featured ? 1 : 0,
        item.newArrival ? 1 : 0,
        (item.stock !== undefined && item.stock <= 0) ? 'sold_out' : (item.status || 'available'),
        item.sku_code || '',
        item.branch_id || 2,
        JSON.stringify(Array.isArray(item.tags) ? item.tags : [])
      ]
    }));
    await execStatements(chunk);
  }
  await bumpVersion();
  console.log(`[DB] Successfully seeded ${products.length} products.`);
}

function findBackupFile() {
  const candidates = [
    path.join(localDataDir, 'database_backup.json'),
    path.join(process.cwd(), 'data', 'database_backup.json'),
    path.join(__dirname, 'data', 'database_backup.json')
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

export async function ensureInitialized() {
  if (!initPromise) {
    initPromise = (async () => {
      await ensureSchema();
      await seedInitialDataIfEmpty();
      await getDbVersion();
    })().catch(err => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

export function getDbMode() {
  return dbMode;
}

// -------------------------------------------------------------
// Version Management & Auth Sessions
// -------------------------------------------------------------
export async function bumpVersion() {
  const next = Date.now();
  currentVersion = next > currentVersion ? next : currentVersion + 1;
  await execute(
    `INSERT INTO settings (key, value) VALUES ('db_version', ?) ON CONFLICT(key) DO UPDATE SET value = ?`,
    [String(currentVersion), String(currentVersion)]
  );
  return currentVersion;
}

export async function getDbVersion() {
  await ensureInitializedInternal();
  try {
    const row = await queryOne(`SELECT value FROM settings WHERE key = 'db_version'`);
    if (row && row.value) {
      currentVersion = Number(row.value);
    }
  } catch (err) {
    console.error('Error getting DB version:', err);
  }
  return currentVersion;
}

async function ensureInitializedInternal() {
  if (!initPromise) {
    await ensureInitialized();
  }
}

export async function getSessionSecret() {
  await ensureInitialized();
  if (process.env.ADMIN_SESSION_SECRET) return process.env.ADMIN_SESSION_SECRET;
  const row = await queryOne(`SELECT value FROM settings WHERE key = 'session_secret'`);
  if (row && row.value) return row.value;
  const generated = crypto.randomBytes(48).toString('hex');
  await execute(
    `INSERT INTO settings (key, value) VALUES ('session_secret', ?) ON CONFLICT(key) DO UPDATE SET value = ?`,
    [generated, generated]
  );
  return generated;
}

export async function verifyAdminCredentials(username, password) {
  await ensureInitialized();
  const user = await queryOne(`SELECT * FROM admin_users WHERE username = ?`, [username]);
  if (!user) return false;
  return verifyPassword(password, user.password_hash, user.salt);
}

export async function updateAdminPassword(username, currentPassword, newPassword) {
  await ensureInitialized();
  const valid = await verifyAdminCredentials(username, currentPassword);
  if (!valid) return { success: false, error: 'Current password is incorrect' };
  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: 'New password must be at least 6 characters' };
  }
  const { hash, salt } = hashPassword(newPassword);
  await execute(`UPDATE admin_users SET password_hash = ?, salt = ? WHERE username = ?`, [hash, salt, username]);
  await logAudit('PASSWORD_UPDATED', `Admin password updated for ${username}`);
  return { success: true };
}

export async function createSessionRecord(tokenHash, username, expiresAt) {
  await ensureInitialized();
  // Clean up expired sessions periodically
  try {
    await execute(`DELETE FROM admin_sessions WHERE expires_at < ?`, [Date.now()]);
  } catch (_) {}
  await execute(
    `INSERT OR REPLACE INTO admin_sessions (token_hash, username, expires_at) VALUES (?, ?, ?)`,
    [tokenHash, username, expiresAt]
  );
}

export async function verifySessionRecord(tokenHash) {
  await ensureInitialized();
  const row = await queryOne(`SELECT username, expires_at FROM admin_sessions WHERE token_hash = ?`, [tokenHash]);
  if (!row) return null;
  if (Number(row.expires_at) < Date.now()) {
    await execute(`DELETE FROM admin_sessions WHERE token_hash = ?`, [tokenHash]);
    return null;
  }
  return { username: row.username, expiresAt: Number(row.expires_at) };
}

export async function deleteSessionRecord(tokenHash) {
  await ensureInitialized();
  await execute(`DELETE FROM admin_sessions WHERE token_hash = ?`, [tokenHash]);
}

// -------------------------------------------------------------
// Categories CRUD
// -------------------------------------------------------------
export async function getAllCategories(section) {
  await ensureInitialized();
  let sql = `SELECT * FROM categories`;
  const params = [];
  if (section && section !== 'all') {
    sql += ` WHERE section = ?`;
    params.push(section);
  }
  sql += ` ORDER BY display_order ASC, name ASC`;
  const cats = await queryAll(sql, params);

  const results = [];
  for (const c of cats) {
    const catSec = c.section || 'accessories';
    let countRow;
    if (c.id === 'rings') {
      countRow = await queryOne(`
        SELECT COUNT(*) as count FROM products
        WHERE status NOT IN ('hidden', 'inactive') AND section = ? AND (
          category = 'rings'
          OR tags LIKE '%"rings"%'
          OR tags LIKE '%"ring"%'
          OR LOWER(name) LIKE '% ring%'
          OR LOWER(name) LIKE 'ring %'
        ) AND LOWER(name) NOT LIKE '%earring%'
      `, [catSec]);
    } else {
      countRow = await queryOne(`
        SELECT COUNT(*) as count FROM products
        WHERE status NOT IN ('hidden', 'inactive') AND section = ? AND (category = ? OR tags LIKE ?)
      `, [catSec, c.id, `%"${c.id}"%`]);
    }
    results.push({
      ...c,
      section: catSec,
      count: countRow ? Number(countRow.count) : 0
    });
  }
  return results;
}

export async function addCategory(data) {
  await ensureInitialized();
  const baseId = slugify(data.id || data.name);
  let id = baseId;
  const existing = await queryOne(`SELECT id FROM categories WHERE id = ? OR slug = ?`, [id, id]);
  if (existing) {
    id = `${baseId}-${Date.now().toString().slice(-4)}`;
  }
  const slug = data.slug ? slugify(data.slug) : id;
  const section = data.section === 'clothing' ? 'clothing' : 'accessories';
  const displayOrder = data.display_order !== undefined && data.display_order !== '' ? Number(data.display_order) : 99;

  await execute(
    `INSERT INTO categories (id, name, slug, section, display_order, description, image) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, data.name.trim(), slug, section, displayOrder, data.description || '', data.image || '']
  );
  await logAudit('CREATE_CATEGORY', `Created category ${data.name.trim()} (${id}) in [${section.toUpperCase()}]`);
  await bumpVersion();
  return await queryOne(`SELECT * FROM categories WHERE id = ?`, [id]);
}

export async function updateCategory(id, data) {
  await ensureInitialized();
  const current = await queryOne(`SELECT * FROM categories WHERE id = ?`, [id]);
  if (!current) return null;

  const nextName = data.name !== undefined ? String(data.name).trim() : current.name;
  const nextSection = data.section !== undefined ? (data.section === 'clothing' ? 'clothing' : 'accessories') : current.section;
  const nextOrder = data.display_order !== undefined && data.display_order !== '' ? Number(data.display_order) : current.display_order;
  const nextDesc = data.description !== undefined ? data.description : current.description;
  const nextImg = data.image !== undefined ? data.image : current.image;

  await execute(
    `UPDATE categories SET name = ?, section = ?, display_order = ?, description = ?, image = ? WHERE id = ?`,
    [nextName, nextSection, nextOrder, nextDesc, nextImg, id]
  );

  // If category moved sections, optionally keep products aligned if requested
  if (data.syncProductsSection && nextSection !== current.section) {
    await execute(`UPDATE products SET section = ?, updated_at = datetime('now') WHERE category = ?`, [nextSection, id]);
  }

  await logAudit('UPDATE_CATEGORY', `Updated category ${nextName} (${id})`);
  await bumpVersion();
  return await queryOne(`SELECT * FROM categories WHERE id = ?`, [id]);
}

export async function deleteCategory(id) {
  await ensureInitialized();
  const current = await queryOne(`SELECT name FROM categories WHERE id = ?`, [id]);
  if (!current) return false;
  const res = await execute(`DELETE FROM categories WHERE id = ?`, [id]);
  if (res.changes > 0) {
    await logAudit('DELETE_CATEGORY', `Deleted category ${current.name} (${id})`);
    await bumpVersion();
    return true;
  }
  return false;
}

// -------------------------------------------------------------
// Products CRUD & Queries
// -------------------------------------------------------------
export async function getProducts(options = {}) {
  await ensureInitialized();
  const {
    section,
    category,
    search,
    sort = 'default',
    status,
    featured,
    limit,
    offset = 0,
    includeHidden = false
  } = options;

  const conditions = [];
  const params = [];

  if (!includeHidden) {
    conditions.push("status NOT IN ('hidden', 'inactive')");
  }

  if (section && section !== 'all') {
    conditions.push("section = ?");
    params.push(section);
  }

  if (category && category !== 'all') {
    if (category === 'rings') {
      conditions.push(`(
        category = 'rings'
        OR tags LIKE '%"rings"%'
        OR tags LIKE '%"ring"%'
        OR LOWER(name) LIKE '% ring%'
        OR LOWER(name) LIKE 'ring %'
      ) AND LOWER(name) NOT LIKE '%earring%'`);
    } else {
      conditions.push("(category = ? OR tags LIKE ?)");
      params.push(category, `%"${category}"%`);
    }
  }

  if (status === 'available' || status === 'active') {
    conditions.push("status IN ('available', 'active') AND stock > 0");
  } else if (status === 'sold_out') {
    conditions.push("(status = 'sold_out' OR stock <= 0) AND status NOT IN ('hidden', 'inactive')");
  } else if (status === 'hidden' || status === 'inactive') {
    conditions.push("status IN ('hidden', 'inactive')");
  } else if (status && status !== 'all') {
    conditions.push("status = ?");
    params.push(status);
  }

  if (featured === true || featured === 'true') {
    conditions.push("featured = 1");
  }

  if (search && search.trim()) {
    const q = `%${search.trim().toLowerCase()}%`;
    conditions.push("(LOWER(name) LIKE ? OR LOWER(description) LIKE ? OR LOWER(category) LIKE ? OR LOWER(sku_code) LIKE ? OR LOWER(tags) LIKE ?)");
    params.push(q, q, q, q, q);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let orderBy = "ORDER BY featured DESC, newArrival DESC, created_at DESC, id DESC";
  if (sort === 'price_asc') {
    orderBy = "ORDER BY price ASC";
  } else if (sort === 'price_desc') {
    orderBy = "ORDER BY price DESC";
  } else if (sort === 'name_asc') {
    orderBy = "ORDER BY name ASC";
  } else if (sort === 'newest') {
    orderBy = "ORDER BY created_at DESC, newArrival DESC, id DESC";
  }

  const totalRow = await queryOne(`SELECT COUNT(*) as count FROM products ${whereClause}`, params);
  const total = totalRow ? Number(totalRow.count) : 0;

  let limitClause = '';
  const rowParams = [...params];
  if (limit) {
    limitClause = `LIMIT ? OFFSET ?`;
    rowParams.push(Number(limit), Number(offset));
  }

  const rows = await queryAll(`SELECT * FROM products ${whereClause} ${orderBy} ${limitClause}`, rowParams);
  const formatted = rows.map(formatProductRow);
  const version = await getDbVersion();

  return {
    total,
    count: formatted.length,
    version,
    products: formatted
  };
}

export async function getProductByIdOrSlug(idOrSlug) {
  await ensureInitialized();
  const row = await queryOne(`SELECT * FROM products WHERE id = ? OR slug = ?`, [idOrSlug, idOrSlug]);
  if (!row) return null;

  const product = formatProductRow(row);

  const relatedRows = await queryAll(`
    SELECT * FROM products
    WHERE section = ? AND category = ? AND id != ? AND status NOT IN ('hidden', 'inactive')
    ORDER BY featured DESC, id DESC
    LIMIT 4
  `, [product.section, product.category, product.id]);

  return {
    product,
    related: relatedRows.map(formatProductRow)
  };
}

async function generateUniqueProductSlug(name, requestedSlug, excludeId = null) {
  const base = slugify(requestedSlug || name);
  let candidate = base;
  let attempt = 0;

  while (attempt < 10) {
    const existing = excludeId
      ? await queryOne(`SELECT id FROM products WHERE slug = ? AND id != ?`, [candidate, excludeId])
      : await queryOne(`SELECT id FROM products WHERE slug = ?`, [candidate]);
    if (!existing) return candidate;
    attempt++;
    candidate = `${base}-${Date.now().toString().slice(-4)}-${crypto.randomBytes(2).toString('hex')}`;
  }
  return `${base}-${crypto.randomBytes(4).toString('hex')}`;
}

export async function createProduct(data) {
  await ensureInitialized();
  const cleanName = String(data.name || '').trim();
  const section = data.section === 'clothing' ? 'clothing' : 'accessories';

  // Duplicate guard: reject identical name + category created within the last 5 seconds (accidental double submit)
  const recentDup = await queryOne(
    `SELECT id, name FROM products WHERE LOWER(name) = LOWER(?) AND category = ? AND created_at >= datetime('now', '-5 seconds')`,
    [cleanName, data.category]
  );
  if (recentDup && !data.allowDuplicate) {
    const err = new Error(`A product named "${recentDup.name}" in this category was just created. Duplicate submission prevented.`);
    err.statusCode = 409;
    throw err;
  }

  const id = data.id || `acc_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const slug = await generateUniqueProductSlug(cleanName, data.slug);

  let stock = data.stock !== undefined && data.stock !== '' ? Math.max(0, Number(data.stock) || 0) : 25;
  let status = normalizeProductStatus(data.status || 'available');
  if (stock <= 0 && status === 'available') {
    status = 'sold_out';
  } else if (status === 'sold_out' && stock > 0 && data.syncStockOnSoldOut) {
    stock = 0;
  }

  const imagesArr = Array.isArray(data.images) ? data.images : (data.images ? [data.images] : []);
  const variantsArr = Array.isArray(data.variants) ? data.variants : [];
  const tagsArr = Array.isArray(data.tags) ? data.tags : [];
  const sku = (data.sku_code && String(data.sku_code).trim()) || `ACC-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  await execute(`
    INSERT INTO products (
      id, original_id, name, slug, section, category, price, comparePrice,
      description, images, variants, stock, rating, numReviews,
      featured, newArrival, status, sku_code, branch_id, tags
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    data.original_id || null,
    cleanName,
    slug,
    section,
    data.category,
    Number(data.price),
    data.comparePrice !== undefined && data.comparePrice !== '' && data.comparePrice !== null ? Number(data.comparePrice) : null,
    data.description || '',
    JSON.stringify(imagesArr),
    JSON.stringify(variantsArr),
    stock,
    data.rating ? Number(data.rating) : 4.8,
    data.numReviews ? Number(data.numReviews) : 12,
    data.featured ? 1 : 0,
    data.newArrival !== undefined ? (data.newArrival ? 1 : 0) : 1,
    status,
    sku,
    data.branch_id || 2,
    JSON.stringify(tagsArr)
  ]);

  await logAudit('CREATE_PRODUCT', `Created product ${cleanName} (${id}) in [${section.toUpperCase()}]`);
  await bumpVersion();

  const res = await getProductByIdOrSlug(id);
  return res?.product;
}

export async function updateProduct(id, data) {
  await ensureInitialized();
  const current = await queryOne(`SELECT * FROM products WHERE id = ?`, [id]);
  if (!current) return null;

  const nextName = data.name !== undefined ? String(data.name).trim() : current.name;
  const nextSlug = data.slug ? await generateUniqueProductSlug(nextName, data.slug, id) : current.slug;
  const nextSection = data.section !== undefined ? (data.section === 'clothing' ? 'clothing' : 'accessories') : (current.section || 'accessories');
  const nextCategory = data.category !== undefined && data.category !== '' ? data.category : current.category;
  const nextPrice = data.price !== undefined && data.price !== '' ? Number(data.price) : Number(current.price);

  let nextComparePrice = current.comparePrice;
  if (data.comparePrice !== undefined) {
    nextComparePrice = (data.comparePrice === '' || data.comparePrice === null) ? null : Number(data.comparePrice);
  }

  let nextStock = data.stock !== undefined && data.stock !== '' ? Math.max(0, Number(data.stock) || 0) : Number(current.stock ?? 25);
  let nextStatus = data.status !== undefined && data.status !== '' ? normalizeProductStatus(data.status) : normalizeProductStatus(current.status);

  // Sync stock/status coherently
  if (data.status === 'available' && nextStock <= 0 && data.stock === undefined) {
    nextStock = 1;
  } else if (data.stock !== undefined && nextStock <= 0 && nextStatus === 'available') {
    nextStatus = 'sold_out';
  } else if (data.stock !== undefined && nextStock > 0 && current.stock <= 0 && data.status === undefined && normalizeProductStatus(current.status) === 'sold_out') {
    nextStatus = 'available';
  }

  const nextDesc = data.description !== undefined ? data.description : current.description;
  const nextImages = data.images !== undefined ? JSON.stringify(Array.isArray(data.images) ? data.images : [data.images]) : current.images;
  const nextVariants = data.variants !== undefined ? JSON.stringify(Array.isArray(data.variants) ? data.variants : []) : current.variants;
  const nextTags = data.tags !== undefined ? JSON.stringify(Array.isArray(data.tags) ? data.tags : []) : current.tags;
  const nextFeatured = data.featured !== undefined ? (data.featured ? 1 : 0) : current.featured;
  const nextNewArrival = data.newArrival !== undefined ? (data.newArrival ? 1 : 0) : current.newArrival;
  const nextSku = data.sku_code !== undefined ? String(data.sku_code).trim() : current.sku_code;

  await execute(`
    UPDATE products SET
      name = ?,
      slug = ?,
      section = ?,
      category = ?,
      price = ?,
      comparePrice = ?,
      description = ?,
      images = ?,
      variants = ?,
      stock = ?,
      featured = ?,
      newArrival = ?,
      status = ?,
      sku_code = ?,
      tags = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `, [
    nextName,
    nextSlug,
    nextSection,
    nextCategory,
    nextPrice,
    nextComparePrice,
    nextDesc,
    nextImages,
    nextVariants,
    nextStock,
    nextFeatured,
    nextNewArrival,
    nextStatus,
    nextSku,
    nextTags,
    id
  ]);

  await logAudit('UPDATE_PRODUCT', `Updated product ${nextName} (${id}) [${nextSection.toUpperCase()}]`);
  await bumpVersion();

  const res = await getProductByIdOrSlug(id);
  return res?.product;
}

export async function deleteProduct(id) {
  await ensureInitialized();
  const current = await queryOne(`SELECT name FROM products WHERE id = ?`, [id]);
  if (!current) return false;

  await execute(`DELETE FROM products WHERE id = ?`, [id]);
  await logAudit('DELETE_PRODUCT', `Deleted product ${current.name} (${id})`);
  await bumpVersion();
  return true;
}

export async function setProductStatus(id, rawStatus) {
  await ensureInitialized();
  const status = normalizeProductStatus(rawStatus);
  const current = await queryOne(`SELECT stock, name FROM products WHERE id = ?`, [id]);
  if (!current) return null;

  let nextStock = Number(current.stock ?? 25);
  if (status === 'available' && nextStock <= 0) {
    nextStock = 10;
  }

  const res = await execute(
    `UPDATE products SET status = ?, stock = ?, updated_at = datetime('now') WHERE id = ?`,
    [status, nextStock, id]
  );

  if (res.changes > 0) {
    await logAudit('STATUS_CHANGE', `Set ${current.name} (${id}) status to ${status} (stock: ${nextStock})`);
    await bumpVersion();
    return (await getProductByIdOrSlug(id))?.product;
  }
  return null;
}

export async function updateProductStock(id, stockValue) {
  await ensureInitialized();
  const current = await queryOne(`SELECT name, status FROM products WHERE id = ?`, [id]);
  if (!current) return null;

  const stock = Math.max(0, Math.floor(Number(stockValue) || 0));
  let status = normalizeProductStatus(current.status);
  if (stock === 0 && status === 'available') {
    status = 'sold_out';
  } else if (stock > 0 && status === 'sold_out') {
    status = 'available';
  }

  await execute(
    `UPDATE products SET stock = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
    [stock, status, id]
  );

  await logAudit('STOCK_UPDATE', `Updated ${current.name} (${id}) stock to ${stock} (${status})`);
  await bumpVersion();
  return (await getProductByIdOrSlug(id))?.product;
}

// -------------------------------------------------------------
// Orders CRUD
// -------------------------------------------------------------
export async function getOrders(options = {}) {
  await ensureInitialized();
  const { status, search } = options;
  const conditions = [];
  const params = [];

  if (status && status !== 'all') {
    conditions.push('order_status = ?');
    params.push(status);
  }
  if (search && search.trim()) {
    const q = `%${search.trim().toLowerCase()}%`;
    conditions.push('(LOWER(order_number) LIKE ? OR LOWER(customer_name) LIKE ? OR LOWER(customer_phone) LIKE ? OR LOWER(customer_email) LIKE ?)');
    params.push(q, q, q, q);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await queryAll(`SELECT * FROM orders ${where} ORDER BY created_at DESC`, params);
  return rows.map(r => ({
    ...r,
    items: parseJsonArray(r.items),
    subtotal: Number(r.subtotal) || 0,
    discount_amount: Number(r.discount_amount) || 0,
    total_amount: Number(r.total_amount) || 0
  }));
}

export async function createOrder(data) {
  await ensureInitialized();
  const id = data.id || `ord_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
  const orderNumber = data.order_number || `ACC-ORD-${Date.now().toString().slice(-6)}`;
  const items = Array.isArray(data.items) ? data.items : [];
  const subtotal = data.subtotal !== undefined ? Number(data.subtotal) : items.reduce((s, it) => s + (Number(it.price || 0) * Number(it.qty || 1)), 0);
  const discount = Number(data.discount_amount) || 0;
  const total = data.total_amount !== undefined && data.total_amount !== '' ? Number(data.total_amount) : Math.max(0, subtotal - discount);

  // Automatically create/find customer record if phone or email is supplied
  let customerId = data.customer_id || null;
  if (!customerId && data.customer_name && (data.customer_phone || data.customer_email)) {
    const existingCust = data.customer_phone
      ? await queryOne(`SELECT id FROM customers WHERE phone = ?`, [String(data.customer_phone).trim()])
      : await queryOne(`SELECT id FROM customers WHERE LOWER(email) = LOWER(?)`, [String(data.customer_email).trim()]);

    if (existingCust) {
      customerId = existingCust.id;
    } else {
      const cust = await createCustomer({
        name: data.customer_name,
        phone: data.customer_phone || '',
        email: data.customer_email || '',
        address: data.shipping_address || ''
      });
      customerId = cust.id;
    }
  }

  await execute(`
    INSERT INTO orders (
      id, order_number, customer_id, customer_name, customer_phone, customer_email,
      shipping_address, items, subtotal, discount_amount, total_amount,
      payment_status, order_status, source, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    orderNumber,
    customerId,
    String(data.customer_name || '').trim(),
    data.customer_phone || '',
    data.customer_email || '',
    data.shipping_address || '',
    JSON.stringify(items),
    subtotal,
    discount,
    total,
    data.payment_status || 'pending',
    data.order_status || 'pending',
    data.source || 'whatsapp',
    data.notes || ''
  ]);

  await logAudit('CREATE_ORDER', `Created order ${orderNumber} for ${data.customer_name} (₹${total})`);
  await bumpVersion();
  const row = await queryOne(`SELECT * FROM orders WHERE id = ?`, [id]);
  return { ...row, items: parseJsonArray(row.items) };
}

export async function updateOrder(id, data) {
  await ensureInitialized();
  const current = await queryOne(`SELECT * FROM orders WHERE id = ?`, [id]);
  if (!current) return null;

  const items = data.items !== undefined ? JSON.stringify(Array.isArray(data.items) ? data.items : []) : current.items;
  const total = data.total_amount !== undefined ? Number(data.total_amount) : current.total_amount;
  const subtotal = data.subtotal !== undefined ? Number(data.subtotal) : current.subtotal;
  const discount = data.discount_amount !== undefined ? Number(data.discount_amount) : current.discount_amount;

  await execute(`
    UPDATE orders SET
      customer_name = ?,
      customer_phone = ?,
      customer_email = ?,
      shipping_address = ?,
      items = ?,
      subtotal = ?,
      discount_amount = ?,
      total_amount = ?,
      payment_status = ?,
      order_status = ?,
      source = ?,
      notes = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `, [
    data.customer_name !== undefined ? data.customer_name : current.customer_name,
    data.customer_phone !== undefined ? data.customer_phone : current.customer_phone,
    data.customer_email !== undefined ? data.customer_email : current.customer_email,
    data.shipping_address !== undefined ? data.shipping_address : current.shipping_address,
    items,
    subtotal,
    discount,
    total,
    data.payment_status !== undefined ? data.payment_status : current.payment_status,
    data.order_status !== undefined ? data.order_status : current.order_status,
    data.source !== undefined ? data.source : current.source,
    data.notes !== undefined ? data.notes : current.notes,
    id
  ]);

  await logAudit('UPDATE_ORDER', `Updated order ${current.order_number} (status: ${data.order_status || current.order_status})`);
  await bumpVersion();
  const row = await queryOne(`SELECT * FROM orders WHERE id = ?`, [id]);
  return { ...row, items: parseJsonArray(row.items) };
}

export async function deleteOrder(id) {
  await ensureInitialized();
  const current = await queryOne(`SELECT order_number FROM orders WHERE id = ?`, [id]);
  if (!current) return false;
  await execute(`DELETE FROM orders WHERE id = ?`, [id]);
  await logAudit('DELETE_ORDER', `Deleted order ${current.order_number} (${id})`);
  await bumpVersion();
  return true;
}

// -------------------------------------------------------------
// Customers CRUD
// -------------------------------------------------------------
export async function getCustomers(options = {}) {
  await ensureInitialized();
  const { search } = options;
  let where = '';
  const params = [];

  if (search && search.trim()) {
    const q = `%${search.trim().toLowerCase()}%`;
    where = 'WHERE LOWER(c.name) LIKE ? OR LOWER(c.phone) LIKE ? OR LOWER(c.email) LIKE ? OR LOWER(c.city) LIKE ?';
    params.push(q, q, q, q);
  }

  const rows = await queryAll(`
    SELECT
      c.*,
      COUNT(o.id) as total_orders,
      COALESCE(SUM(CASE WHEN o.order_status != 'cancelled' THEN o.total_amount ELSE 0 END), 0) as total_spent
    FROM customers c
    LEFT JOIN orders o ON (o.customer_id = c.id OR (o.customer_phone != '' AND o.customer_phone = c.phone))
    ${where}
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `, params);

  return rows.map(r => ({
    ...r,
    total_orders: Number(r.total_orders) || 0,
    total_spent: Number(r.total_spent) || 0
  }));
}

export async function createCustomer(data) {
  await ensureInitialized();
  const id = data.id || `cust_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
  await execute(`
    INSERT INTO customers (id, name, phone, email, address, city, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    String(data.name || '').trim(),
    data.phone || '',
    data.email || '',
    data.address || '',
    data.city || '',
    data.notes || '',
    data.status || 'active'
  ]);
  await logAudit('CREATE_CUSTOMER', `Added customer ${data.name}`);
  return await queryOne(`SELECT * FROM customers WHERE id = ?`, [id]);
}

export async function updateCustomer(id, data) {
  await ensureInitialized();
  const current = await queryOne(`SELECT * FROM customers WHERE id = ?`, [id]);
  if (!current) return null;

  await execute(`
    UPDATE customers SET
      name = ?, phone = ?, email = ?, address = ?, city = ?, notes = ?, status = ?, updated_at = datetime('now')
    WHERE id = ?
  `, [
    data.name !== undefined ? String(data.name).trim() : current.name,
    data.phone !== undefined ? data.phone : current.phone,
    data.email !== undefined ? data.email : current.email,
    data.address !== undefined ? data.address : current.address,
    data.city !== undefined ? data.city : current.city,
    data.notes !== undefined ? data.notes : current.notes,
    data.status !== undefined ? data.status : current.status,
    id
  ]);
  await logAudit('UPDATE_CUSTOMER', `Updated customer ${data.name || current.name}`);
  return await queryOne(`SELECT * FROM customers WHERE id = ?`, [id]);
}

export async function deleteCustomer(id) {
  await ensureInitialized();
  const current = await queryOne(`SELECT name FROM customers WHERE id = ?`, [id]);
  if (!current) return false;
  await execute(`DELETE FROM customers WHERE id = ?`, [id]);
  await logAudit('DELETE_CUSTOMER', `Deleted customer ${current.name} (${id})`);
  return true;
}

// -------------------------------------------------------------
// Banners & Store Settings CRUD
// -------------------------------------------------------------
export async function getBanners(onlyActive = false) {
  await ensureInitialized();
  const where = onlyActive ? 'WHERE active = 1' : '';
  const rows = await queryAll(`SELECT * FROM banners ${where} ORDER BY display_order ASC, created_at DESC`);
  return rows.map(r => ({
    ...r,
    active: Boolean(r.active),
    display_order: Number(r.display_order) || 0
  }));
}

export async function createBanner(data) {
  await ensureInitialized();
  const id = data.id || `ban_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
  await execute(`
    INSERT INTO banners (id, title, subtitle, badge_text, image_url, link_url, position, active, display_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    String(data.title || '').trim(),
    data.subtitle || '',
    data.badge_text || '',
    data.image_url || '',
    data.link_url || '',
    data.position || 'promo',
    data.active !== undefined ? (data.active ? 1 : 0) : 1,
    Number(data.display_order) || 0
  ]);
  await logAudit('CREATE_BANNER', `Created promotional banner "${data.title}"`);
  await bumpVersion();
  const row = await queryOne(`SELECT * FROM banners WHERE id = ?`, [id]);
  return { ...row, active: Boolean(row.active) };
}

export async function updateBanner(id, data) {
  await ensureInitialized();
  const current = await queryOne(`SELECT * FROM banners WHERE id = ?`, [id]);
  if (!current) return null;

  await execute(`
    UPDATE banners SET
      title = ?, subtitle = ?, badge_text = ?, image_url = ?, link_url = ?,
      position = ?, active = ?, display_order = ?, updated_at = datetime('now')
    WHERE id = ?
  `, [
    data.title !== undefined ? String(data.title).trim() : current.title,
    data.subtitle !== undefined ? data.subtitle : current.subtitle,
    data.badge_text !== undefined ? data.badge_text : current.badge_text,
    data.image_url !== undefined ? data.image_url : current.image_url,
    data.link_url !== undefined ? data.link_url : current.link_url,
    data.position !== undefined ? data.position : current.position,
    data.active !== undefined ? (data.active ? 1 : 0) : current.active,
    data.display_order !== undefined ? Number(data.display_order) : current.display_order,
    id
  ]);
  await logAudit('UPDATE_BANNER', `Updated promotional banner ${id}`);
  await bumpVersion();
  const row = await queryOne(`SELECT * FROM banners WHERE id = ?`, [id]);
  return { ...row, active: Boolean(row.active) };
}

export async function deleteBanner(id) {
  await ensureInitialized();
  const current = await queryOne(`SELECT title FROM banners WHERE id = ?`, [id]);
  if (!current) return false;
  await execute(`DELETE FROM banners WHERE id = ?`, [id]);
  await logAudit('DELETE_BANNER', `Deleted banner "${current.title}"`);
  await bumpVersion();
  return true;
}

export async function getStoreSettings() {
  await ensureInitialized();
  const rows = await queryAll(`SELECT key, value FROM settings WHERE key NOT IN ('session_secret')`);
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

export async function updateStoreSettings(updates) {
  await ensureInitialized();
  const allowedKeys = [
    'store_name',
    'whatsapp_number',
    'promo_notice',
    'instagram_url',
    'dispatch_notice',
    'maintenance_mode'
  ];
  const statements = [];
  for (const k of allowedKeys) {
    if (updates[k] !== undefined) {
      statements.push({
        sql: `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?`,
        args: [k, String(updates[k]), String(updates[k])]
      });
    }
  }
  if (statements.length > 0) {
    await execStatements(statements);
    await logAudit('UPDATE_SETTINGS', `Updated store settings (${Object.keys(updates).join(', ')})`);
    await bumpVersion();
  }
  return await getStoreSettings();
}

// -------------------------------------------------------------
// Dashboard Metrics, Audit Logs & Full Backup Export
// -------------------------------------------------------------
export async function getDashboardStats() {
  await ensureInitialized();
  const [
    totalRow,
    allTotalRow,
    accRow,
    cloRow,
    availRow,
    soldOutRow,
    hiddenRow,
    catsRow,
    ordersRow,
    customersRow,
    revenueRow
  ] = await Promise.all([
    queryOne(`SELECT COUNT(*) as count FROM products WHERE status NOT IN ('hidden', 'inactive')`),
    queryOne(`SELECT COUNT(*) as count FROM products`),
    queryOne(`SELECT COUNT(*) as count FROM products WHERE section = 'accessories' AND status NOT IN ('hidden', 'inactive')`),
    queryOne(`SELECT COUNT(*) as count FROM products WHERE section = 'clothing' AND status NOT IN ('hidden', 'inactive')`),
    queryOne(`SELECT COUNT(*) as count FROM products WHERE status IN ('available', 'active') AND stock > 0`),
    queryOne(`SELECT COUNT(*) as count FROM products WHERE (status = 'sold_out' OR stock <= 0) AND status NOT IN ('hidden', 'inactive')`),
    queryOne(`SELECT COUNT(*) as count FROM products WHERE status IN ('hidden', 'inactive')`),
    queryOne(`SELECT COUNT(*) as count FROM categories`),
    queryOne(`SELECT COUNT(*) as count FROM orders`),
    queryOne(`SELECT COUNT(*) as count FROM customers`),
    queryOne(`SELECT COALESCE(SUM(total_amount), 0) as sum FROM orders WHERE order_status != 'cancelled'`)
  ]);

  const recentRows = await queryAll(`
    SELECT id, name, section, category, price, comparePrice, status, stock, images, created_at
    FROM products
    ORDER BY created_at DESC, id DESC
    LIMIT 6
  `);

  const categoryBreakdown = await queryAll(`
    SELECT category, section, COUNT(*) as count
    FROM products
    GROUP BY category, section
    ORDER BY count DESC
  `);

  const version = await getDbVersion();

  return {
    total: Number(totalRow?.count || 0),
    allTotal: Number(allTotalRow?.count || 0),
    accessoriesTotal: Number(accRow?.count || 0),
    clothingTotal: Number(cloRow?.count || 0),
    available: Number(availRow?.count || 0),
    soldOut: Number(soldOutRow?.count || 0),
    hidden: Number(hiddenRow?.count || 0),
    categoriesCount: Number(catsRow?.count || 0),
    ordersCount: Number(ordersRow?.count || 0),
    customersCount: Number(customersRow?.count || 0),
    totalRevenue: Number(revenueRow?.sum || 0),
    recent: recentRows.map(r => ({
      ...r,
      section: r.section || 'accessories',
      status: normalizeProductStatus(r.status),
      images: parseJsonArray(r.images)
    })),
    categoryBreakdown,
    dbVersion: version,
    dbMode
  };
}

export async function logAudit(action, details) {
  try {
    await execute(`INSERT INTO audit_logs (action, details) VALUES (?, ?)`, [action, details]);
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

export async function getAuditLogs(limit = 50) {
  await ensureInitialized();
  return await queryAll(`SELECT * FROM audit_logs ORDER BY id DESC, timestamp DESC LIMIT ?`, [Number(limit)]);
}

export async function exportFullBackup() {
  await ensureInitialized();
  const [products, categories, orders, customers, banners, settings] = await Promise.all([
    queryAll(`SELECT * FROM products ORDER BY created_at DESC`),
    queryAll(`SELECT * FROM categories ORDER BY display_order ASC`),
    queryAll(`SELECT * FROM orders ORDER BY created_at DESC`),
    queryAll(`SELECT * FROM customers ORDER BY created_at DESC`),
    queryAll(`SELECT * FROM banners ORDER BY display_order ASC`),
    getStoreSettings()
  ]);

  return {
    timestamp: new Date().toISOString(),
    dbMode,
    totalProducts: products.length,
    totalCategories: categories.length,
    totalOrders: orders.length,
    totalCustomers: customers.length,
    categories,
    products: products.map(formatProductRow),
    orders: orders.map(o => ({ ...o, items: parseJsonArray(o.items) })),
    customers,
    banners,
    settings
  };
}

export { currentVersion };
