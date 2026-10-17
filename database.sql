CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_etb NUMERIC(12,2) NOT NULL CHECK (price_etb >= 0),
  image_url TEXT NOT NULL DEFAULT '',
  category VARCHAR(80) NOT NULL DEFAULT 'Bags',
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  customer_name VARCHAR(100) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  address TEXT NOT NULL,
  total_etb NUMERIC(12,2) NOT NULL CHECK (total_etb >= 0),
  payment_method VARCHAR(30) NOT NULL CHECK (payment_method IN ('cash_on_delivery','telebirr','cbe_birr')),
  payment_status VARCHAR(30) NOT NULL DEFAULT 'unpaid',
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_etb NUMERIC(12,2) NOT NULL CHECK (unit_price_etb >= 0)
);

INSERT INTO products (name, description, price_etb, image_url, category, stock)
SELECT v.name, v.description, v.price, v.image, v.category, v.stock
FROM (VALUES
 ('Classic Tote','Elegant everyday carry bag.',1800,'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=700','Tote',10),
 ('City Shoulder Bag','A versatile bag for daily outings.',2200,'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=700','Shoulder',8),
 ('Premium Handbag','A refined design for special occasions.',3200,'https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=700','Handbags',6),
 ('Travel Weekender','Spacious bag for short trips.',4200,'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=700','Travel',5),
 ('Mini Crossbody','Compact style with hands-free convenience.',1500,'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=700','Crossbody',12),
 ('Everyday Backpack','Practical storage for busy days.',2800,'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=700','Backpacks',9)
) AS v(name,description,price,image,category,stock)
WHERE NOT EXISTS (SELECT 1 FROM products);
