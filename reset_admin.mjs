import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const res = await pool.query("DELETE FROM app_users WHERE role = 'ADMIN'");
console.log('Admins removidos:', res.rowCount);
await pool.end();