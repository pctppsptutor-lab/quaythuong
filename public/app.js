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
    if (!presenterToken) {
        winnersList.replaceChildren();
        winnersCount.textContent = '(đăng nhập để xem)';
        return;
    }
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
        const res = await fetch('/api/winners', { headers: { Authorization: `Bearer ${presenterToken}` } });
        if (res.status === 401 || res.status === 403) {
            presenterToken = null;
            sessionStorage.removeItem('presenterToken');
            syncPresenterState();
            throw new Error('Phiên đăng nhập hết hạn.');
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
        const res = await fetch('/api/spin', { method: 'POST', headers: { Authorization: `Bearer ${presenterToken}` } });
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
        animateSlots(data.code, data.name);
        
    } catch (e) {
        bgMusic.pause();
        spinBtn.setAttribute('aria-busy', 'false');
        spinBtn.querySelector('.btn-text').style.display = 'inline';
        spinBtn.querySelector('.spinner').style.display = 'none';
        msgEl.textContent = 'Lỗi kết nối!';
        spinBtn.disabled = false;
    }
});

function animateSlots(targetCode, winnerName) {
    const codeStr = String(targetCode).padStart(6, '0');
    
    const slots = [
        document.getElementById('slot-0'),
        document.getElementById('slot-1'),
        document.getElementById('slot-2'),
        document.getElementById('slot-3'),
        document.getElementById('slot-4'),
        document.getElementById('slot-5')
    ];
    
    // Clear locked classes
    slots.forEach(slot => slot.classList.remove('locked'));
    
    startMarquee();
    
    slots.forEach((slot, index) => {
        const targetDigit = parseInt(codeStr[index], 10);
        const extraSpins = 20 + (index * 10); // Less spins to be faster
        const finalVal = extraSpins * 10 + targetDigit; 
        
        const obj = { val: 0 };
        
        // Fast for first 4 slots, dramatic slowdown for the last 2
        let spinDuration = 1 + (index * 0.6); // 1s, 1.6s, 2.2s, 2.8s
        if (index === 4) spinDuration += 1.5; // 4.9s
        if (index === 5) spinDuration += 3; // 7.0s
        
        const easeType = index >= 4 ? "power4.out" : "power2.out";
        
        const startedAt = performance.now();
        const durationMs = spinDuration * 1000;
        function step(now) {
                const progress = Math.min(1, (now - startedAt) / durationMs);
                const eased = 1 - Math.pow(1 - progress, index >= 4 ? 4 : 2);
                obj.val = finalVal * eased;
                const currentDigit = Math.floor(obj.val) % 10;
                if (slot.textContent != currentDigit) {
                    slot.textContent = currentDigit;
                    if (index < 2) playTickSound(); 
                }
                if (progress < 1) return requestAnimationFrame(step);
                slot.textContent = targetDigit;
                slot.classList.add('locked'); 
                playTickSound(true); 
                
                if (index === 5) {
                    onSpinComplete(codeStr, winnerName);
                }
        }
        requestAnimationFrame(step);
    });
}

function onSpinComplete(code, name) {
    bgMusic.pause();
    msgEl.textContent = '';
    spinBtn.disabled = false;
    stopMarquee();
    playWinSound();
    
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
    
    loadWinners();
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
