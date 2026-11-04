const spinBtn = document.getElementById('spinBtn');
const msgEl = document.getElementById('message');
const soundToggle = document.getElementById('soundToggle');
const winnersList = document.getElementById('winnersList');
const winnersCount = document.getElementById('winnersCount');

const wNameDisplay = document.getElementById('winnerNameDisplay');
const wName = document.getElementById('wName');
const wSmallInfo = document.getElementById('winnerSmallInfo');
const wSmallCode = document.getElementById('wSmallCode');
const wSmallName = document.getElementById('wSmallName');
const hugeCongrats = document.getElementById('hugeCongrats');
const exportBtn = document.getElementById('exportBtn');
const reloadBtn = document.getElementById('reloadBtn');
const presenterLogin = document.getElementById('presenterLogin');
const presenterLoginBtn = document.getElementById('presenterLoginBtn');
const presenterLoginMessage = document.getElementById('presenterLoginMessage');
let presenterToken = sessionStorage.getItem('presenterToken');

function syncPresenterState() {
    presenterLogin.classList.toggle('hidden', Boolean(presenterToken));
    spinBtn.disabled = !presenterToken;
    document.getElementById('spinCount').disabled = !presenterToken;
    exportBtn.disabled = false;
}

async function presenterSignIn() {
    presenterLoginBtn.disabled = true;
    presenterLoginMessage.textContent = 'Đang đăng nhập...';
    try {
        const response = await fetch('/api/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: document.getElementById('presenterUsername').value, password: document.getElementById('presenterPassword').value })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Không thể đăng nhập.');
        presenterToken = data.token;
        sessionStorage.setItem('presenterToken', presenterToken);
        presenterLoginMessage.textContent = '';
        syncPresenterState();
        loadWinners();
    } catch (error) { presenterLoginMessage.textContent = error.message; }
    finally { presenterLoginBtn.disabled = false; }
}

// Audio setup
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playTickSound(isLock = false) {
    if (!soundToggle.checked) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    if (isLock) {
        // High pitched ding for locking in a number
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.3);
        
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
        return;
    }
    
    // Regular mechanical tick
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(1500, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.02);
    
    gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.02);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.02);
}

function playWinSound() {
    if (!soundToggle.checked) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const now = audioCtx.currentTime;
    // Richer fanfare chord
    const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
    
    notes.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = i === 3 ? 'square' : 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.15);
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.2, now + i * 0.15 + 0.1);
        gain.gain.setValueAtTime(0.2, now + 0.8);
        gain.gain.linearRampToValueAtTime(0, now + 1.5);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start(now + i * 0.15);
        osc.stop(now + 1.5);
    });
}

// Setup Marquee Lights
function setupLights() {
    const addDots = (id, count) => {
        const el = document.getElementById(id);
        for(let i=0; i<count; i++) {
            const dot = document.createElement('div');
            dot.className = 'dot';
            el.appendChild(dot);
        }
    };
    addDots('lights-top', 20);
    addDots('lights-bottom', 20);
    addDots('lights-left', 6);
    addDots('lights-right', 6);
}

let lightInterval;
function startMarquee() {
    const dots = document.querySelectorAll('.dot');
    let step = 0;
    clearInterval(lightInterval);
    lightInterval = setInterval(() => {
        dots.forEach((dot, i) => {
            if ((i + step) % 3 === 0) dot.classList.add('on');
            else dot.classList.remove('on');
        });
        step++;
    }, 150);
}

function stopMarquee() {
    clearInterval(lightInterval);
    document.querySelectorAll('.dot').forEach(dot => dot.classList.add('on'));
}

async function loadWinners() {
    winnersList.setAttribute('aria-busy', 'true');
    winnersList.replaceChildren();
    for (let i = 0; i < 4; i++) {
        const skeleton = document.createElement('div');
        skeleton.className = 'skeleton-card';
        skeleton.setAttribute('aria-hidden', 'true');
        skeleton.textContent = 'Đang tải...';
        winnersList.appendChild(skeleton);
    }

    try {
        const headers = presenterToken ? { Authorization: `Bearer ${presenterToken}` } : {};
        const res = await fetch('/api/winners', { headers });
        if (!res.ok) {
            throw new Error('Không thể tải danh sách người trúng.');
        }
        const winners = await res.json();
        
        winnersList.replaceChildren();
        winnersCount.textContent = `(${winners.length} người)`;
        
        winners.forEach((w, i) => {
            const card = document.createElement('div');
            card.className = 'winner-card';
            const index = document.createElement('div');
            index.className = 'winner-index';
            index.textContent = String(i + 1);
            const info = document.createElement('div');
            info.className = 'winner-info';
            const code = document.createElement('div');
            code.className = 'w-code';
            code.textContent = w.code;
            const name = document.createElement('div');
            name.className = 'w-name';
            name.textContent = w.name;
            info.append(code, name);
            card.append(index, info);
            winnersList.appendChild(card);
        });
    } catch (e) {
        winnersList.replaceChildren();
        const error = document.createElement('p');
        error.textContent = 'Lỗi tải dữ liệu.';
        winnersList.appendChild(error);
    } finally {
        winnersList.setAttribute('aria-busy', 'false');
    }
}

async function exportWinners() {
    if (!presenterToken) {
        presenterLogin.classList.remove('hidden');
        presenterLoginMessage.textContent = 'Vui lòng đăng nhập người điều khiển để xuất danh sách.';
        presenterLogin.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
        document.getElementById('presenterPassword').focus();
        return;
    }
    const response = await fetch('/api/admin/winners/export', { headers: { Authorization: `Bearer ${presenterToken}` } });
    if (response.status === 401 || response.status === 403) {
        presenterToken = null; sessionStorage.removeItem('presenterToken'); syncPresenterState(); return;
    }
    if (!response.ok) return;
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url; link.download = 'danh_sach_trung_thuong.csv'; link.click();
    URL.revokeObjectURL(url);
}

// Background Music
const bgMusic = new Audio('spin-music.mp3');
bgMusic.loop = true;

// Spin logic
spinBtn.addEventListener('click', async () => {
    // Hide previous win state
    wNameDisplay.classList.add('hidden');
    wSmallInfo.classList.add('hidden');
    for(let i=0; i<6; i++) document.getElementById('slot-'+i).textContent = '0';

    spinBtn.disabled = true;
    spinBtn.setAttribute('aria-busy', 'true');
    spinBtn.querySelector('.btn-text').style.display = 'none';
    spinBtn.querySelector('.spinner').style.display = 'inline-block';
    msgEl.textContent = 'Đang tải...';
    
    if (soundToggle.checked) {
        bgMusic.currentTime = 0;
        bgMusic.play().catch(e => console.log('Audio play blocked:', e));
    }
    
    try {
        const count = parseInt(document.getElementById('spinCount').value) || 1;
        const res = await fetch('/api/spin', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${presenterToken}` },
            body: JSON.stringify({ count })
        });
        const data = await res.json();

        spinBtn.setAttribute('aria-busy', 'false');
        spinBtn.querySelector('.btn-text').style.display = 'inline';
        spinBtn.querySelector('.spinner').style.display = 'none';
        
        if (!res.ok) {
            bgMusic.pause();
            if (res.status === 401 || res.status === 403) { presenterToken = null; sessionStorage.removeItem('presenterToken'); syncPresenterState(); }
            msgEl.textContent = data.error;
            spinBtn.disabled = false;
            return;
        }
        
        msgEl.textContent = 'Đang quay... ⚙️';
        if (count === 1) {
            animateSlots(data.winners[0].code, data.winners[0].name, false);
        } else {
            // Batch mode: animate with dummy code, then show modal
            window.currentBatchWinners = data.winners;
            animateSlots('888888', 'BATCH_WIN', true);
        }
        
    } catch (e) {
        bgMusic.pause();
        spinBtn.setAttribute('aria-busy', 'false');
        spinBtn.querySelector('.btn-text').style.display = 'inline';
        spinBtn.querySelector('.spinner').style.display = 'none';
        msgEl.textContent = 'Lỗi kết nối!';
        spinBtn.disabled = false;
    }
});

const CHAR_POOL = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function animateSlots(targetCode, winnerName, isBatch) {
    const rawStr = String(targetCode).toUpperCase().trim();
    // Đảm bảo ít nhất 6 ô lồng quay
    const codeStr = rawStr.length < 6 ? rawStr.padStart(6, '0') : rawStr;
    
    const slotsContainer = document.querySelector('.slots');
    slotsContainer.innerHTML = '';
    const slots = [];
    
    for (let i = 0; i < codeStr.length; i++) {
        const slotEl = document.createElement('div');
        slotEl.className = 'slot';
        const innerEl = document.createElement('div');
        innerEl.className = 'slot-inner';
        innerEl.id = 'slot-' + i;
        innerEl.textContent = '0';
        slotEl.appendChild(innerEl);
        slotsContainer.appendChild(slotEl);
        slots.push(innerEl);
    }
    
    startMarquee();
    
    const totalSlots = slots.length;
    slots.forEach((slot, index) => {
        const targetChar = codeStr[index];
        const charIdx = CHAR_POOL.indexOf(targetChar);
        const finalCharIdx = charIdx >= 0 ? charIdx : 0;
        const extraSpins = 12 + (index * 6);
        const totalSteps = extraSpins * CHAR_POOL.length + finalCharIdx;
        
        let spinDuration = 1 + (index * 0.45);
        if (index === totalSlots - 2) spinDuration += 1.0;
        if (index === totalSlots - 1) spinDuration += 2.0;
        if (isBatch) spinDuration = spinDuration * 0.5;
        
        const startedAt = performance.now();
        const durationMs = spinDuration * 1000;
        
        function step(now) {
            const progress = Math.min(1, (now - startedAt) / durationMs);
            const eased = 1 - Math.pow(1 - progress, index >= totalSlots - 2 ? 4 : 2);
            const currentStep = Math.floor(totalSteps * eased);
            const currentChar = CHAR_POOL[currentStep % CHAR_POOL.length];
            
            if (slot.textContent !== currentChar) {
                slot.textContent = currentChar;
                if (index < 2) playTickSound();
            }
            
            if (progress < 1) return requestAnimationFrame(step);
            slot.textContent = isBatch ? '?' : targetChar;
            slot.classList.add('locked');
            playTickSound(true);
            
            if (index === totalSlots - 1) {
                onSpinComplete(codeStr, winnerName, isBatch);
            }
        }
        requestAnimationFrame(step);
    });
}

function onSpinComplete(code, name, isBatch) {
    bgMusic.pause();
    msgEl.textContent = '';
    spinBtn.disabled = false;
    stopMarquee();
    playWinSound();
    
    if (isBatch) {
        const modal = document.getElementById('batchWinModal');
        const list = document.getElementById('batchWinnersList');
        list.innerHTML = '';
        window.currentBatchWinners.forEach(w => {
            const card = document.createElement('div');
            card.className = 'batch-winner-card';
            
            const codeEl = document.createElement('div');
            codeEl.className = 'batch-w-code';
            codeEl.textContent = w.code;

            const nameEl = document.createElement('div');
            nameEl.className = 'batch-w-name';
            nameEl.textContent = w.name;

            card.append(codeEl, nameEl);
            list.appendChild(card);
        });
        modal.classList.remove('hidden');
    } else {
        wName.textContent = name;
        wSmallCode.textContent = code;
        wSmallName.textContent = name;
        
        wNameDisplay.classList.remove('hidden');
        wSmallInfo.classList.remove('hidden');
        
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
            hugeCongrats.animate([
                { transform: 'translate(-50%, -50%) scale(0)', opacity: 1 },
                { transform: 'translate(-50%, -50%) scale(1.5)', opacity: 0 }
            ], { duration: 2000, easing: 'ease-out' });
        }
    }
    
    loadWinners();
}

document.getElementById('closeBatchModal').addEventListener('click', () => {
    document.getElementById('batchWinModal').classList.add('hidden');
    document.querySelectorAll('.slot-inner').forEach(s => {
        s.textContent = '0';
        s.classList.remove('locked');
    });
});

// QR Modal Logic
const openQrBtn = document.getElementById('openQrBtn');
const qrModal = document.getElementById('qrModal');
const closeQrModalBtn = document.getElementById('closeQrModalBtn');
const copyCheckinLinkBtn = document.getElementById('copyCheckinLinkBtn');
const qrLiveCount = document.getElementById('qrLiveCount');
let qrPollInterval = null;

async function updateQrStats() {
    try {
        const res = await fetch('/api/checkin/stats');
        if (res.ok) {
            const data = await res.json();
            qrLiveCount.textContent = `🔥 Đã có ${data.total.toLocaleString('vi-VN')} gia sư điểm danh!`;
        }
    } catch(e) {}
}

if (openQrBtn && qrModal) {
    openQrBtn.addEventListener('click', () => {
        qrModal.classList.remove('hidden');
        updateQrStats();
        qrPollInterval = setInterval(updateQrStats, 3000);
    });

    closeQrModalBtn.addEventListener('click', () => {
        qrModal.classList.add('hidden');
        clearInterval(qrPollInterval);
    });

    copyCheckinLinkBtn.addEventListener('click', async () => {
        const checkinUrl = `${window.location.origin}/checkin.html`;
        try {
            await navigator.clipboard.writeText(checkinUrl);
            const orig = copyCheckinLinkBtn.textContent;
            copyCheckinLinkBtn.textContent = '✓ Đã sao chép link!';
            setTimeout(() => { copyCheckinLinkBtn.textContent = orig; }, 2000);
        } catch (e) {
            prompt('Sao chép đường link điểm danh này:', checkinUrl);
        }
    });
}

const copyBatchBtn = document.getElementById('copyBatchWinnersBtn');
if (copyBatchBtn) {
    copyBatchBtn.addEventListener('click', async () => {
        if (!window.currentBatchWinners || !window.currentBatchWinners.length) return;
        const text = '🎉 DANH SÁCH TRÚNG THƯỞNG 🎉\n' + 
            window.currentBatchWinners.map((w, idx) => `${idx + 1}. Mã: ${w.code} - ${w.name}`).join('\n');
        try {
            await navigator.clipboard.writeText(text);
            const originalText = copyBatchBtn.textContent;
            copyBatchBtn.textContent = '✓ Đã sao chép!';
            copyBatchBtn.style.filter = 'brightness(1.2)';
            setTimeout(() => {
                copyBatchBtn.textContent = originalText;
                copyBatchBtn.style.filter = 'none';
            }, 2000);
        } catch (e) {
            alert('Không thể tự động sao chép. Hãy chọn và copy thủ công.');
        }
    });
}

// Init
setupLights();
startMarquee();
presenterLoginBtn.addEventListener('click', presenterSignIn);
document.getElementById('presenterPassword').addEventListener('keydown', event => { if (event.key === 'Enter') presenterSignIn(); });
exportBtn.addEventListener('click', exportWinners);
reloadBtn.addEventListener('click', async () => {
    if (!presenterToken) {
        location.reload();
        return;
    }
    if (confirm('Bạn có chắc chắn muốn làm mới (reset) toàn bộ lịch sử trúng thưởng về trạng thái ban đầu?')) {
        try {
            const res = await fetch('/api/admin/reset', { method: 'POST', headers: { Authorization: `Bearer ${presenterToken}` } });
            if (res.ok) {
                location.reload();
            } else {
                alert('Có lỗi xảy ra khi reset dữ liệu!');
            }
        } catch(e) {
            alert('Lỗi kết nối!');
        }
    }
});
syncPresenterState();
loadWinners();
