const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcryptjs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function initDB() {
    if (!process.env.DATABASE_URL) {
        console.warn('⚠️ DATABASE_URL chưa được cấu hình. Ứng dụng sẽ không hoạt động đúng.');
        return;
    }
    
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS admin (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE,
            password TEXT
        )`);

        const res = await pool.query("SELECT * FROM admin WHERE username = 'admin'");
        if (res.rows.length === 0) {
            const initialPassword = process.env.ADMIN_INITIAL_PASSWORD;
            if (!initialPassword || initialPassword.length < 12) {
                console.error('⚠️ ADMIN_INITIAL_PASSWORD (ít nhất 12 ký tự) phải được thiết lập để tạo tài khoản admin đầu tiên.');
            } else {
                const hash = bcrypt.hashSync(initialPassword, 12);
                await pool.query("INSERT INTO admin (username, password) VALUES ('admin', $1)", [hash]);
            }
        } else if (process.env.ADMIN_INITIAL_PASSWORD && bcrypt.compareSync('admin123', res.rows[0].password)) {
            if (process.env.ADMIN_INITIAL_PASSWORD.length < 12) {
                console.error('⚠️ ADMIN_INITIAL_PASSWORD phải từ 12 ký tự trở lên.');
            } else {
                const hash = bcrypt.hashSync(process.env.ADMIN_INITIAL_PASSWORD, 12);
                await pool.query("UPDATE admin SET password = $1 WHERE id = $2", [hash, res.rows[0].id]);
            }
        }

        await pool.query(`CREATE TABLE IF NOT EXISTS participants (
            id SERIAL PRIMARY KEY,
            code TEXT UNIQUE,
            name TEXT,
            weight INTEGER DEFAULT 1,
            is_drawn INTEGER DEFAULT 0
        )`);
        
        await pool.query(`CREATE TABLE IF NOT EXISTS winners (
            id SERIAL PRIMARY KEY,
            code TEXT,
            name TEXT,
            won_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS audit_logs (
            id SERIAL PRIMARY KEY,
            admin_id INTEGER,
            action TEXT NOT NULL,
            details TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
    } catch (err) {
        console.error("Lỗi khi khởi tạo database:", err);
    }
}

initDB();

module.exports = pool;
