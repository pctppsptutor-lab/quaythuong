const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucky-wheel-test-'));
process.env.DATABASE_PATH = path.join(tempDir, 'test.sqlite');
process.env.JWT_SECRET = 'automated-test-secret-with-at-least-32-characters';
process.env.ADMIN_INITIAL_PASSWORD = 'AutomatedTestPassword!2026';
process.env.ALLOWED_ORIGINS = 'http://127.0.0.1';

const app = require('../server');
const db = require('../db');
let server;
let baseUrl;
let token;

async function request(url, options = {}) {
    const response = await fetch(`${baseUrl}${url}`, options);
    const type = response.headers.get('content-type') || '';
    const body = type.includes('json') ? await response.json() : await response.text();
    return { response, body };
}

test.before(async () => {
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    for (let attempt = 0; attempt < 30; attempt++) {
        const result = await request('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: process.env.ADMIN_INITIAL_PASSWORD }) });
        if (result.response.ok) { token = result.body.token; return; }
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('Test administrator was not created.');
});

test.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
});

test('security headers and protected draw endpoints', async () => {
    const page = await request('/');
    assert.equal(page.response.status, 200);
    assert.match(page.response.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(page.response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await request('/api/spin', { method: 'POST' })).response.status, 401);
    assert.equal((await request('/api/winners')).response.status, 401);
    assert.equal((await request('/api/admin/winners/export')).response.status, 401);
});

test('default password is not accepted', async () => {
    const result = await request('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
    assert.notEqual(result.response.status, 200);
});

test('weights are validated, stored and used without duplicate concurrent winners', async () => {
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const invalid = await request('/api/admin/import-raw', { method: 'POST', headers, body: JSON.stringify({ rawData: '100001, Invalid, 0' }) });
    assert.equal(invalid.response.status, 400);
    const valid = await request('/api/admin/import-raw', { method: 'POST', headers, body: JSON.stringify({ rawData: '100001, A, 7\n100002, B, 3\n100003, C, 1' }) });
    assert.equal(valid.response.status, 200);
    const list = await request('/api/admin/participants', { headers: { Authorization: `Bearer ${token}` } });
    assert.deepEqual(Object.fromEntries(list.body.map(row => [row.code, row.weight])), { '100001': 7, '100002': 3, '100003': 1 });
    const spins = await Promise.all([1, 2].map(() => request('/api/spin', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })));
    assert.ok(spins.every(result => result.response.status === 200));
    assert.equal(new Set(spins.map(result => result.body.code)).size, 2);
});
