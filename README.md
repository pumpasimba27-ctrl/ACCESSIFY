# ACCESSIFY — Premium Streetwear & Gothic E-Commerce Website

A complete, high-performance, fully functional e-commerce website for the luxury accessories brand **ACCESSIFY**.

- **Visual & Layout Reference:** Inspired by **[GENRAGE](https://genrage.com/)** (minimalist monochrome luxury, high-fashion Y2K/streetwear aesthetics, stark typography, 3:4 portrait card aspect ratios, dual-image hover effect, infinite marquee, smooth animations).
- **Product Catalog Reference:** 100% authentic catalog imported from **[ACCESSIFY STORE](https://accessify-store.vercel.app/)** (all 204 pieces across authentic categories, prices in ₹ INR, MRPs, descriptions, CDN images, and variants).
- **Ordering System:** Dedicated direct **WhatsApp Ordering Integration** via `+91 7012400815` (`https://wa.me/917012400815`).
- **Central Database & Synchronization:** Persistent **SQLite WAL-mode engine** with instant Server-Sent Events (SSE) broadcasting and multi-device real-time updates.
- **Admin Control Desk:** Separate, secured administrative dashboard at `/admin`.

---

## 🚀 Quick Start

### 1. Start Server
Run either:
```bash
npm start
```
or double-click `start_store.bat` on Windows.

### 2. Access Links
- **Customer Storefront:** `http://localhost:3000`
- **Admin Control Panel:** `http://localhost:3000/admin`
- **WhatsApp Support Desk:** `https://wa.me/917012400815`

### 3. Default Admin Credentials
- **Username:** `admin`
- **Password:** `accessify2026`
*(Can be customized in `.env`)*

---

## 💎 Features Overview

### 1. Visual Design (GENRAGE Inspiration)
- **Top Announcement Bar:** Rotating ticker with free shipping, surgical steel guarantee, and WhatsApp contact.
- **Header & Navigation:** Frosted glass sticky header, bold ACCESSIFY wordmark, desktop navigation, search modal, and live WhatsApp status pill.
- **Hero Section:** Full-bleed dark streetwear hero banner with high-contrast typography and call-to-actions.
- **Infinite Marquee Ticker:** Continuous horizontal ticker with brand promises and WhatsApp contact.
- **Curated Category Grid:** Visual cards for Chrome Hearts, Chains & Necklaces, Combo Sets, Bracelets, Rings, and more.
- **Product Cards:**
  - Strict 3:4 fashion portrait aspect ratio.
  - Dual-image hover transition to secondary photograph.
  - Strikethrough MRP and discount percentage badges.
  - Dedicated **ORDER ON WHATSAPP** button right on every card.
- **Product Detail Page (PDP) Overlay:**
  - Multi-image gallery with zoom and thumbnail selection.
  - Product specs (316L Surgical Grade Stainless Steel, tarnish-free, waterproof, sweatproof).
  - Variant / size selector.
  - Big **ORDER ON WHATSAPP** button.
  - Sticky bottom ordering bar on mobile devices.
  - Related product recommendations.
- **Customer Reviews:** Authentic verified buyer reviews and 5-star rating presentation.
- **FAQ Accordion:** Answers to WhatsApp ordering, payment options, shipping times, and material specs.

### 2. WhatsApp Ordering System
There is **no checkout or payment gateway**. Every product order and inquiry connects directly to WhatsApp:
- **WhatsApp Number:** `+91 7012400815`
- **Pre-filled Message Template:**
```text
Hello ACCESSIFY! I'm interested in ordering this product.

Product: [Product Name]
Price: ₹[Product Price]
Product Link: [Product URL]

Please provide more details about availability and ordering.
```
- Fully compatible with Android, iPhone Safari, Chrome, and the Instagram in-app browser.

### 3. Central Database & Global Synchronization
- Powered by persistent SQLite (`data/accessify.db`) in WAL (Write-Ahead Logging) mode.
- Every create, update, delete, or status change automatically increments the global `dbVersion`.
- Real-time Server-Sent Events (SSE) stream (`/api/events`) immediately pushes inventory updates to all active sessions (desktop, phone, Instagram browser) without full page reload.
- Full Cache-Control headers prevent stale data across browsers.

### 4. Admin Dashboard (`/admin`)
- **Metrics Overview:** Total products, in-stock count, sold-out count, category count, connected clients.
- **Add Product:** Name, category, price, MRP, description, variants, image URLs or local photo uploads.
- **Edit Product:** Update price, description, images, categories, and inventory.
- **One-Click Toggle:** Instantly toggle between "In Stock" and "Sold Out".
- **Delete Product:** Permanent removal from central catalog with confirmation modal.
- **Category Manager:** Add or inspect categories and live product counts.
- **Audit Logs:** Chronological record of all admin activities.

---

## 📂 Project Architecture

```
ACCESSIFY WEB 2/
├── data/
│   ├── accessify.db            # Central SQLite persistent database
│   └── initial_products.json   # 204 authentic imported products
├── public/
│   ├── assets/images/          # Brand photography, logos, category banners
│   ├── css/
│   │   ├── style.css           # Customer storefront styles (GENRAGE aesthetic)
│   │   └── admin.css           # Admin dashboard stylesheet
│   ├── js/
│   │   ├── app.js              # Storefront engine, catalog, PDP, WhatsApp, SSE
│   │   └── admin.js            # Admin panel controller, CRUD, auth
│   ├── index.html              # Customer-facing storefront
│   └── admin.html              # Dedicated admin control dashboard
├── uploads/                    # Admin uploaded product photos
├── .env                        # Environment configuration
├── db.js                       # SQLite database interface & migrations
├── server.js                   # Express server, REST APIs, SSE broadcast
├── package.json
└── start_store.bat             # 1-Click launcher
```

