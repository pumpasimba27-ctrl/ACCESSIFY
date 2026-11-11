import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { put as putVercelBlob } from '@vercel/blob';
import {
  ensureInitialized,
  getDbMode,
  getProducts,
  getProductByIdOrSlug,
  getAllCategories,
  createProduct,
  updateProduct,
  deleteProduct,
  setProductStatus,
  updateProductStock,
  getDashboardStats,
  verifyAdminCredentials,
  updateAdminPassword,
  getSessionSecret,
  createSessionRecord,
  verifySessionRecord,
  deleteSessionRecord,
  addCategory,
  updateCategory,
  deleteCategory,
  getOrders,
  createOrder,
  updateOrder,
  deleteOrder,
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  getStoreSettings,
  updateStoreSettings,
  getAuditLogs,
  exportFullBackup,
  getDbVersion
} from './db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '917012400815';
const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

// Directories
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');
const TMP_UPLOADS = path.join('/tmp', 'uploads');

if (isVercel) {
  try {
    if (!fs.existsSync(TMP_UPLOADS)) fs.mkdirSync(TMP_UPLOADS, { recursive: true });
  } catch (_) {}
} else {
  try {
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  } catch (_) {}
}

// Connected SSE Clients for Instant Global Sync (Persistent local server mode)
const sseClients = new Set();

async function broadcastEvent(type, payload = {}) {
  const version = await getDbVersion();
  const data = JSON.stringify({ type, version, ...payload, timestamp: Date.now() });
  for (const client of sseClients) {
    try {
      client.write(`event: catalog_update\ndata: ${data}\n\n`);
    } catch (_) {
      sseClients.delete(client);
    }
  }
  return version;
}

// -------------------------------------------------------------
// Stateless + DB-Revocable HMAC Admin Session Token Helpers
// -------------------------------------------------------------
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function issueAdminToken(username) {
  const secret = await getSessionSecret();
  const payloadObj = {
    u: username,
    jti: crypto.randomBytes(16).toString('hex'),
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS
  };
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sigB64 = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  const token = `${payloadB64}.${sigB64}`;

  await createSessionRecord(hashToken(token), username, payloadObj.exp);
  return token;
}

async function verifyAdminToken(token) {
  if (!token || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, sigB64] = parts;
  const secret = await getSessionSecret();
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');

  try {
    const a = Buffer.from(sigB64);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  } catch (_) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch (_) {
    return null;
  }

  if (!payload || !payload.u || !payload.exp || Number(payload.exp) < Date.now()) {
    return null;
  }

  // Confirm session hasn't been revoked in database
  const session = await verifySessionRecord(hashToken(token));
  if (!session) return null;

  return { username: session.username, loginAt: payload.iat };
}

// -------------------------------------------------------------
// File Upload Middleware (Memory Buffer -> Vercel Blob or Local Disk)
// -------------------------------------------------------------
const ALLOWED_IMAGE_EXT = /^(jpeg|jpg|png|webp|gif|avif)$/i;
const ALLOWED_IMAGE_MIME = /^image\/(jpeg|jpg|png|webp|gif|avif|x-png|pjpeg)$/i;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per image
    files: 10
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase().replace('.', '');
    const mime = (file.mimetype || '').toLowerCase();
    if (ALLOWED_IMAGE_EXT.test(ext) && ALLOWED_IMAGE_MIME.test(mime)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image format. Only JPG, JPEG, PNG, WEBP, GIF, and AVIF images are allowed.'));
    }
  }
});

function isValidImageBuffer(buf) {
  if (!buf || buf.length < 4) return false;
  // JPEG (FF D8 FF), PNG (89 50 4E 47), GIF (47 49 46 38), WEBP (52 49 46 46 ... 57 45 42 50), AVIF (ftypavif/ftypmif1)
  const hex = buf.subarray(0, 12).toString('hex').toLowerCase();
  if (hex.startsWith('ffd8ff')) return true;
  if (hex.startsWith('89504e47')) return true;
  if (hex.startsWith('47494638')) return true;
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return true;
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') return true;
  return false;
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Static Assets
if (isVercel) {
  app.use('/uploads', express.static(TMP_UPLOADS));
}
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use(express.static(PUBLIC_DIR));
app.use(express.static(path.join(process.cwd(), 'public')));

// CRITICAL CACHE CONTROL: Prevent stale catalog data across mobile browsers & proxies
app.use('/api', async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  try {
    await ensureInitialized();
    next();
  } catch (err) {
    next(err);
  }
});

// Admin Auth Middleware
async function requireAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !/^Bearer\s+/i.test(authHeader)) {
      return res.status(401).json({ success: false, error: 'Unauthorized. Please sign in as administrator.' });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const user = await verifyAdminToken(token);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Session expired or invalid. Please sign in again.' });
    }

    req.adminUser = user;
    req.adminToken = token;
    next();
  } catch (err) {
    next(err);
  }
}

// -------------------------------------------------------------
// REAL-TIME SYNCHRONIZATION STREAM (SSE + Serverless Poll-Sync)
// -------------------------------------------------------------
app.get('/api/events', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');

  const version = await getDbVersion();
  res.setHeader('X-DB-Version', String(version));

  // On Vercel Serverless Functions, keeping SSE open causes 300s runtime timeout errors.
  // Send retry directive + current DB version and close cleanly so client auto-syncs without timeout errors.
  if (isVercel) {
    res.write(`retry: 3500\n`);
    res.write(`event: catalog_update\ndata: ${JSON.stringify({ type: 'sync', version, timestamp: Date.now() })}\n\n`);
    return res.end();
  }

  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  sseClients.add(res);

  const initial = JSON.stringify({ type: 'connected', version, timestamp: Date.now() });
  res.write(`retry: 3000\ndata: ${initial}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch (_) {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// -------------------------------------------------------------
// PUBLIC CUSTOMER API ROUTES
// -------------------------------------------------------------
app.get('/api/health', async (req, res) => {
  const dbVersion = await getDbVersion();
  res.setHeader('X-DB-Version', String(dbVersion));
  res.json({
    status: 'online',
    brand: 'ACCESSIFY',
    version: '2.1.0',
    dbMode: getDbMode(),
    blobStorage: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    dbVersion,
    whatsapp: WHATSAPP_NUMBER,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/version', async (req, res) => {
  const dbVersion = await getDbVersion();
  res.setHeader('X-DB-Version', String(dbVersion));
  res.json({
    dbVersion,
    timestamp: Date.now()
  });
});

app.get('/api/categories', async (req, res) => {
  const { section } = req.query;
  const [categories, dbVersion] = await Promise.all([
    getAllCategories(section),
    getDbVersion()
  ]);
  res.setHeader('X-DB-Version', String(dbVersion));
  res.json({
    success: true,
    data: categories,
    dbVersion
  });
});

app.get('/api/products', async (req, res) => {
  const { section, category, search, sort, status, featured, limit, offset } = req.query;
  const result = await getProducts({
    section,
    category,
    search,
    sort,
    status,
    featured,
    limit,
    offset,
    includeHidden: false
  });

  res.setHeader('X-DB-Version', String(result.version));
  res.json({
    success: true,
    dbVersion: result.version,
    total: result.total,
    count: result.count,
    data: result.products
  });
});

app.get('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  const result = await getProductByIdOrSlug(id);

  if (!result || !result.product || result.product.status === 'hidden') {
    return res.status(404).json({ success: false, error: 'Product not found' });
  }

  const dbVersion = await getDbVersion();
  res.setHeader('X-DB-Version', String(dbVersion));
  res.json({
    success: true,
    data: result.product,
    related: result.related,
    dbVersion
  });
});

app.get('/api/banners', async (req, res) => {
  const [banners, settings, dbVersion] = await Promise.all([
    getBanners(true),
    getStoreSettings(),
    getDbVersion()
  ]);
  res.setHeader('X-DB-Version', String(dbVersion));
  res.json({
    success: true,
    data: banners,
    settings,
    dbVersion
  });
});

// -------------------------------------------------------------
// ADMIN SECURE AUTHENTICATION ROUTES
// -------------------------------------------------------------
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Please enter both username and password.' });
  }

  const isValid = await verifyAdminCredentials(String(username).trim(), String(password));
  if (!isValid) {
    return res.status(401).json({ success: false, error: 'Invalid username or password.' });
  }

  const token = await issueAdminToken(String(username).trim());

  res.json({
    success: true,
    token,
    user: { username: String(username).trim(), role: 'administrator' },
    message: 'Welcome back to ACCESSIFY Admin'
  });
});

app.get('/api/admin/me', requireAdmin, async (req, res) => {
  const dbVersion = await getDbVersion();
  res.json({
    success: true,
    user: req.adminUser,
    dbVersion,
    dbMode: getDbMode(),
    blobStorage: Boolean(process.env.BLOB_READ_WRITE_TOKEN)
  });
});

app.post('/api/admin/logout', requireAdmin, async (req, res) => {
  if (req.adminToken) {
    await deleteSessionRecord(hashToken(req.adminToken));
  }
  res.json({ success: true, message: 'Logged out successfully' });
});

app.put('/api/admin/password', requireAdmin, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const result = await updateAdminPassword(req.adminUser.username, currentPassword, newPassword);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json({ success: true, message: 'Administrator password updated successfully.' });
});

// -------------------------------------------------------------
// ADMIN DASHBOARD, AUDIT & BACKUP
// -------------------------------------------------------------
app.get('/api/admin/dashboard', requireAdmin, async (req, res) => {
  const [stats, auditLogs] = await Promise.all([
    getDashboardStats(),
    getAuditLogs(30)
  ]);

  res.setHeader('X-DB-Version', String(stats.dbVersion));
  res.json({
    success: true,
    stats,
    auditLogs,
    connectedClients: sseClients.size,
    blobStorage: Boolean(process.env.BLOB_READ_WRITE_TOKEN)
  });
});

app.get('/api/admin/backup', requireAdmin, async (req, res) => {
  const backup = await exportFullBackup();
  res.setHeader('Content-Disposition', `attachment; filename="accessify-backup-${Date.now()}.json"`);
  res.json({ success: true, ...backup });
});

// -------------------------------------------------------------
// ADMIN PRODUCTS MANAGEMENT
// -------------------------------------------------------------
app.get('/api/admin/products', requireAdmin, async (req, res) => {
  const { section, category, search, sort, status, limit, offset } = req.query;
  const result = await getProducts({
    section,
    category,
    search,
    sort,
    status,
    limit,
    offset,
    includeHidden: true
  });

  res.setHeader('X-DB-Version', String(result.version));
  res.json({
    success: true,
    total: result.total,
    count: result.count,
    data: result.products,
    dbVersion: result.version
  });
});

app.post('/api/admin/products', requireAdmin, async (req, res) => {
  const {
    name,
    section,
    category,
    price,
    comparePrice,
    description,
    images,
    variants,
    stock,
    featured,
    newArrival,
    status,
    sku_code,
    tags
  } = req.body || {};

  if (!name || !String(name).trim() || !category || price === undefined || price === '' || Number(price) < 0 || Number.isNaN(Number(price))) {
    return res.status(400).json({ success: false, error: 'Valid product name, category, and selling price are required.' });
  }

  try {
    const created = await createProduct({
      name,
      section,
      category,
      price,
      comparePrice,
      description,
      images,
      variants,
      stock,
      featured,
      newArrival,
      status,
      sku_code,
      tags
    });

    const dbVersion = await broadcastEvent('product_created', { product: created });

    res.status(201).json({
      success: true,
      message: 'Product added and synchronized with storefront',
      data: created,
      dbVersion
    });
  } catch (err) {
    const code = err.statusCode || 500;
    res.status(code).json({ success: false, error: err.message || 'Failed to create product' });
  }
});

app.put('/api/admin/products/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  if (req.body.price !== undefined && (req.body.price === '' || Number(req.body.price) < 0 || Number.isNaN(Number(req.body.price)))) {
    return res.status(400).json({ success: false, error: 'Selling price must be a valid non-negative number.' });
  }

  const updated = await updateProduct(id, req.body || {});
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Product not found' });
  }

  const dbVersion = await broadcastEvent('product_updated', { product: updated });

  res.json({
    success: true,
    message: 'Product updated and synchronized with storefront',
    data: updated,
    dbVersion
  });
});

app.delete('/api/admin/products/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const success = await deleteProduct(id);

  if (!success) {
    return res.status(404).json({ success: false, error: 'Product not found' });
  }

  const dbVersion = await broadcastEvent('product_deleted', { productId: id });

  res.json({
    success: true,
    message: 'Product permanently deleted',
    deletedId: id,
    dbVersion
  });
});

app.patch('/api/admin/products/:id/status', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};

  if (!['available', 'sold_out', 'hidden', 'active', 'inactive'].includes(status)) {
    return res.status(400).json({ success: false, error: 'Status must be available, sold_out, or hidden' });
  }

  const updated = await setProductStatus(id, status);
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Product not found' });
  }

  const dbVersion = await broadcastEvent('product_status_changed', { productId: id, status: updated.status, product: updated });

  res.json({
    success: true,
    message: `Product marked as ${updated.status}`,
    status: updated.status,
    data: updated,
    dbVersion
  });
});

app.patch('/api/admin/products/:id/stock', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { stock } = req.body || {};

  if (stock === undefined || stock === '' || Number(stock) < 0 || Number.isNaN(Number(stock))) {
    return res.status(400).json({ success: false, error: 'Valid non-negative stock quantity is required' });
  }

  const updated = await updateProductStock(id, stock);
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Product not found' });
  }

  const dbVersion = await broadcastEvent('product_stock_updated', { productId: id, product: updated });

  res.json({
    success: true,
    message: `Stock updated to ${updated.stock}`,
    data: updated,
    dbVersion
  });
});

// -------------------------------------------------------------
// ADMIN CATEGORIES MANAGEMENT
// -------------------------------------------------------------
app.post('/api/admin/categories', requireAdmin, async (req, res) => {
  const { name, section, display_order, description, image } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ success: false, error: 'Category name is required' });
  }

  const cat = await addCategory({ name, section, display_order, description, image });
  const dbVersion = await broadcastEvent('category_added', { category: cat });

  res.status(201).json({
    success: true,
    message: 'Category created successfully',
    data: cat,
    dbVersion
  });
});

app.put('/api/admin/categories/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const updated = await updateCategory(id, req.body || {});
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Category not found' });
  }

  const dbVersion = await broadcastEvent('category_updated', { category: updated });
  res.json({
    success: true,
    message: 'Category updated successfully',
    data: updated,
    dbVersion
  });
});

app.delete('/api/admin/categories/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const ok = await deleteCategory(id);
  if (!ok) {
    return res.status(404).json({ success: false, error: 'Category not found' });
  }
  const dbVersion = await broadcastEvent('category_deleted', { categoryId: id });
  res.json({
    success: true,
    message: 'Category deleted successfully',
    dbVersion
  });
});

// -------------------------------------------------------------
// ADMIN ORDERS MANAGEMENT
// -------------------------------------------------------------
app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  const { status, search } = req.query;
  const orders = await getOrders({ status, search });
  res.json({ success: true, count: orders.length, data: orders });
});

app.post('/api/admin/orders', requireAdmin, async (req, res) => {
  const { customer_name } = req.body || {};
  if (!customer_name || !String(customer_name).trim()) {
    return res.status(400).json({ success: false, error: 'Customer name is required' });
  }
  const created = await createOrder(req.body);
  res.status(201).json({ success: true, message: 'Order created successfully', data: created });
});

app.put('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  const updated = await updateOrder(req.params.id, req.body || {});
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Order not found' });
  }
  res.json({ success: true, message: 'Order updated successfully', data: updated });
});

app.patch('/api/admin/orders/:id/status', requireAdmin, async (req, res) => {
  const { order_status, payment_status } = req.body || {};
  const updated = await updateOrder(req.params.id, { order_status, payment_status });
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Order not found' });
  }
  res.json({ success: true, message: 'Order status updated', data: updated });
});

app.delete('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  const ok = await deleteOrder(req.params.id);
  if (!ok) {
    return res.status(404).json({ success: false, error: 'Order not found' });
  }
  res.json({ success: true, message: 'Order deleted' });
});

// -------------------------------------------------------------
// ADMIN CUSTOMERS MANAGEMENT
// -------------------------------------------------------------
app.get('/api/admin/customers', requireAdmin, async (req, res) => {
  const { search } = req.query;
  const customers = await getCustomers({ search });
  res.json({ success: true, count: customers.length, data: customers });
});

app.post('/api/admin/customers', requireAdmin, async (req, res) => {
  const { name } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ success: false, error: 'Customer name is required' });
  }
  const created = await createCustomer(req.body);
  res.status(201).json({ success: true, message: 'Customer added successfully', data: created });
});

app.put('/api/admin/customers/:id', requireAdmin, async (req, res) => {
  const updated = await updateCustomer(req.params.id, req.body || {});
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Customer not found' });
  }
  res.json({ success: true, message: 'Customer updated successfully', data: updated });
});

app.delete('/api/admin/customers/:id', requireAdmin, async (req, res) => {
  const ok = await deleteCustomer(req.params.id);
  if (!ok) {
    return res.status(404).json({ success: false, error: 'Customer not found' });
  }
  res.json({ success: true, message: 'Customer deleted' });
});

// -------------------------------------------------------------
// ADMIN BANNERS & STORE SETTINGS MANAGEMENT
// -------------------------------------------------------------
app.get('/api/admin/banners', requireAdmin, async (req, res) => {
  const [banners, settings] = await Promise.all([
    getBanners(false),
    getStoreSettings()
  ]);
  res.json({ success: true, data: banners, settings });
});

app.post('/api/admin/banners', requireAdmin, async (req, res) => {
  const { title } = req.body || {};
  if (!title || !String(title).trim()) {
    return res.status(400).json({ success: false, error: 'Banner title is required' });
  }
  const created = await createBanner(req.body);
  const dbVersion = await broadcastEvent('banner_updated', { banner: created });
  res.status(201).json({ success: true, message: 'Banner created successfully', data: created, dbVersion });
});

app.put('/api/admin/banners/:id', requireAdmin, async (req, res) => {
  const updated = await updateBanner(req.params.id, req.body || {});
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Banner not found' });
  }
  const dbVersion = await broadcastEvent('banner_updated', { banner: updated });
  res.json({ success: true, message: 'Banner updated successfully', data: updated, dbVersion });
});

app.delete('/api/admin/banners/:id', requireAdmin, async (req, res) => {
  const ok = await deleteBanner(req.params.id);
  if (!ok) {
    return res.status(404).json({ success: false, error: 'Banner not found' });
  }
  const dbVersion = await broadcastEvent('banner_updated', { deletedId: req.params.id });
  res.json({ success: true, message: 'Banner deleted successfully', dbVersion });
});

app.get('/api/admin/settings', requireAdmin, async (req, res) => {
  const settings = await getStoreSettings();
  res.json({ success: true, data: settings });
});

app.put('/api/admin/settings', requireAdmin, async (req, res) => {
  const updated = await updateStoreSettings(req.body || {});
  const dbVersion = await broadcastEvent('settings_updated', { settings: updated });
  res.json({ success: true, message: 'Store settings saved', data: updated, dbVersion });
});

// -------------------------------------------------------------
// ADMIN IMAGE UPLOAD ENDPOINT (Vercel Blob in Cloud / Local Disk Locally)
// -------------------------------------------------------------
app.post('/api/admin/upload', requireAdmin, (req, res, next) => {
  upload.array('photos', 10)(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        const msg = err.code === 'LIMIT_FILE_SIZE'
          ? 'One or more images exceed the 10MB file size limit.'
          : err.code === 'LIMIT_FILE_COUNT'
            ? 'Maximum 10 images can be uploaded at a time.'
            : err.message;
        return res.status(400).json({ success: false, error: msg });
      }
      return res.status(400).json({ success: false, error: err.message || 'Image upload validation failed' });
    }
    next();
  });
}, async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, error: 'No image files were received.' });
  }

  // Verify binary magic bytes for every uploaded file
  for (const file of req.files) {
    if (!isValidImageBuffer(file.buffer)) {
      return res.status(400).json({
        success: false,
        error: `File "${file.originalname}" is not a valid image binary.`
      });
    }
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  const urls = [];

  for (const file of req.files) {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const safeName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;

    if (blobToken) {
      const blob = await putVercelBlob(`uploads/${safeName}`, file.buffer, {
        access: 'public',
        contentType: file.mimetype,
        token: blobToken
      });
      urls.push(blob.url);
    } else {
      const targetDir = isVercel ? TMP_UPLOADS : UPLOADS_DIR;
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, safeName), file.buffer);
      urls.push(`/uploads/${safeName}`);
    }
  }

  res.json({
    success: true,
    message: `${urls.length} image(s) uploaded successfully`,
    storage: blobToken ? 'vercel-blob' : 'local-disk',
    urls
  });
});

// Structured JSON Error Handler for all API routes (never return raw HTML errors to frontend JS)
app.use('/api', (err, req, res, next) => {
  console.error('API Error:', err);
  const status = err.statusCode || err.status || 500;
  res.status(status).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// -------------------------------------------------------------
// FRONTEND PAGE ROUTING (SPA & Direct Navigation Support)
// -------------------------------------------------------------
app.get('/admin', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});
app.get(/^\/admin\/.*/, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

app.get('/accessories', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});
app.get('/clothing', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});
app.get(/^\/product\/.*/, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});
app.get(/^\/collection\/.*/, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});
app.use((req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Start Server locally
if (!isVercel) {
  ensureInitialized().then(async () => {
    const dbVersion = await getDbVersion();
    app.listen(PORT, () => {
      console.log(`\n======================================================`);
      console.log(`⚡ ACCESSIFY SERVER RUNNING ON: http://localhost:${PORT}`);
      console.log(`🛒 Storefront:  http://localhost:${PORT}`);
      console.log(`🔒 Admin Panel: http://localhost:${PORT}/admin`);
      console.log(`💬 WhatsApp:    https://wa.me/${WHATSAPP_NUMBER}`);
      console.log(`🗄️  DB Mode:     ${getDbMode()} (v${dbVersion})`);
      console.log(`======================================================\n`);
    });
  }).catch(err => {
    console.error('Failed to initialize ACCESSIFY database:', err);
    process.exit(1);
  });
}

export default app;
