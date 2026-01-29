// --- 설정 ---
const WORK_TIME = 25 * 60; 
// const WORK_TIME = 5; // 테스트할 때 주석 해제

let timeLeft = WORK_TIME;
let timerInterval = null;
let isRunning = false;
let currentCategoryId = null;
let sessionElapsed = 0; 

// 데이터 로드
let categories = JSON.parse(localStorage.getItem('yemodoro_categories')) || [];
let logs = JSON.parse(localStorage.getItem('yemodoro_logs')) || [];

// 요소 선택
const els = {
    catList: document.getElementById('category-list'),
    addBtn: document.getElementById('add-category-btn'),
    delBtn: document.getElementById('delete-category-btn'),
    curTitle: document.getElementById('current-category-title'),
    miniTime: document.getElementById('mini-time-display'),
    mainTime: document.getElementById('main-time-display'),
    visual: document.getElementById('visual-timer'),
    play: document.getElementById('btn-play-mini'),
    reset: document.getElementById('btn-reset-mini'),
    total: document.getElementById('total-time'),
    today: document.getElementById('today-time'),
    heatmap: document.getElementById('heatmap-grid'),
    message: document.getElementById('timer-message'),
    expand: document.querySelector('.expand-btn')
};

// --- 초기화 ---
function init() {
    renderCategories();
    updateDashboard();
    updateTimerDisplay();
}

// --- 1. 대시보드 & 실시간 통계 ---
function updateDashboard() {
    const savedTotal = logs.reduce((sum, log) => sum + log.seconds, 0);
    const realTimeTotal = savedTotal + sessionElapsed;
    els.total.innerText = formatTimeDetailed(realTimeTotal);

    const todayStr = getTodayString();
    const savedToday = logs
        .filter(l => l.date === todayStr)
        .reduce((sum, log) => sum + log.seconds, 0);
    const realTimeToday = savedToday + sessionElapsed;
    els.today.innerText = formatTimeDetailed(realTimeToday);

    renderHeatmap();
}

// 히트맵 그리기 (가로 20 x 세로 5 = 100개)
function renderHeatmap() {
    els.heatmap.innerHTML = '';
    const today = new Date();
    
    for (let i = 0; i < 100; i++) {
        const dayDiff = 99 - i; // 99일 전부터 오늘까지
        const d = new Date();
        d.setDate(today.getDate() - dayDiff);
        const dateStr = d.toISOString().split('T')[0];

        const cell = document.createElement('div');
        cell.className = 'heatmap-cell';
        cell.title = dateStr;

        const hasLog = logs.some(log => log.date === dateStr);
        if (hasLog) cell.classList.add('active');
        
        if (dayDiff === 0) {
            cell.classList.add('today');
            if (sessionElapsed > 0 || hasLog) cell.classList.add('active');
        }

        els.heatmap.appendChild(cell);
    }
}

// --- 2. 타이머 로직 ---
function startTimer() {
    if(!currentCategoryId) return alert("카테고리를 먼저 선택해주세요!");
    if(isRunning) return;

    isRunning = true;
    els.play.innerHTML = '<i class="fas fa-pause"></i>';
    els.message.innerText = "집중 중입니다...";

    timerInterval = setInterval(() => {
        if(timeLeft > 0) {
            timeLeft--;
            sessionElapsed++;
            updateTimerDisplay();
            updateDashboard(); 
        } else {
            completeTimer();
        }
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    isRunning = false;
    els.play.innerHTML = '<i class="fas fa-play"></i>';
}

function completeTimer() {
    stopTimer();
    alert("집중 완료! 기록이 저장되었습니다.");
    
    logs.push({
        catId: currentCategoryId,
        date: getTodayString(),
        seconds: sessionElapsed
    });
    saveData();
    
    sessionElapsed = 0;
    timeLeft = WORK_TIME;
    updateTimerDisplay();
    updateDashboard();
    els.message.innerText = "수고하셨습니다!";
}

function resetTimer() {
    stopTimer();
    sessionElapsed = 0;
    timeLeft = WORK_TIME;
    updateTimerDisplay();
    updateDashboard();
    els.message.innerText = "리셋되었습니다.";
}

function updateTimerDisplay() {
    const m = Math.floor(timeLeft / 60);
    const s = timeLeft % 60;
    const txt = `${String(m).padStart(2,'0')} : ${String(s).padStart(2,'0')}`;
    
    els.miniTime.innerText = txt;
    els.mainTime.innerText = txt;

    const progress = timeLeft / WORK_TIME;
    const deg = progress * 360;
    els.visual.style.background = `conic-gradient(#ff4b4b ${deg}deg, transparent 0deg)`;
}

// --- 3. 유틸리티 ---
function getTodayString() {
    return new Date().toISOString().split('T')[0];
}

function formatTimeDetailed(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}시간 ${m}분`;
}

function renderCategories() {
    els.catList.innerHTML = '';
    categories.forEach(cat => {
        const div = document.createElement('div');
        div.className = `menu-item ${currentCategoryId === cat.id ? 'active' : ''}`;
        div.innerHTML = `<span class="dot green"></span> ${cat.name}`;
        div.onclick = () => selectCategory(cat.id);
        els.catList.appendChild(div);
    });
}

function selectCategory(id) {
    currentCategoryId = id;
    const cat = categories.find(c => c.id === id);
    if(cat) {
        els.curTitle.innerHTML = `<span class="dot green"></span> ${cat.name}`;
        els.message.innerText = "시작 버튼을 눌러주세요.";
    }
    renderCategories();
}

function saveData() {
    localStorage.setItem('yemodoro_categories', JSON.stringify(categories));
    localStorage.setItem('yemodoro_logs', JSON.stringify(logs));
}

// 이벤트 리스너
els.addBtn.onclick = () => {
    const name = prompt("새 카테고리 이름:");
    if(name) {
        const newCat = { id: Date.now(), name: name };
        categories.push(newCat);
        saveData();
        renderCategories();
        selectCategory(newCat.id);
    }
};

els.delBtn.onclick = () => {
    if(!currentCategoryId) return;
    if(confirm("이 카테고리를 삭제하시겠습니까?")) {
        categories = categories.filter(c => c.id !== currentCategoryId);
        currentCategoryId = null;
        els.curTitle.innerHTML = "카테고리 선택 대기중";
        saveData();
        renderCategories();
    }
};

els.play.onclick = () => { isRunning ? stopTimer() : startTimer(); };
els.reset.onclick = resetTimer;
els.expand.onclick = () => {
    document.body.classList.toggle('fullscreen');
    // 아이콘 변경
    els.expand.innerHTML = document.body.classList.contains('fullscreen') ? 
        '<i class="fas fa-compress"></i>' : '<i class="fas fa-expand"></i>';
};

init();