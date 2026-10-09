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

let currentPage = 1;
const limit = 100;
let debounceTimeout = null;

async function loadParticipants(page = 1) {
    try {
        const query = document.getElementById('searchInput').value.trim();
        const res = await apiCall(`/api/admin/participants?page=${page}&limit=${limit}&search=${encodeURIComponent(query)}`);
        
        currentPage = res.page;
        allParticipants = res.data;
        
        document.getElementById('currentPageLabel').textContent = res.page;
        document.getElementById('totalPagesLabel').textContent = res.totalPages || 1;
        document.getElementById('totalItemsLabel').textContent = res.total;
        
        document.getElementById('prevPageBtn').disabled = res.page <= 1;
        document.getElementById('nextPageBtn').disabled = res.page >= (res.totalPages || 1);
        
        renderTable(allParticipants);
    } catch (e) {
        console.error(e);
    }
}

document.getElementById('prevPageBtn').addEventListener('click', () => {
    if (currentPage > 1) loadParticipants(currentPage - 1);
});
document.getElementById('nextPageBtn').addEventListener('click', () => {
    loadParticipants(currentPage + 1);
});

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
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
        currentPage = 1;
        loadParticipants(1);
    }, 500);
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
    if (!fileInput.files[0]) return showToast('Vui lòng chọn file', 'error');

    setLoading('btnCsv', true);
    try {
        const file = fileInput.files[0];
        const reader = new FileReader();
        
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                
                // Convert to array of objects
                const rawRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                if (rawRows.length < 2) throw new Error("File không có dữ liệu");
                
                // Find column indices
                const headers = rawRows[0].map(h => String(h || '').toLowerCase().trim());
                const codeIdx = headers.findIndex(h => h.includes('code') || h.includes('mã'));
                const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('tên'));
                const weightIdx = headers.findIndex(h => h.includes('weight') || h.includes('tỉ') || h.includes('ti le'));
                
                if (codeIdx === -1) throw new Error("Không tìm thấy cột Code/Mã");
                
                // Filter and build TSV lines
                const validLines = [];
                for (let i = 1; i < rawRows.length; i++) {
                    const row = rawRows[i];
                    if (!row || !row.length) continue;
                    const code = row[codeIdx] || '';
                    if (!code) continue;
                    const name = nameIdx !== -1 ? (row[nameIdx] || '') : '';
                    const weight = weightIdx !== -1 ? (row[weightIdx] || '1') : '1';
                    validLines.push(`${code}\t${name}\t${weight}`);
                }
                
                if (validLines.length === 0) throw new Error("Không có dòng dữ liệu hợp lệ");
                
                // Chunk upload
                const chunkSize = 4000;
                const totalChunks = Math.ceil(validLines.length / chunkSize);
                
                const progressModal = document.getElementById('progressModal');
                const progressBar = document.getElementById('progressBar');
                const progressText = document.getElementById('progressText');
                
                progressModal.classList.remove('hidden');
                
                let successCount = 0;
                
                for (let i = 0; i < totalChunks; i++) {
                    const chunk = validLines.slice(i * chunkSize, (i + 1) * chunkSize);
                    const rawData = chunk.join('\n');
                    
                    let retries = 3;
                    let res;
                    while (retries > 0) {
                        try {
                            res = await apiCall('/api/admin/import-raw', {
                                method: 'POST',
                                body: JSON.stringify({ rawData })
                            });
                            if (res && res.success) break;
                            throw new Error(res?.error || 'Lỗi lưu dữ liệu');
                        } catch (chunkErr) {
                            retries--;
                            if (retries === 0) throw new Error(`Lỗi tại gói ${i + 1}/${totalChunks} (dòng ${i * chunkSize + 1}): ${chunkErr.message}`);
                            progressText.textContent = `Mạng chập chờn, đang tự động thử lại gói ${i + 1}/${totalChunks}...`;
                            await new Promise(r => setTimeout(r, 1500));
                        }
                    }
                    
                    successCount += chunk.length;
                    
                    // Update progress
                    const percent = Math.round(((i + 1) / totalChunks) * 100);
                    progressBar.style.width = percent + '%';
                    progressText.textContent = `Đã tải lên ${successCount} / ${validLines.length} (${percent}%)`;
                }
                
                setTimeout(() => {
                    progressModal.classList.add('hidden');
                    showToast(`Tải lên hoàn tất ${successCount} mã!`, 'success');
                    fileInput.value = '';
                    loadStats();
                }, 1000);
                
            } catch (err) {
                document.getElementById('progressModal').classList.add('hidden');
                showToast(err.message || 'Lỗi khi đọc file Excel', 'error');
            }
            setLoading('btnCsv', false);
        };
        
        reader.readAsArrayBuffer(file);
    } catch (e) {
        showToast('Lỗi tải lên', 'error');
        setLoading('btnCsv', false);
    }
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

async function clearAllParticipants() {
    const confirmation = prompt('⚠️ CẢNH BÁO NGUY HIỂM:\nThao tác này sẽ XÓA TOÀN BỘ dữ liệu người tham gia và toàn bộ lịch sử trúng thưởng trong hệ thống!\n\nNếu bạn chắc chắn muốn xóa sạch, hãy gõ chữ "XOA" vào ô bên dưới:');
    if (confirmation !== 'XOA') {
        if (confirmation !== null) showToast('Đã hủy xóa (chưa nhập đúng chữ XOA)', 'info');
        return;
    }

    setLoading('clearAllParticipantsBtn', true);
    try {
        const res = await apiCall('/api/admin/participants', { method: 'DELETE' });
        if (res.success) {
            showToast(res.message || 'Đã xóa toàn bộ danh sách thành công!', 'success');
            loadStats();
            loadParticipants(1);
        } else {
            showToast(res.error || 'Lỗi khi xóa', 'error');
        }
    } catch (e) {
        showToast('Lỗi khi xóa danh sách', 'error');
    }
    setLoading('clearAllParticipantsBtn', false);
}

document.getElementById('loginBtn').addEventListener('click', login);
document.getElementById('password').addEventListener('keydown', event => { if (event.key === 'Enter') login(); });
document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('refreshStatsBtn').addEventListener('click', loadStats);
document.getElementById('refreshParticipantsBtn').addEventListener('click', () => loadParticipants(1));
document.getElementById('clearAllParticipantsBtn').addEventListener('click', clearAllParticipants);
document.getElementById('btnRaw').addEventListener('click', uploadRaw);
document.getElementById('btnCsv').addEventListener('click', uploadCsv);
document.getElementById('resetBtn').addEventListener('click', resetState);
document.getElementById('btnPwd').addEventListener('click', changePassword);
document.getElementById('searchInput').addEventListener('input', filterTable);
document.getElementById('exportAdminBtn').addEventListener('click', exportWinners);
document.querySelectorAll('.nav-link[data-view]').forEach(link => link.addEventListener('click', () => switchView(link.dataset.view)));
