# NIGSTA HABASHA

A premium bag-store starter built with HTML, CSS, JavaScript, Node.js, Express and PostgreSQL.

## Setup on Kali Linux

1. Install Node.js and PostgreSQL.
2. Create a PostgreSQL user and database:
   ```sql
   CREATE USER nigsta_user WITH PASSWORD 'choose_a_strong_password';
   CREATE DATABASE nigsta_shop OWNER nigsta_user;
   ```
3. Copy `.env.example` to `.env`, update `DATABASE_URL`, and generate a secret:
   ```bash
   cp .env.example .env
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
4. Import the schema:
   ```bash
   psql -U nigsta_user -h localhost -d nigsta_shop -f database.sql
   ```
5. Install dependencies and start:
   ```bash
   npm install
   npm start
   ```
6. Open http://localhost:3000 and http://localhost:3000/account.html.

## Important

- Never commit `.env` or real secrets.
- This is a learning starter, not production-hardened. Add CSRF protection, rate limiting, secure deployment configuration, and monitoring before public launch.
- The Telebirr and CBE Birr options are placeholders only. They do not process payments. Real payments require approved provider API integration and server-side payment verification.
- The included PostgreSQL connection assumes local development without SSL. Configure verified TLS for production.
- Add an admin-only product/order management interface before running the shop as a real business.
