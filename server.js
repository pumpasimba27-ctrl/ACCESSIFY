import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  getProducts,
  getProductByIdOrSlug,
  getAllCategories,
  createProduct,
  updateProduct,
  deleteProduct,
  setProductStatus,
  getDashboardStats,
  verifyAdminCredentials,
  addCategory,
  deleteCategory,
  getAuditLogs,
  getDbVersion,
  bumpVersion
} from './db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const WHATSAPP_NUMBER = '917012400815';

// Directories
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Active Admin Session Tokens Store
const activeSessions = new Map(); // token -> { username, loginAt }

// Connected SSE Clients for Instant Global Sync
const sseClients = new Set();

function broadcastEvent(type, payload = {}) {
  const version = bumpVersion();
  const data = JSON.stringify({ type, version, ...payload, timestamp: Date.now() });
  for (const client of sseClients) {
    try {
      client.write(`event: catalog_update\ndata: ${data}\n\n`);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// Multer storage setup for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif|avif/;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    const mime = file.mimetype.toLowerCase();
    if (allowed.test(ext) && allowed.test(mime)) {
      cb(null, true);
    } else {
      cb(new Error('Only valid image files (JPG, PNG, WEBP, GIF, AVIF) are permitted.'));
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Static Assets
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(PUBLIC_DIR));

// CRITICAL CACHE CONTROL: Disable all API caching across mobile browsers, Instagram webview & Safari
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('X-DB-Version', String(getDbVersion()));
  next();
});

// Admin Auth Middleware
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, error: 'Unauthorized. No authorization header provided.' });
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!activeSessions.has(token)) {
    return res.status(401).json({ success: false, error: 'Session expired or invalid. Please sign in again.' });
  }

  req.adminUser = activeSessions.get(token);
  next();
}

// -------------------------------------------------------------
// REAL-TIME SYNCHRONIZATION SSE STREAM
// -------------------------------------------------------------
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  sseClients.add(res);

  // Send initial handshake with current DB version
  const initial = JSON.stringify({ type: 'connected', version: getDbVersion(), timestamp: Date.now() });
  res.write(`data: ${initial}\n\n`);

  // Keep-alive heartbeat every 20 seconds
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch (e) {
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

// Health & System Info
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    brand: 'ACCESSIFY',
    version: '2.0.0',
    dbVersion: getDbVersion(),
    whatsapp: WHATSAPP_NUMBER,
    timestamp: new Date().toISOString()
  });
});

// Real-Time Version Check
app.get('/api/version', (req, res) => {
  res.json({
    dbVersion: getDbVersion(),
    timestamp: Date.now()
  });
});

// Categories with active product counts
app.get('/api/categories', (req, res) => {
  try {
    const { section } = req.query;
    const categories = getAllCategories(section);
    res.json({
      success: true,
      data: categories,
      dbVersion: getDbVersion()
    });
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ success: false, error: 'Failed to load categories' });
  }
});

// Get Products Catalog (with section, search, category, sort, status filters)
app.get('/api/products', (req, res) => {
  try {
    const { section, category, search, sort, status, featured, limit, offset } = req.query;
    const result = getProducts({
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

    res.json({
      success: true,
      dbVersion: result.version,
      total: result.total,
      count: result.count,
      data: result.products
    });
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ success: false, error: 'Failed to load products' });
  }
});

// Get Single Product by ID or Slug (with related items)
app.get('/api/products/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = getProductByIdOrSlug(id);

    if (!result || !result.product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    res.json({
      success: true,
      data: result.product,
      related: result.related,
      dbVersion: getDbVersion()
    });
  } catch (err) {
    console.error('Error fetching product:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch product details' });
  }
});

// -------------------------------------------------------------
// ADMIN SECURE AUTHENTICATION ROUTES
// -------------------------------------------------------------

// Admin Login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Please enter both username and password' });
  }

  const isValid = verifyAdminCredentials(username, password);
  if (!isValid) {
    return res.status(401).json({ success: false, error: 'Invalid username or password' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  activeSessions.set(token, {
    username,
    loginAt: Date.now()
  });

  res.json({
    success: true,
    token,
    user: { username, role: 'administrator' },
    message: 'Welcome back to ACCESSIFY Admin'
  });
});

// Admin Verify Current Session
app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json({
    success: true,
    user: req.adminUser,
    dbVersion: getDbVersion()
  });
});

// Admin Logout
app.post('/api/admin/logout', requireAdmin, (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
  if (token) activeSessions.delete(token);
  res.json({ success: true, message: 'Logged out successfully' });
});

// Admin Dashboard Summary Metrics
app.get('/api/admin/dashboard', requireAdmin, (req, res) => {
  try {
    const stats = getDashboardStats();
    const auditLogs = getAuditLogs(20);
    res.json({
      success: true,
      stats,
      auditLogs,
      connectedClients: sseClients.size
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).json({ success: false, error: 'Failed to load dashboard metrics' });
  }
});

// Admin All Products (including hidden ones)
app.get('/api/admin/products', requireAdmin, (req, res) => {
  try {
    const { section, category, search, sort, status, limit, offset } = req.query;
    const result = getProducts({
      section,
      category,
      search,
      sort,
      status,
      limit,
      offset,
      includeHidden: true
    });

    res.json({
      success: true,
      total: result.total,
      count: result.count,
      data: result.products,
      dbVersion: result.version
    });
  } catch (err) {
    console.error('Admin get products error:', err);
    res.status(500).json({ success: false, error: 'Failed to load products' });
  }
});

// Admin Add Product
app.post('/api/admin/products', requireAdmin, (req, res) => {
  try {
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
    } = req.body;

    if (!name || !category || price === undefined) {
      return res.status(400).json({ success: false, error: 'Product name, category, and price are required.' });
    }

    const created = createProduct({
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

    broadcastEvent('product_created', { product: created });

    res.status(201).json({
      success: true,
      message: 'Product added successfully',
      data: created,
      dbVersion: getDbVersion()
    });
  } catch (err) {
    console.error('Error creating product:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to create product' });
  }
});

// Admin Update Product
app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const updated = updateProduct(id, req.body);

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    broadcastEvent('product_updated', { product: updated });

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: updated,
      dbVersion: getDbVersion()
    });
  } catch (err) {
    console.error('Error updating product:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to update product' });
  }
});

// Admin Delete Product
app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const success = deleteProduct(id);

    if (!success) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    broadcastEvent('product_deleted', { productId: id });

    res.json({
      success: true,
      message: 'Product permanently deleted',
      deletedId: id,
      dbVersion: getDbVersion()
    });
  } catch (err) {
    console.error('Error deleting product:', err);
    res.status(500).json({ success: false, error: 'Failed to delete product' });
  }
});

// Admin Quick Status Toggle (available / sold_out / hidden)
app.patch('/api/admin/products/:id/status', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['available', 'sold_out', 'hidden'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Status must be available, sold_out, or hidden' });
    }

    const success = setProductStatus(id, status);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    broadcastEvent('product_status_changed', { productId: id, status });

    res.json({
      success: true,
      message: `Product marked as ${status}`,
      status,
      dbVersion: getDbVersion()
    });
  } catch (err) {
    console.error('Error changing product status:', err);
    res.status(500).json({ success: false, error: 'Failed to update product status' });
  }
});

// Admin Add Category
app.post('/api/admin/categories', requireAdmin, (req, res) => {
  try {
    const { name, section, display_order, description, image } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: 'Category name is required' });
    }

    const cat = addCategory({ name, section, display_order, description, image });
    broadcastEvent('category_added', { category: cat });

    res.json({
      success: true,
      message: 'Category created successfully',
      data: cat,
      dbVersion: getDbVersion()
    });
  } catch (err) {
    console.error('Error adding category:', err);
    res.status(500).json({ success: false, error: 'Failed to add category' });
  }
});

// Admin Delete Category
app.delete('/api/admin/categories/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const ok = deleteCategory(id);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }
    broadcastEvent('category_deleted', { categoryId: id });
    res.json({
      success: true,
      message: 'Category deleted successfully',
      dbVersion: getDbVersion()
    });
  } catch (err) {
    console.error('Error deleting category:', err);
    res.status(500).json({ success: false, error: 'Failed to delete category' });
  }
});

// Admin Image Upload Endpoint
app.post('/api/admin/upload', requireAdmin, upload.array('photos', 5), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files were uploaded' });
    }

    const urls = req.files.map(f => `/uploads/${f.filename}`);
    res.json({
      success: true,
      message: 'Images uploaded successfully',
      urls
    });
  } catch (err) {
    console.error('File upload error:', err);
    res.status(500).json({ success: false, error: err.message || 'File upload failed' });
  }
});

// -------------------------------------------------------------
// FRONTEND PAGE ROUTING (SPA & Direct Navigation Support)
// -------------------------------------------------------------

// Standalone Admin Route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});
app.get(/^\/admin\/.*/, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

// Section direct links (/accessories and /clothing)
app.get('/accessories', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});
app.get('/clothing', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Product direct links (e.g. /product/:slug or /product/:id)
app.get(/^\/product\/.*/, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Category direct links (e.g. /collection/:cat)
app.get(/^\/collection\/.*/, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Default Storefront
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Fallback for SPA routing
app.use((req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`⚡ ACCESSIFY SERVER RUNNING ON: http://localhost:${PORT}`);
  console.log(`🛒 Storefront:  http://localhost:${PORT}`);
  console.log(`🔒 Admin Panel: http://localhost:${PORT}/admin`);
  console.log(`💬 WhatsApp:   https://wa.me/${WHATSAPP_NUMBER}`);
  console.log(`📊 DB Version:  ${getDbVersion()}`);
  console.log(`======================================================\n`);
});
