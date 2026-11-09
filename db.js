import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

// Candidate source paths for data directory
const candidateDataDirs = [
  path.join(process.cwd(), 'data'),
  path.join(__dirname, 'data')
];

let sourceDataDir = candidateDataDirs.find(d => fs.existsSync(d)) || path.join(__dirname, 'data');
let DATA_DIR = sourceDataDir;
let DB_PATH = path.join(sourceDataDir, 'accessify.db');

if (isVercel) {
  const TMP_DATA_DIR = path.join('/tmp', 'data');
  try {
    if (!fs.existsSync(TMP_DATA_DIR)) {
      fs.mkdirSync(TMP_DATA_DIR, { recursive: true });
    }
  } catch (_) {}

  const tmpDbPath = path.join(TMP_DATA_DIR, 'accessify.db');

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
      console.log(`[DB] Copied source database (${fs.statSync(sourceDb).size} bytes) from ${sourceDb} to /tmp`);
    } catch (err) {
      console.error('[DB] Failed copying DB to /tmp:', err);
    }
  }

  if (fs.existsSync(tmpDbPath)) {
    DB_PATH = tmpDbPath;
    DATA_DIR = TMP_DATA_DIR;
  }
} else {
  if (!fs.existsSync(DATA_DIR)) {
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {}
  }
}

const db = new Database(DB_PATH);

// Pragmas with safe fallbacks
try {
  db.pragma('journal_mode = WAL');
} catch (e) {
  try { db.pragma('journal_mode = DELETE'); } catch (_) {}
}
try {
  db.pragma('foreign_keys = ON');
} catch (_) {}

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    original_id INTEGER,
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    section TEXT DEFAULT 'accessories', -- 'accessories' or 'clothing'
    category TEXT NOT NULL,
    price REAL NOT NULL,
    comparePrice REAL,
    description TEXT,
    images TEXT, -- JSON array
    variants TEXT, -- JSON array
    stock INTEGER DEFAULT 25,
    rating REAL DEFAULT 4.8,
    numReviews INTEGER DEFAULT 12,
    featured INTEGER DEFAULT 0,
    newArrival INTEGER DEFAULT 0,
    status TEXT DEFAULT 'available', -- 'available', 'sold_out', 'hidden'
    sku_code TEXT,
    branch_id INTEGER DEFAULT 2,
    tags TEXT, -- JSON array
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    section TEXT DEFAULT 'accessories', -- 'accessories' or 'clothing'
    display_order INTEGER DEFAULT 0,
    description TEXT,
    image TEXT
  );

  CREATE TABLE IF NOT EXISTS admin_users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    details TEXT,
    timestamp TEXT DEFAULT (datetime('now'))
  );
`);

// Safe runtime migration ensures section column exists and defaults to accessories
try { db.exec("ALTER TABLE products ADD COLUMN section TEXT DEFAULT 'accessories'"); } catch (_) { }
try { db.exec("ALTER TABLE categories ADD COLUMN section TEXT DEFAULT 'accessories'"); } catch (_) { }
try {
  db.exec("UPDATE products SET section = 'accessories' WHERE section IS NULL OR section = ''");
  db.exec("UPDATE categories SET section = 'accessories' WHERE section IS NULL OR section = ''");
} catch (_) { }

// Password hashing helper
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const testHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return testHash === hash;
}

// Version management
let currentVersion = Date.now();

function bumpVersion() {
  currentVersion = Date.now();
  const stmt = db.prepare(`INSERT INTO settings (key, value) VALUES ('db_version', ?) ON CONFLICT(key) DO UPDATE SET value = ?`);
  stmt.run(String(currentVersion), String(currentVersion));
  return currentVersion;
}

function getDbVersion() {
  try {
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'db_version'`).get();
    if (row && row.value) {
      currentVersion = Number(row.value);
    }
  } catch (err) {
    console.error('Error getting DB version:', err);
  }
  return currentVersion;
}

// Initial Categories Seed Data
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

// Seed Categories
function seedCategories() {
  const insertCat = db.prepare(`
    INSERT INTO categories (id, name, slug, section, display_order, description, image)
    VALUES (@id, @name, @slug, @section, @display_order, @description, @image)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      section = coalesce(categories.section, excluded.section),
      display_order = excluded.display_order,
      description = excluded.description,
      image = excluded.image
  `);

  const runMany = db.transaction((cats) => {
    for (const cat of cats) {
      insertCat.run(cat);
    }
  });

  runMany(DEFAULT_CATEGORIES);
}

// Seed Admin User
function seedAdminUser() {
  const username = process.env.ADMIN_USER || 'admin';
  const rawPassword = process.env.ADMIN_PASSWORD || 'accessify2026';

  const user = db.prepare(`SELECT * FROM admin_users WHERE username = ?`).get(username);
  if (!user) {
    const { hash, salt } = hashPassword(rawPassword);
    db.prepare(`
      INSERT INTO admin_users (id, username, password_hash, salt)
      VALUES (?, ?, ?, ?)
    `).run(crypto.randomUUID(), username, hash, salt);
    console.log(`[DB] Default admin user initialized: ${username}`);
  }
}

// Seed Products from initial_products.json
function seedProducts() {
  const countRow = db.prepare(`SELECT COUNT(*) as count FROM products`).get();
  if (countRow.count > 0) {
    console.log(`[DB] Database already contains ${countRow.count} products.`);
    return;
  }

  let jsonPath = null;
  const jsonCandidates = [
    path.join(DATA_DIR, 'initial_products.json'),
    path.join(DATA_DIR, 'database_backup.json'),
    path.join(process.cwd(), 'data', 'initial_products.json'),
    path.join(process.cwd(), 'data', 'database_backup.json'),
    path.join(__dirname, 'data', 'initial_products.json'),
    path.join(__dirname, 'data', 'database_backup.json')
  ];

  for (const cand of jsonCandidates) {
    if (fs.existsSync(cand)) {
      jsonPath = cand;
      break;
    }
  }

  if (!jsonPath) {
    console.warn(`[DB] No seed JSON file found, skipping product seed.`);
    return;
  }

  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const products = Array.isArray(raw) ? raw : (raw.products || []);
  console.log(`[DB] Seeding ${products.length} authentic products into SQLite from ${jsonPath}...`);

  const insertProduct = db.prepare(`
    INSERT INTO products (
      id, original_id, name, slug, category, price, comparePrice,
      description, images, variants, stock, rating, numReviews,
      featured, newArrival, status, sku_code, branch_id, tags
    ) VALUES (
      @id, @original_id, @name, @slug, @category, @price, @comparePrice,
      @description, @images, @variants, @stock, @rating, @numReviews,
      @featured, @newArrival, @status, @sku_code, @branch_id, @tags
    )
  `);

  const seedTx = db.transaction((items) => {
    for (const item of items) {
      insertProduct.run({
        id: item.id || `acc_${item.original_id || Date.now()}`,
        original_id: item.original_id || null,
        name: item.name,
        slug: item.slug || (item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + (item.original_id || Math.floor(Math.random() * 10000))),
        category: item.category,
        price: Number(item.price) || 0,
        comparePrice: item.comparePrice ? Number(item.comparePrice) : null,
        description: item.description || '',
        images: JSON.stringify(item.images || []),
        variants: JSON.stringify(item.variants || []),
        stock: item.stock !== undefined ? item.stock : 25,
        rating: item.rating || 4.8,
        numReviews: item.numReviews || 12,
        featured: item.featured ? 1 : 0,
        newArrival: item.newArrival ? 1 : 0,
        status: (item.stock !== undefined && item.stock <= 0) ? 'sold_out' : (item.status || 'available'),
        sku_code: item.sku_code || '',
        branch_id: item.branch_id || 2,
        tags: JSON.stringify(item.tags || [])
      });
    }
  });

  seedTx(products);
  bumpVersion();
  console.log(`[DB] Successfully seeded ${products.length} products.`);
}

// Run initial seedings
seedCategories();
seedAdminUser();
seedProducts();
getDbVersion();

// -------------------------------------------------------------
// Database Query API
// -------------------------------------------------------------

export function getAllCategories(section) {
  let sql = `SELECT * FROM categories`;
  let params = [];
  if (section && section !== 'all') {
    sql += ` WHERE section = ?`;
    params.push(section);
  }
  sql += ` ORDER BY display_order ASC`;
  const cats = db.prepare(sql).all(...params);
  return cats.map(c => {
    let countRow;
    const catSec = c.section || 'accessories';
    if (c.id === 'rings') {
      countRow = db.prepare(`
        SELECT COUNT(*) as count FROM products 
        WHERE status != 'hidden' AND section = ? AND (
          category = 'rings' 
          OR tags LIKE '%"rings"%' 
          OR tags LIKE '%"ring"%' 
          OR LOWER(name) LIKE '% ring%' 
          OR LOWER(name) LIKE 'ring %'
        ) AND LOWER(name) NOT LIKE '%earring%'
      `).get(catSec);
    } else {
      countRow = db.prepare(`
        SELECT COUNT(*) as count FROM products 
        WHERE status != 'hidden' AND section = ? AND (category = ? OR tags LIKE ?)
      `).get(catSec, c.id, `%"${c.id}"%`);
    }

    return {
      ...c,
      section: catSec,
      count: countRow ? countRow.count : 0
    };
  });
}

export function getProducts(options = {}) {
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

  let conditions = [];
  let params = [];

  if (!includeHidden) {
    conditions.push("status != 'hidden'");
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

  if (status === 'available') {
    conditions.push("status = 'available' AND stock > 0");
  } else if (status === 'sold_out') {
    conditions.push("(status = 'sold_out' OR stock <= 0)");
  } else if (status) {
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

  let orderBy = "ORDER BY featured DESC, newArrival DESC, id DESC";
  if (sort === 'price_asc') {
    orderBy = "ORDER BY price ASC";
  } else if (sort === 'price_desc') {
    orderBy = "ORDER BY price DESC";
  } else if (sort === 'name_asc') {
    orderBy = "ORDER BY name ASC";
  } else if (sort === 'newest') {
    orderBy = "ORDER BY newArrival DESC, created_at DESC";
  }

  let limitClause = '';
  if (limit) {
    limitClause = `LIMIT ? OFFSET ?`;
    params.push(Number(limit), Number(offset));
  }

  const totalStmt = db.prepare(`SELECT COUNT(*) as count FROM products ${whereClause}`);
  const total = totalStmt.get(...params.slice(0, conditions.length > 0 ? params.length - (limit ? 2 : 0) : 0)).count;

  const sql = `SELECT * FROM products ${whereClause} ${orderBy} ${limitClause}`;
  const rows = db.prepare(sql).all(...params);

  const formatted = rows.map(r => ({
    ...r,
    section: r.section || 'accessories',
    images: JSON.parse(r.images || '[]'),
    variants: JSON.parse(r.variants || '[]'),
    tags: JSON.parse(r.tags || '[]'),
    featured: Boolean(r.featured),
    newArrival: Boolean(r.newArrival)
  }));

  return {
    total,
    count: formatted.length,
    version: currentVersion,
    products: formatted
  };
}

export function getProductByIdOrSlug(idOrSlug) {
  const row = db.prepare(`SELECT * FROM products WHERE id = ? OR slug = ?`).get(idOrSlug, idOrSlug);
  if (!row) return null;

  const product = {
    ...row,
    section: row.section || 'accessories',
    images: JSON.parse(row.images || '[]'),
    variants: JSON.parse(row.variants || '[]'),
    tags: JSON.parse(row.tags || '[]'),
    featured: Boolean(row.featured),
    newArrival: Boolean(row.newArrival)
  };

  // Fetch 4 related products in same section & category
  const relatedRows = db.prepare(`
    SELECT * FROM products
    WHERE section = ? AND category = ? AND id != ? AND status != 'hidden'
    ORDER BY featured DESC, id DESC
    LIMIT 4
  `).all(product.section, product.category, product.id);

  const related = relatedRows.map(r => ({
    ...r,
    section: r.section || 'accessories',
    images: JSON.parse(r.images || '[]'),
    variants: JSON.parse(r.variants || '[]'),
    tags: JSON.parse(r.tags || '[]'),
    featured: Boolean(r.featured),
    newArrival: Boolean(r.newArrival)
  }));

  return { product, related };
}

export function createProduct(data) {
  const id = data.id || `acc_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const slug = data.slug || (data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString().slice(-4));
  const section = (data.section === 'clothing') ? 'clothing' : 'accessories';

  const stmt = db.prepare(`
    INSERT INTO products (
      id, original_id, name, slug, section, category, price, comparePrice,
      description, images, variants, stock, rating, numReviews,
      featured, newArrival, status, sku_code, branch_id, tags
    ) VALUES (
      @id, @original_id, @name, @slug, @section, @category, @price, @comparePrice,
      @description, @images, @variants, @stock, @rating, @numReviews,
      @featured, @newArrival, @status, @sku_code, @branch_id, @tags
    )
  `);

  stmt.run({
    id,
    original_id: data.original_id || null,
    name: data.name.trim(),
    slug,
    section,
    category: data.category,
    price: Number(data.price),
    comparePrice: data.comparePrice ? Number(data.comparePrice) : null,
    description: data.description || '',
    images: JSON.stringify(Array.isArray(data.images) ? data.images : (data.images ? [data.images] : [])),
    variants: JSON.stringify(Array.isArray(data.variants) ? data.variants : []),
    stock: data.stock !== undefined ? Number(data.stock) : 25,
    rating: data.rating ? Number(data.rating) : 4.8,
    numReviews: data.numReviews ? Number(data.numReviews) : 12,
    featured: data.featured ? 1 : 0,
    newArrival: data.newArrival !== undefined ? (data.newArrival ? 1 : 0) : 1,
    status: data.status || 'available',
    sku_code: data.sku_code || `SKU-${Date.now().toString().slice(-6)}`,
    branch_id: data.branch_id || 2,
    tags: JSON.stringify(Array.isArray(data.tags) ? data.tags : [])
  });

  logAudit('CREATE_PRODUCT', `Created product ${data.name} (${id}) in [${section.toUpperCase()}]`);
  bumpVersion();

  return getProductByIdOrSlug(id)?.product;
}

export function updateProduct(id, data) {
  const current = db.prepare(`SELECT * FROM products WHERE id = ?`).get(id);
  if (!current) return null;

  const updatedImages = data.images !== undefined
    ? JSON.stringify(Array.isArray(data.images) ? data.images : [data.images])
    : current.images;

  const updatedVariants = data.variants !== undefined
    ? JSON.stringify(Array.isArray(data.variants) ? data.variants : [])
    : current.variants;

  const updatedTags = data.tags !== undefined
    ? JSON.stringify(Array.isArray(data.tags) ? data.tags : [])
    : current.tags;

  const stmt = db.prepare(`
    UPDATE products SET
      name = coalesce(@name, name),
      slug = coalesce(@slug, slug),
      section = coalesce(@section, section),
      category = coalesce(@category, category),
      price = coalesce(@price, price),
      comparePrice = @comparePrice,
      description = coalesce(@description, description),
      images = @images,
      variants = @variants,
      stock = coalesce(@stock, stock),
      featured = coalesce(@featured, featured),
      newArrival = coalesce(@newArrival, newArrival),
      status = coalesce(@status, status),
      sku_code = coalesce(@sku_code, sku_code),
      tags = @tags,
      updated_at = datetime('now')
    WHERE id = @id
  `);

  stmt.run({
    id,
    name: data.name !== undefined ? data.name.trim() : null,
    slug: data.slug || null,
    section: data.section ? ((data.section === 'clothing') ? 'clothing' : 'accessories') : null,
    category: data.category || null,
    price: data.price !== undefined ? Number(data.price) : null,
    comparePrice: data.comparePrice !== undefined ? (data.comparePrice ? Number(data.comparePrice) : null) : current.comparePrice,
    description: data.description !== undefined ? data.description : null,
    images: updatedImages,
    variants: updatedVariants,
    stock: data.stock !== undefined ? Number(data.stock) : null,
    featured: data.featured !== undefined ? (data.featured ? 1 : 0) : null,
    newArrival: data.newArrival !== undefined ? (data.newArrival ? 1 : 0) : null,
    status: data.status || null,
    sku_code: data.sku_code || null,
    tags: updatedTags
  });

  logAudit('UPDATE_PRODUCT', `Updated product ${id} (${data.section ? 'Section: ' + data.section : 'Kept section'})`);
  bumpVersion();

  return getProductByIdOrSlug(id)?.product;
}

export function deleteProduct(id) {
  const current = db.prepare(`SELECT name FROM products WHERE id = ?`).get(id);
  if (!current) return false;

  db.prepare(`DELETE FROM products WHERE id = ?`).run(id);
  logAudit('DELETE_PRODUCT', `Deleted product ${current.name} (${id})`);
  bumpVersion();
  return true;
}

export function setProductStatus(id, status) {
  const stmt = db.prepare(`UPDATE products SET status = ?, updated_at = datetime('now') WHERE id = ?`);
  const res = stmt.run(status, id);
  if (res.changes > 0) {
    logAudit('STATUS_CHANGE', `Set product ${id} status to ${status}`);
    bumpVersion();
    return true;
  }
  return false;
}

export function getDashboardStats() {
  const total = db.prepare(`SELECT COUNT(*) as count FROM products WHERE status != 'hidden'`).get().count;
  const accessoriesTotal = db.prepare(`SELECT COUNT(*) as count FROM products WHERE section = 'accessories' AND status != 'hidden'`).get().count;
  const clothingTotal = db.prepare(`SELECT COUNT(*) as count FROM products WHERE section = 'clothing' AND status != 'hidden'`).get().count;
  const available = db.prepare(`SELECT COUNT(*) as count FROM products WHERE status = 'available' AND stock > 0`).get().count;
  const soldOut = db.prepare(`SELECT COUNT(*) as count FROM products WHERE status = 'sold_out' OR stock <= 0`).get().count;
  const hidden = db.prepare(`SELECT COUNT(*) as count FROM products WHERE status = 'hidden'`).get().count;
  const categoriesCount = db.prepare(`SELECT COUNT(*) as count FROM categories`).get().count;

  const recent = db.prepare(`
    SELECT id, name, section, category, price, comparePrice, status, stock, images, created_at
    FROM products
    ORDER BY created_at DESC, id DESC
    LIMIT 6
  `).all().map(r => ({
    ...r,
    section: r.section || 'accessories',
    images: JSON.parse(r.images || '[]')
  }));

  const categoryBreakdown = db.prepare(`
    SELECT category, section, COUNT(*) as count
    FROM products
    GROUP BY category, section
    ORDER BY count DESC
  `).all();

  return {
    total,
    accessoriesTotal,
    clothingTotal,
    available,
    soldOut,
    hidden,
    categoriesCount,
    recent,
    categoryBreakdown,
    dbVersion: currentVersion
  };
}

export function verifyAdminCredentials(username, password) {
  const user = db.prepare(`SELECT * FROM admin_users WHERE username = ?`).get(username);
  if (!user) return false;
  return verifyPassword(password, user.password_hash, user.salt);
}

export function logAudit(action, details) {
  try {
    db.prepare(`INSERT INTO audit_logs (action, details) VALUES (?, ?)`).run(action, details);
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

export function getAuditLogs(limit = 50) {
  return db.prepare(`SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?`).all(limit);
}

export function addCategory(data) {
  const id = data.id || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const slug = data.slug || id;
  const section = (data.section === 'clothing') ? 'clothing' : 'accessories';
  const stmt = db.prepare(`
    INSERT INTO categories (id, name, slug, section, display_order, description, image)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, data.name, slug, section, data.display_order || 99, data.description || '', data.image || '');
  bumpVersion();
  return { id, name: data.name, slug, section };
}

export function deleteCategory(id) {
  const res = db.prepare(`DELETE FROM categories WHERE id = ?`).run(id);
  if (res.changes > 0) {
    bumpVersion();
    return true;
  }
  return false;
}

export { currentVersion, getDbVersion, bumpVersion };

