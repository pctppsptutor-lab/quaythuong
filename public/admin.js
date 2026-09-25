let token = sessionStorage.getItem('adminToken');
let allParticipants = [];

if (token) {
    showDashboard();
}

// Toast System
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'information-circle';
    if(type === 'success') icon = 'checkmark-circle';
    if(type === 'error') icon = 'alert-circle';
    
    const iconElement = document.createElement('span');
    iconElement.setAttribute('aria-hidden', 'true');
    iconElement.textContent = icon === 'checkmark-circle' ? '✓' : icon === 'alert-circle' ? '⚠' : 'ℹ';
    const messageElement = document.createElement('span');
    messageElement.textContent = String(message);
    toast.append(iconElement, messageElement);
    container.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Toggle loading state on buttons
function setLoading(btnId, isLoading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (isLoading) {
        btn.classList.add('loading');
        btn.disabled = true;
    } else {
        btn.classList.remove('loading');
        btn.disabled = false;
    }
}

async function login() {
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    const btnId = 'loginBtn';
    
    setLoading(btnId, true);
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });
        const data = await res.json();
        
        if (res.ok) {
            token = data.token;
            sessionStorage.setItem('adminToken', token);
            showDashboard();
            showToast('Đăng nhập thành công', 'success');
        } else {
            showToast(data.error || 'Sai thông tin đăng nhập', 'error');
        }
    } catch (e) {
        showToast('Lỗi kết nối máy chủ', 'error');
    }
    setLoading(btnId, false);
}

function logout() {
    sessionStorage.removeItem('adminToken');
    token = null;
    document.getElementById('sidebar').classList.add('hidden');
    document.getElementById('mainContent').classList.add('hidden');
    document.getElementById('loginView').style.display = 'flex';
}

function showDashboard() {
    document.getElementById('loginView').style.display = 'none';
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('mainContent').classList.remove('hidden');
    loadStats();
    loadParticipants();
}

function switchView(viewId) {
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    
    document.querySelector(`.nav-link[data-view="${viewId}"]`).classList.add('active');
    document.getElementById(viewId).classList.add('active');
    
    if (viewId === 'overview') loadStats();
    if (viewId === 'participants') loadParticipants();
    if (viewId === 'history') loadHistory();
}

async function loadHistory() {
    try {
        const historyData = await apiCall('/api/admin/history');
        const tbody = document.querySelector('#historyTable tbody');
        tbody.replaceChildren();
        
        if (historyData.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 4;
            td.textContent = 'Chưa có lịch sử quay';
            td.className = 'empty-table';
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }
        
        historyData.forEach(h => {
            const tr = document.createElement('tr');
            [h.code, h.name, new Date(h.won_at).toLocaleString('vi-VN')].forEach((val, i) => {
                const td = document.createElement('td');
                td.textContent = val;
                if (i === 0) td.style.fontWeight = '700';
                tr.appendChild(td);
            });
            const actionCell = document.createElement('td');
            actionCell.style.textAlign = 'right';
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-sm btn-danger';
            deleteBtn.textContent = 'Xóa/Hủy kết quả';
            deleteBtn.onclick = () => deleteWinner(h.id);
            actionCell.appendChild(deleteBtn);
            tr.appendChild(actionCell);
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error(e);
    }
}

async function deleteWinner(id) {
    if (!confirm('Hủy kết quả này? Người này sẽ được trả lại trạng thái chưa quay.')) return;
    try {
        const res = await apiCall(`/api/admin/history/${id}`, { method: 'DELETE' });
        if (res.success) {
            showToast('Đã hủy kết quả', 'success');
            loadStats();
            loadHistory();
            if (document.getElementById('participants').classList.contains('active')) loadParticipants();
        }
    } catch (e) {
        showToast('Lỗi khi hủy', 'error');
    }
}

async function apiCall(url, options = {}) {
    if (!options.headers) options.headers = {};
    if (!(options.body instanceof FormData)) {
        options.headers['Content-Type'] = 'application/json';
    } else {
        delete options.headers['Content-Type'];
    }
    options.headers['Authorization'] = `Bearer ${token}`;
    
    const res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) {
        logout();
        showToast('Phiên đăng nhập hết hạn', 'error');
        throw new Error('Unauthorized');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Yêu cầu không thành công.');
    return data;
}

async function loadStats() {
    try {
        const stats = await apiCall('/api/admin/stats');
        document.getElementById('statTotal').textContent = stats.totalParticipants;
        document.getElementById('statDrawn').textContent = stats.drawn;
        document.getElementById('statRemain').textContent = stats.totalParticipants - stats.drawn;
    } catch (e) {
        console.error(e);
    }
}

async function loadParticipants() {
    try {
        allParticipants = await apiCall('/api/admin/participants');
        renderTable(allParticipants);
    } catch (e) {
        console.error(e);
    }
}

function renderTable(data) {
    const tbody = document.querySelector('#codesTable tbody');
    tbody.replaceChildren();
    
    if (data.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 5;
        td.textContent = 'Chưa có dữ liệu';
        td.className = 'empty-table';
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }
    
    data.forEach(c => {
        const tr = document.createElement('tr');
        const values = [c.code, c.name, c.weight];
        values.forEach((value, index) => {
            const td = document.createElement('td');
            td.textContent = String(value);
            if (index === 0) td.style.fontWeight = '700';
            tr.appendChild(td);
        });
        const statusCell = document.createElement('td');
        const statusBadge = document.createElement('span');
        statusBadge.className = `badge ${c.is_drawn ? 'badge-success' : 'badge-pending'}`;
        statusBadge.textContent = c.is_drawn ? 'Đã trúng' : 'Chưa quay';
        statusCell.appendChild(statusBadge);
        tr.appendChild(statusCell);
        const actionCell = document.createElement('td');
        actionCell.style.textAlign = 'right';
        const deleteButton = document.createElement('button');
        deleteButton.className = 'btn btn-sm btn-danger';
        deleteButton.type = 'button';
        deleteButton.textContent = 'Xóa';
        deleteButton.addEventListener('click', () => deleteParticipant(c.id));
        actionCell.appendChild(deleteButton);
        tr.appendChild(actionCell);
        tbody.appendChild(tr);
    });
}

function filterTable() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const filtered = allParticipants.filter(p => 
        p.code.toLowerCase().includes(query) || 
        p.name.toLowerCase().includes(query)
    );
    renderTable(filtered);
}

async function uploadRaw() {
    const rawData = document.getElementById('rawInput').value.trim();
    if (!rawData) return showToast('Vui lòng nhập danh sách', 'error');

    setLoading('btnRaw', true);
    try {
        const res = await apiCall('/api/admin/import-raw', {
            method: 'POST',
            body: JSON.stringify({ rawData })
        });
        if (res.success) {
            showToast(res.message, 'success');
            document.getElementById('rawInput').value = '';
            loadStats();
        } else {
            showToast(res.error, 'error');
        }
    } catch (e) {
        showToast('Lỗi lưu danh sách', 'error');
    }
    setLoading('btnRaw', false);
}

async function uploadCsv() {
    const fileInput = document.getElementById('csvFile');
    if (!fileInput.files[0]) return showToast('Vui lòng chọn file CSV', 'error');

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    setLoading('btnCsv', true);
    try {
        const res = await apiCall('/api/admin/import', { method: 'POST', body: formData });
        if (res.success) {
            showToast(res.message, 'success');
            fileInput.value = '';
            loadStats();
        } else {
            showToast(res.error, 'error');
        }
    } catch (e) {
        showToast('Lỗi tải lên', 'error');
    }
    setLoading('btnCsv', false);
}

async function resetState() {
    if (!confirm('Hành động này sẽ XÓA TOÀN BỘ lịch sử người trúng thưởng hiện tại và trả danh sách về trạng thái chưa quay. Bạn có chắc chắn?')) return;
    
    try {
        const res = await apiCall('/api/admin/reset', { method: 'POST' });
        if (res.success) {
            showToast('Đã reset toàn bộ lịch sử thành công!', 'success');
            loadStats();
            loadParticipants();
            if (document.getElementById('history').classList.contains('active')) loadHistory();
        }
    } catch (e) {
        showToast('Lỗi khi reset', 'error');
    }
}

async function deleteParticipant(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa người này?')) return;
    try {
        const res = await apiCall(`/api/admin/participants/${id}`, { method: 'DELETE' });
        if (res.success) {
            showToast('Đã xóa thành công', 'success');
            loadStats();
            loadParticipants();
        }
    } catch (e) {
        showToast('Lỗi khi xóa', 'error');
    }
}

async function changePassword() {
    const currentPwd = document.getElementById('currentPwd').value;
    const newPwd = document.getElementById('newPwd').value;
    if (newPwd.length < 12) return showToast('Mật khẩu phải dài ít nhất 12 ký tự', 'error');
    
    setLoading('btnPwd', true);
    try {
        const res = await apiCall('/api/admin/change-password', {
            method: 'POST',
            body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd })
        });
        
        if (res.success) {
            showToast('Đổi mật khẩu thành công!', 'success');
            document.getElementById('currentPwd').value = '';
            document.getElementById('newPwd').value = '';
        } else {
            showToast(res.error || 'Lỗi', 'error');
        }
    } catch (e) {
        showToast('Lỗi kết nối', 'error');
    }
    setLoading('btnPwd', false);
}

async function exportWinners() {
    try {
        const response = await fetch('/api/admin/winners/export', { headers: { Authorization: `Bearer ${token}` } });
        if (response.status === 401 || response.status === 403) { logout(); throw new Error('Phiên đăng nhập hết hạn.'); }
        if (!response.ok) throw new Error('Không thể xuất CSV.');
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = url;
        link.download = 'danh_sach_trung_thuong.csv';
        link.click();
        URL.revokeObjectURL(url);
    } catch (error) { showToast(error.message, 'error'); }
}

document.getElementById('loginBtn').addEventListener('click', login);
document.getElementById('password').addEventListener('keydown', event => { if (event.key === 'Enter') login(); });
document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('refreshStatsBtn').addEventListener('click', loadStats);
document.getElementById('refreshParticipantsBtn').addEventListener('click', loadParticipants);
document.getElementById('btnRaw').addEventListener('click', uploadRaw);
document.getElementById('btnCsv').addEventListener('click', uploadCsv);
document.getElementById('resetBtn').addEventListener('click', resetState);
document.getElementById('btnPwd').addEventListener('click', changePassword);
document.getElementById('searchInput').addEventListener('input', filterTable);
document.getElementById('exportAdminBtn').addEventListener('click', exportWinners);
document.querySelectorAll('.nav-link[data-view]').forEach(link => link.addEventListener('click', () => switchView(link.dataset.view)));
