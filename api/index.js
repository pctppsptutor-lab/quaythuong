require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const configuredSecret = process.env.JWT_SECRET;
if (configuredSecret && configuredSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters.');
const JWT_SECRET = configuredSecret || crypto.randomBytes(48).toString('base64url');
if (!configuredSecret) console.warn('JWT_SECRET is not configured; sessions will be invalid after restart.');
const allowedOriginsConfig = process.env.ALLOWED_ORIGINS || `http://localhost:${PORT},http://127.0.0.1:${PORT}`;
const allowedOrigins = new Set(allowedOriginsConfig.split(',').map(value => value.trim()).filter(Boolean));

app.disable('x-powered-by');
app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
});
app.use(cors({ origin(origin, callback) {
    if (!origin || allowedOriginsConfig === '*' || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed'));
} }));
app.use(express.json({ limit: '128kb' }));
app.use(express.static(path.join(__dirname, '../public'), { index: 'index.html' }));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 200, standardHeaders: 'draft-8', legacyHeaders: false });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
const spinLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
app.use('/api/', apiLimiter);

// Sử dụng /tmp cho Vercel compatibility
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 1024 * 1024, files: 1 } });

function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.sendStatus(401);
    try {
        req.user = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
        return next();
    } catch { return res.sendStatus(403); }
}

function cleanText(value, maxLength) { return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength); }
function validWeight(value) {
    const weight = Number(value);
    return Number.isSafeInteger(weight) && weight >= 1 && weight <= 1000000 ? weight : null;
}
function normalizeParticipant(codeValue, nameValue, weightValue) {
    const code = cleanText(codeValue, 32);
    const name = cleanText(nameValue || 'Ẩn danh', 120);
    const weight = validWeight(weightValue == null || weightValue === '' ? 1 : weightValue);
    if (!code) throw new Error('Mã dự thưởng không được để trống.');
    if (!/^\d{1,6}$/.test(code)) throw new Error(`Mã ${code} phải gồm từ 1 đến 6 chữ số.`);
    if (!weight) throw new Error(`Tỷ lệ của mã ${code} phải là số nguyên từ 1 đến 1.000.000.`);
    return { code, name, weight };
}

function audit(adminId, action, details = '') { 
    pool.query('INSERT INTO audit_logs (admin_id, action, details) VALUES ($1, $2, $3)', [adminId || null, action, cleanText(details, 500)]).catch(e => console.error("Audit log error:", e)); 
}
function csvCell(value) {
    let text = String(value ?? '').replace(/\r?\n/g, ' ');
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
}

let transactionQueue = Promise.resolve();
function withTransactionLock(task) {
    const current = transactionQueue.then(task, task);
    transactionQueue = current.catch(() => {});
    return current;
}

app.post('/api/login', loginLimiter, async (req, res) => {
    const username = cleanText(req.body?.username, 64);
    const password = String(req.body?.password || '');
    if (!username || !password || password.length > 256) return res.status(400).json({ error: 'Thông tin đăng nhập không hợp lệ.' });
    
    try {
        const result = await pool.query('SELECT * FROM admin WHERE username = $1', [username]);
        const user = result.rows[0];
        if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Sai thông tin đăng nhập.' });
        if (password === 'admin123') return res.status(403).json({ error: 'Mật khẩu mặc định đã bị vô hiệu. Hãy cấu hình ADMIN_INITIAL_PASSWORD rồi khởi động lại.' });
        
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '2h' });
        audit(user.id, 'login');
        return res.json({ token });
    } catch (err) {
        return res.status(500).json({ error: 'Lỗi máy chủ.' });
    }
});

app.post('/api/admin/change-password', authenticateToken, async (req, res) => {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (newPassword.length < 12 || newPassword.length > 128) return res.status(400).json({ error: 'Mật khẩu mới phải dài 12–128 ký tự.' });
    
    try {
        const result = await pool.query('SELECT password FROM admin WHERE id = $1', [req.user.id]);
        const user = result.rows[0];
        if (!user || !bcrypt.compareSync(currentPassword, user.password)) return res.status(403).json({ error: 'Mật khẩu hiện tại không đúng.' });
        
        const hash = bcrypt.hashSync(newPassword, 12);
        await pool.query('UPDATE admin SET password = $1 WHERE id = $2', [hash, req.user.id]);
        audit(req.user.id, 'change_password');
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: 'Lỗi cơ sở dữ liệu.' });
    }
});

app.get('/api/winners', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT code, name, won_at FROM winners ORDER BY won_at DESC LIMIT 20');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Lỗi cơ sở dữ liệu.' });
    }
});

app.get('/api/admin/winners/export', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT code, name, won_at FROM winners ORDER BY won_at DESC');
        const rows = result.rows;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="danh_sach_trung_thuong.csv"');
        res.write('\uFEFFMã Số,Họ Tên,Thời Gian\n');
        rows.forEach(row => res.write([row.code, row.name, row.won_at].map(csvCell).join(',') + '\n'));
        audit(req.user.id, 'export_winners', `${rows.length} rows`);
        return res.end();
    } catch (err) {
        return res.status(500).send('Lỗi cơ sở dữ liệu.');
    }
});

app.post('/api/spin', spinLimiter, authenticateToken, (req, res) => withTransactionLock(async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const pResult = await client.query('SELECT id, code, name, weight FROM participants WHERE is_drawn = 0 ORDER BY id');
        const participants = pResult.rows;
        
        if (!participants.length) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Đã hết danh sách mã!' }); }
        const weighted = participants.map(item => ({ ...item, weight: validWeight(item.weight) || 1 }));
        const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
        if (!Number.isSafeInteger(totalWeight) || totalWeight < 1) throw new Error('Invalid total weight');
        
        let ticket = crypto.randomInt(totalWeight);
        let selected = weighted[weighted.length - 1];
        for (const participant of weighted) {
            if (ticket < participant.weight) { selected = participant; break; }
            ticket -= participant.weight;
        }
        
        const update = await client.query('UPDATE participants SET is_drawn = 1 WHERE id = $1 AND is_drawn = 0', [selected.id]);
        if (update.rowCount !== 1) throw new Error('Concurrent spin conflict');
        
        await client.query('INSERT INTO winners (code, name) VALUES ($1, $2)', [selected.code, selected.name]);
        await client.query('COMMIT');
        audit(req.user.id, 'spin', `participant_id=${selected.id}`);
        return res.json({ code: String(selected.code), name: selected.name });
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        console.error('Spin failed:', error.message);
        return res.status(500).json({ error: 'Không thể hoàn tất lượt quay. Vui lòng thử lại.' });
    } finally {
        client.release();
    }
}));

async function importRows(rows) {
    return withTransactionLock(async () => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            for (const row of rows) {
                await client.query(
                    'INSERT INTO participants (code, name, weight) VALUES ($1, $2, $3) ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, weight = EXCLUDED.weight', 
                    [row.code, row.name, row.weight]
                );
            }
            await client.query('COMMIT');
        } catch (error) {
            try { await client.query('ROLLBACK'); } catch {}
            throw error;
        } finally {
            client.release();
        }
    });
}

app.post('/api/admin/import-raw', authenticateToken, async (req, res) => {
    const rawData = String(req.body?.rawData || '');
    if (!rawData) return res.status(400).json({ error: 'Không có dữ liệu.' });
    const lines = rawData.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines.length > 5000) return res.status(400).json({ error: 'Tối đa 5.000 dòng mỗi lần nhập.' });
    try {
        const rows = lines.map(line => {
            const parts = line.includes('\t') ? line.split('\t') : line.split(',');
            return normalizeParticipant(parts[0], parts[1], parts[2]);
        });
        await importRows(rows);
        audit(req.user.id, 'import_raw', `${rows.length} rows`);
        return res.json({ success: true, message: `Đã nhập/cập nhật ${rows.length} mã.` });
    } catch (error) { return res.status(400).json({ error: error.message || 'Dữ liệu không hợp lệ.' }); }
});

app.post('/api/admin/import', authenticateToken, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Chưa chọn file.' });
    const results = [];
    let parseError = null;
    fs.createReadStream(req.file.path).pipe(csv({ mapHeaders: ({ header }) => cleanText(header, 40) }))
        .on('data', row => {
            if (results.length >= 5000) { parseError = parseError || new Error('Tối đa 5.000 dòng mỗi lần nhập.'); return; }
            try { results.push(normalizeParticipant(row.code || row.Code || row.CODE, row.name || row.Name || row.NAME, row.weight || row.Weight || row.WEIGHT || row.tile || row.TiLe)); }
            catch (error) { parseError = parseError || error; }
        })
        .on('error', error => { parseError = parseError || error; })
        .on('end', async () => {
            fs.rm(req.file.path, { force: true }, () => {});
            if (parseError || !results.length) return res.status(400).json({ error: parseError?.message || 'CSV không có dữ liệu hợp lệ.' });
            try {
                await importRows(results);
                audit(req.user.id, 'import_csv', `${results.length} rows`);
                return res.json({ success: true, message: `Đã nhập/cập nhật ${results.length} mã.` });
            } catch { return res.status(500).json({ error: 'Không thể nhập CSV.' }); }
        });
});

app.get('/api/admin/participants', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, code, name, weight, is_drawn FROM participants ORDER BY id DESC LIMIT 5000');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: 'Lỗi cơ sở dữ liệu.' }); }
});

app.get('/api/admin/stats', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT COUNT(*) AS total_participants, SUM(CASE WHEN is_drawn = 1 THEN 1 ELSE 0 END) AS drawn FROM participants');
        const row = result.rows[0];
        return res.json({ totalParticipants: parseInt(row.total_participants || 0), drawn: parseInt(row.drawn || 0) });
    } catch (error) {
        return res.status(500).json({ error: 'Lỗi cơ sở dữ liệu.' });
    }
});

app.delete('/api/admin/participants/:id', authenticateToken, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'ID không hợp lệ.' });
    try { 
        await pool.query('DELETE FROM participants WHERE id = $1', [id]); 
        audit(req.user.id, 'delete_participant', `participant_id=${id}`); 
        return res.json({ success: true }); 
    }
    catch { return res.status(500).json({ error: 'Lỗi cơ sở dữ liệu.' }); }
});

app.get('/api/admin/history', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, code, name, won_at FROM winners ORDER BY won_at DESC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: 'Lỗi cơ sở dữ liệu.' }); }
});

app.delete('/api/admin/history/:id', authenticateToken, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'ID không hợp lệ.' });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const winnerRes = await client.query('SELECT code FROM winners WHERE id = $1', [id]);
        if (winnerRes.rows.length) {
            await client.query('UPDATE participants SET is_drawn = 0 WHERE code = $1', [winnerRes.rows[0].code]);
            await client.query('DELETE FROM winners WHERE id = $1', [id]);
        }
        await client.query('COMMIT');
        audit(req.user.id, 'delete_winner', `winner_id=${id}`);
        return res.json({ success: true });
    } catch { 
        try { await client.query('ROLLBACK'); } catch {}
        return res.status(500).json({ error: 'Lỗi cơ sở dữ liệu.' }); 
    } finally {
        client.release();
    }
});

app.post('/api/admin/reset', authenticateToken, (req, res) => withTransactionLock(async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('UPDATE participants SET is_drawn = 0');
        await client.query('DELETE FROM winners');
        await client.query('COMMIT');
        audit(req.user.id, 'reset_draw');
        return res.json({ success: true });
    } catch {
        try { await client.query('ROLLBACK'); } catch {}
        return res.status(500).json({ error: 'Không thể reset dữ liệu.' });
    } finally {
        client.release();
    }
}));

app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'File CSV tối đa 1 MB.' : 'File tải lên không hợp lệ.' });
    if (error?.message === 'Origin not allowed') return res.status(403).json({ error: 'Origin không được phép.' });
    console.error(error);
    return res.status(500).json({ error: 'Lỗi máy chủ.' });
});

if (require.main === module) app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
module.exports = app;
