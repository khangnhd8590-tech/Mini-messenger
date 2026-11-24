// Chạy: npm run db:init  -> tạo toàn bộ bảng từ schema.sql
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));
    console.log('✅ Đã tạo xong các bảng.');
  } catch (e) {
    console.error('❌ Lỗi:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
