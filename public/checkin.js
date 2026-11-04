const checkinForm = document.getElementById('checkinForm');
const tutorCodeInput = document.getElementById('tutorCode');
const submitBtn = document.getElementById('submitBtn');
const errorAlert = document.getElementById('errorAlert');
const resultCard = document.getElementById('resultCard');
const resultIcon = document.getElementById('resultIcon');
const resultTitle = document.getElementById('resultTitle');
const resultCode = document.getElementById('resultCode');
const resultDesc = document.getElementById('resultDesc');
const resetBtn = document.getElementById('resetBtn');
const counterNumber = document.getElementById('counterNumber');

// Tự động viết hoa khi gõ
if (tutorCodeInput) {
    tutorCodeInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9_\-]/g, '');
        if (errorAlert) errorAlert.style.display = 'none';
    });
}

// Tải số lượng người tham gia
async function fetchCounter() {
    try {
        const res = await fetch('/api/checkin/stats');
        if (res.ok) {
            const data = await res.json();
            if (counterNumber) counterNumber.textContent = Number(data.total).toLocaleString('vi-VN');
        }
    } catch (err) {
        // Không ảnh hưởng giao diện chính
    }
}
fetchCounter();
setInterval(fetchCounter, 5000);

// Xử lý gửi Form
if (checkinForm) {
    checkinForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = tutorCodeInput.value.trim().toUpperCase();
        if (!code) {
            showError('Vui lòng nhập mã gia sư của bạn.');
            return;
        }

        submitBtn.classList.add('loading');
        submitBtn.disabled = true;
        if (errorAlert) errorAlert.style.display = 'none';

        try {
            const res = await fetch('/api/checkin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Có lỗi xảy ra, vui lòng thử lại.');
            }

            // Hiển thị màn hình thành công
            checkinForm.style.display = 'none';
            resultCard.style.display = 'block';
            resultCode.textContent = data.code;

            if (data.alreadyRegistered) {
                resultIcon.textContent = 'ℹ️';
                resultTitle.textContent = 'ĐÃ CÓ TRONG DANH SÁCH';
                resultTitle.style.color = '#f9d423';
                resultDesc.textContent = 'Mã ' + data.code + ' đã được ghi nhận trước đó rồi. Bạn hoàn toàn yên tâm chờ đón kết quả trên vòng quay may mắn nhé!';
            } else {
                resultIcon.textContent = '🎉';
                resultTitle.textContent = 'ĐIỂM DANH THÀNH CÔNG!';
                resultTitle.style.color = '#2ecc71';
                resultDesc.textContent = 'Mã ' + data.code + ' đã được đưa thẳng vào hệ thống quay thưởng. Chúc bạn may mắn giành giải thưởng lớn!';
                fetchCounter();
            }

        } catch (err) {
            showError(err.message);
        } finally {
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        }
    });
}

function showError(msg) {
    if (!errorAlert) return;
    errorAlert.textContent = msg;
    errorAlert.style.display = 'block';
    if (tutorCodeInput) tutorCodeInput.focus();
}

// Bấm điểm danh lại
if (resetBtn) {
    resetBtn.addEventListener('click', () => {
        if (resultCard) resultCard.style.display = 'none';
        if (checkinForm) checkinForm.style.display = 'block';
        if (tutorCodeInput) {
            tutorCodeInput.value = '';
            tutorCodeInput.focus();
        }
    });
}
