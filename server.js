require("dotenv").config();
const express = require("express");
const session = require("express-session");
const pg = require("pg");
const bcrypt = require("bcryptjs");
const PgSession = require("connect-pg-simple")(session);
const path = require("path");

const app = express();
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : false
});

app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  store: new PgSession({ pool, createTableIfMissing: true, tableName: "user_sessions" }),
  name: "nigsta.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 4 * 60 * 60 * 1000
  }
}));
app.use(express.static(path.join(__dirname, "public")));

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Please log in first." });
  next();
}
const safeUser = u => ({ id: u.id, name: u.name, email: u.email });

app.get("/api/products", async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT id,name,description,price_etb,image_url,category,stock FROM products WHERE active=TRUE ORDER BY id"
    );
    res.json(result.rows);
  } catch (e) { next(e); }
});

app.post("/api/signup", async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (name.length < 2 || name.length > 100 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        password.length < 8 || password.length > 72) {
      return res.status(400).json({ error: "Enter a valid name/email and a password of 8–72 characters." });
    }
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      "INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email",
      [name, email, hash]
    );
    req.session.userId = result.rows[0].id;
    res.status(201).json({ user: safeUser(result.rows[0]) });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "That email is already registered." });
    next(e);
  }
});

app.post("/api/login", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const result = await pool.query(
      "SELECT id,name,email,password_hash FROM users WHERE email=$1", [email]
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }
    req.session.regenerate(err => {
      if (err) return next(err);
      req.session.userId = user.id;
      res.json({ user: safeUser(user) });
    });
  } catch (e) { next(e); }
});

app.get("/api/me", async (req, res, next) => {
  if (!req.session.userId) return res.json({ user: null });
  try {
    const r = await pool.query("SELECT id,name,email FROM users WHERE id=$1", [req.session.userId]);
    res.json({ user: r.rows[0] || null });
  } catch (e) { next(e); }
});

app.post("/api/logout", (req, res, next) => {
  req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie("nigsta.sid");
    res.json({ message: "Logged out." });
  });
});

app.post("/api/orders", requireLogin, async (req, res, next) => {
  const { items } = req.body;
  const name = String(req.body.name || "").trim();
  const phone = String(req.body.phone || "").trim();
  const address = String(req.body.address || "").trim();
  const method = req.body.paymentMethod;
  if (!Array.isArray(items) || items.length < 1 || items.length > 30 ||
      name.length < 2 || name.length > 100 || phone.length < 7 || phone.length > 30 ||
      address.length < 5 || address.length > 500 ||
      !["cash_on_delivery","telebirr","cbe_birr"].includes(method)) {
    return res.status(400).json({ error: "Check your order details." });
  }
  const quantities = new Map();
  for (const item of items) {
    const id = Number(item.id), qty = Number(item.quantity);
    if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(qty) || qty < 1 || qty > 20)
      return res.status(400).json({ error: "Invalid product or quantity." });
    quantities.set(id, (quantities.get(id) || 0) + qty);
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ids = [...quantities.keys()];
    const found = await client.query(
      "SELECT id,name,price_etb,stock FROM products WHERE id=ANY($1::bigint[]) AND active=TRUE FOR UPDATE",
      [ids]
    );
    if (found.rows.length !== ids.length) throw Object.assign(new Error("A product is unavailable."), { status: 400 });
    let total = 0;
    for (const p of found.rows) {
      const qty = quantities.get(Number(p.id));
      if (p.stock < qty) throw Object.assign(new Error(p.name + " is out of stock."), { status: 400 });
      total += Number(p.price_etb) * qty;
    }
    const order = await client.query(
      "INSERT INTO orders(user_id,customer_name,phone,address,total_etb,payment_method) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,total_etb,status,payment_status",
      [req.session.userId,name,phone,address,total,method]
    );
    for (const p of found.rows) {
      const qty = quantities.get(Number(p.id));
      await client.query(
        "INSERT INTO order_items(order_id,product_id,quantity,unit_price_etb) VALUES($1,$2,$3,$4)",
        [order.rows[0].id,p.id,qty,p.price_etb]
      );
      await client.query("UPDATE products SET stock=stock-$1 WHERE id=$2",[qty,p.id]);
    }
    await client.query("COMMIT");
    res.status(201).json({ message: "Order received. Payment has not been processed.", order: order.rows[0] });
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  } finally { client.release(); }
});

app.get("/api/orders", requireLogin, async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT id,total_etb,payment_method,payment_status,status,created_at FROM orders WHERE user_id=$1 ORDER BY created_at DESC",
      [req.session.userId]
    );
    res.json(result.rows);
  } catch (e) { next(e); }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

const port = Number(process.env.PORT) || 3000;
async function start() {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
    throw new Error("Set a random SESSION_SECRET (at least 32 characters) in .env.");
  await pool.query("SELECT 1");
  app.listen(port, () => console.log("NIGSTA HABASHA running at http://localhost:" + port));
}
start().catch(e => { console.error("Startup failed:", e.message); process.exit(1); });
