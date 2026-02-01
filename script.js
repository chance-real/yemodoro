/* ===============================
   Firebase & Firestore Imports
=============================== */
import { auth, googleProvider, db } from "./firebase.js";
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ===============================
   Sound Effects
=============================== */
// 오디오 파일 로드
const clickSound = new Audio('computer-mouse-click-351398.mp3');
const alarmSound = new Audio('bellding-254774.mp3');

// 사운드 재생 함수
function playClickSound() {
  const sound = clickSound.cloneNode();
  sound.volume = 0.6;
  sound.play().catch(() => {});
}

function playAlarmSound() {
  alarmSound.currentTime = 0;
  alarmSound.play().catch(e => console.log("알림음 재생 실패:", e));
}

// 글로벌 클릭 리스너
document.addEventListener('click', (e) => {
  const target = e.target.closest('button, input, .category-item, .category-settings, .day-block, .settings-btn');
  if (target) {
    playClickSound();
  }
});

/* ===============================
   DOM Elements
=============================== */
const categoryList = document.getElementById("categoryList");
const categoryInput = document.getElementById("categoryInput");
const addCategoryBtn = document.getElementById("addCategoryBtn");
const currentCategory = document.getElementById("currentCategory");

const timerEl = document.getElementById("timer");
const canvas = document.getElementById("ring");
const ctx = canvas.getContext("2d");

const minuteInput = document.getElementById("minuteInput");

// Auth
const authBtn = document.getElementById("authBtn");
const userProfile = document.getElementById("userProfile");
const userName = document.getElementById("userName");

// Tracker Elements
const dailyCanvas = document.getElementById("dailyRing");
const dailyCtx = dailyCanvas.getContext("2d");
const todayDateEl = document.getElementById("todayDate");
const calTitle = document.getElementById("calTitle");
const calGrid = document.getElementById("calGrid");
const prevMonthBtn = document.getElementById("prevMonthBtn");
const nextMonthBtn = document.getElementById("nextMonthBtn");

// Focus Mode & New Controls
const focusToggleBtn = document.getElementById("focusToggleBtn");
const mainActionBtn = document.getElementById("mainActionBtn"); 
const resetBtn = document.getElementById("resetBtn");
const setTimeBtn = document.getElementById("setTimeBtn");

// Tooltip Element
const tooltipEl = document.getElementById("tooltip");

/* ===============================
   State Variables
=============================== */
let defaultCategory = {
  id: "default_001", 
  name: "예모도로(기본_25분)",
  color: "#FF2D55" 
};

let categories = [];
let activeCategory = { ...defaultCategory }; 

let totalSeconds = 25 * 60;
let remainingSeconds = totalSeconds;
let timerInterval = null;
let activeSettingsPanel = null;

// User & Data State
let currentUser = null;
let todayLog = { sessions: [], totals: {} }; 
let currentCalDate = new Date(); 

// [NEW] Screen Wake Lock 변수
let wakeLock = null;

/* ===============================
   [NEW] Screen Wake Lock Logic
=============================== */
// 화면 켜짐 유지 요청 함수
async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      // console.log('화면 켜짐 유지 활성화 (Wake Lock Active)');
      
      wakeLock.addEventListener('release', () => {
        // console.log('화면 켜짐 유지 해제됨 (Wake Lock Released)');
      });
    } catch (err) {
      console.error(`Wake Lock 요청 실패: ${err.name}, ${err.message}`);
    }
  }
}

// 화면 켜짐 유지 해제 함수
function releaseWakeLock() {
  if (wakeLock !== null) {
    wakeLock.release()
      .then(() => {
        wakeLock = null;
      })
      .catch((err) => console.error(err));
  }
}

// 탭 전환이나 창 최소화 후 돌아왔을 때, 타이머가 돌고 있다면 다시 잠금 요청
document.addEventListener('visibilitychange', async () => {
  if (wakeLock !== null && document.visibilityState === 'visible') {
    // 이미 락이 걸려있었으나 시스템에 의해 해제되었을 수 있으므로 재요청
    if (timerInterval) { 
      await requestWakeLock();
    }
  }
});

/* ===============================
   Tooltip Logic (Global)
=============================== */
function showTooltip(text, x, y) {
  tooltipEl.textContent = text;
  tooltipEl.classList.remove("hidden");
  moveTooltip(x, y);
}

function moveTooltip(x, y) {
  // 툴팁 위치 조정 (마우스 커서에서 약간 떨어지게)
  const offset = 15;
  let left = x + offset;
  let top = y + offset;

  // 화면 밖으로 나가지 않게 조정
  const rect = tooltipEl.getBoundingClientRect();
  if (left + rect.width > window.innerWidth) {
    left = x - rect.width - offset;
  }
  if (top + rect.height > window.innerHeight) {
    top = y - rect.height - offset;
  }

  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
}

function hideTooltip() {
  tooltipEl.classList.add("hidden");
}

/* ===============================
   Core Function: Save Categories
=============================== */
async function saveUserCategories() {
  if (!currentUser) return;
  try {
    await setDoc(doc(db, "users", currentUser.uid, "settings", "categories"), {
      list: categories
    });
  } catch(e) {
    console.error("카테고리 저장 실패:", e);
  }
}

/* ===============================
   Category Logic
=============================== */
function renderCategories() {
  categoryList.innerHTML = "";
  categories.forEach(cat => {
    const item = document.createElement("div");
    item.className = "category-item";

    const btn = document.createElement("button");
    btn.className = "category-btn";
    btn.textContent = cat.name;
    btn.style.background = cat.color; 
    btn.style.textShadow = "0 1px 3px rgba(0,0,0,0.6)";
    
    if (activeCategory.id === cat.id) {
      btn.classList.add("active");
    }

    btn.onclick = () => {
      activeCategory = cat;
      currentCategory.textContent = cat.name;
      drawRing();
      renderCategories(); 
    };

    const gear = document.createElement("div");
    gear.className = "category-settings";
    gear.textContent = "⚙️";
    gear.onclick = (e) => {
      e.stopPropagation();
      openSettings(cat, item);
    };

    item.appendChild(btn);
    item.appendChild(gear);
    categoryList.appendChild(item);
  });
}

function addCategory() {
  const name = categoryInput.value.trim();
  if (!name) return;

  const newCat = {
    id: Date.now().toString(),
    name,
    color: `hsl(${Math.random() * 360}, 80%, 60%)`
  };

  categories.push(newCat);
  categoryInput.value = "";
  
  renderCategories();
  drawRing(); 
  
  saveUserCategories();
}

addCategoryBtn.onclick = addCategory;
categoryInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.isComposing) {
    e.preventDefault();
    addCategory();
  }
});

/* ===============================
   Settings Panel
=============================== */
function openSettings(cat, triggerElement) {
  if (activeSettingsPanel) {
    activeSettingsPanel.remove();
    activeSettingsPanel = null;
  }

  const panel = document.createElement("div");
  panel.className = "settings-panel";
  document.body.appendChild(panel);

  const rect = triggerElement.getBoundingClientRect();
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  
  panel.style.top = `${rect.top + scrollTop}px`;
  panel.style.left = `${rect.right + 12}px`;

  const nameLabel = document.createElement("span");
  nameLabel.className = "settings-label";
  nameLabel.textContent = "이름 변경";
  
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = cat.name;
  nameInput.style.marginBottom = "8px";

  const colorLabel = document.createElement("span");
  colorLabel.className = "settings-label";
  colorLabel.textContent = "색상 선택";

  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.value = toHex(cat.color);

  const btnRow = document.createElement("div");
  btnRow.className = "settings-row";
  btnRow.style.marginTop = "12px";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "settings-btn btn-cancel";
  cancelBtn.textContent = "취소";
  cancelBtn.onclick = () => {
    panel.remove();
    activeSettingsPanel = null;
  };

  const confirmBtn = document.createElement("button");
  confirmBtn.className = "settings-btn btn-confirm";
  confirmBtn.textContent = "확인";
  confirmBtn.onclick = () => {
    cat.name = nameInput.value || cat.name;
    cat.color = colorInput.value;

    let logUpdated = false;
    if (todayLog && todayLog.sessions) {
      todayLog.sessions.forEach(session => {
        if (session.catId === cat.id) {
          session.color = cat.color;
          session.name = cat.name; // 이름도 업데이트
          logUpdated = true;
        }
      });
    }

    saveUserCategories();
    if (logUpdated && currentUser) {
      saveTodayLog();
    }

    if (activeCategory.id === cat.id) {
      activeCategory = cat;
      currentCategory.textContent = cat.name;
      drawRing();
    }
    
    renderCategories(); 
    drawDailyRing(); 
    updateTodayCalendarBlock();

    panel.remove();
    activeSettingsPanel = null;
  };

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(confirmBtn);

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "settings-btn btn-delete";
  deleteBtn.textContent = "카테고리 삭제";
  deleteBtn.onclick = () => {
    if(confirm("정말 이 카테고리를 삭제하시겠습니까?\n(과거 기록은 유지됩니다)")) {
      categories = categories.filter(c => c.id !== cat.id);
      if (activeCategory.id === cat.id) {
        activeCategory = { ...defaultCategory };
        currentCategory.textContent = activeCategory.name;
        drawRing();
      }
      renderCategories();
      saveUserCategories();
      
      panel.remove();
      activeSettingsPanel = null;
    }
  };

  panel.appendChild(nameLabel);
  panel.appendChild(nameInput);
  panel.appendChild(colorLabel);
  panel.appendChild(colorInput);
  panel.appendChild(btnRow); 
  panel.appendChild(deleteBtn); 

  activeSettingsPanel = panel;
}

function toHex(colorStr) {
  if (/^#[0-9a-f]{6}$/i.test(colorStr)) return colorStr;
  const ctxCanvas = document.createElement('canvas').getContext('2d');
  ctxCanvas.fillStyle = colorStr;
  return ctxCanvas.fillStyle; 
}

document.addEventListener("mousedown", (e) => {
  if (activeSettingsPanel && 
      !activeSettingsPanel.contains(e.target) && 
      !e.target.closest(".category-settings")) {
    activeSettingsPanel.remove();
    activeSettingsPanel = null;
  }
});

/* ===============================
   Focus Mode Logic
=============================== */
function toggleFocusMode() {
  document.body.classList.toggle("focus-mode");
  const isFocus = document.body.classList.contains("focus-mode");
  focusToggleBtn.textContent = isFocus ? "✕" : "⛶";
}

focusToggleBtn.onclick = toggleFocusMode;

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.body.classList.contains("focus-mode")) {
    toggleFocusMode();
  }
});

/* ===============================
   Timer Logic & Tracking
=============================== */
function updateTimer() {
  remainingSeconds--;
  trackCurrentSecond();

  if (remainingSeconds <= 0) {
    stopTimerLogic(); 
    remainingSeconds = 0;
    playAlarmSound();
  }
  
  drawRing();
  renderTime();
}

function startTimerLogic() {
  if (!timerInterval && remainingSeconds > 0) {
    timerInterval = setInterval(updateTimer, 1000);
    canvas.classList.add("running");
    mainActionBtn.textContent = "정지"; 
    drawRing();
    requestWakeLock(); // [NEW] 타이머 시작 시 화면 켜짐 유지 요청
  }
}

function stopTimerLogic() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
    canvas.classList.remove("running");
    mainActionBtn.textContent = "시작"; 
    drawRing();
    saveTodayLog();
    releaseWakeLock(); // [NEW] 타이머 정지 시 화면 켜짐 유지 해제
  }
}

function trackCurrentSecond() {
  if (!activeCategory) return;
  const now = new Date();
  
  const lastSession = todayLog.sessions[todayLog.sessions.length - 1];
  const currentTime = now.getTime();
  
  // 같은 카테고리로 1.5초 이내 연속 기록이면 시간 연장
  if (lastSession && 
      lastSession.catId === activeCategory.id && 
      (currentTime - lastSession.end) < 1500) {
    lastSession.end = currentTime; 
    // 색상과 이름 최신화 (삭제 대비)
    lastSession.color = activeCategory.color;
    lastSession.name = activeCategory.name;
  } else {
    // 새 세션 시작 시, 현재의 이름과 색상을 스냅샷으로 저장
    todayLog.sessions.push({
      catId: activeCategory.id,
      color: activeCategory.color,
      name: activeCategory.name, // [중요] 이름 저장 (삭제되어도 기록 남음)
      start: currentTime,
      end: currentTime
    });
  }

  // 총 시간 업데이트
  if (!todayLog.totals[activeCategory.id]) {
    todayLog.totals[activeCategory.id] = 0;
  }
  todayLog.totals[activeCategory.id] += 1;

  drawDailyRing();
  updateTodayCalendarBlock(); // 실시간 캘린더 색상 업데이트 (즉시 반영)
}

function renderTime() {
  const m = Math.floor(remainingSeconds / 60);
  const s = remainingSeconds % 60;
  timerEl.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

mainActionBtn.onclick = () => {
  if (timerInterval) {
    stopTimerLogic();
  } else {
    startTimerLogic();
  }
};

resetBtn.onclick = () => {
  stopTimerLogic(); 
  remainingSeconds = totalSeconds;
  canvas.classList.remove("running");
  drawRing();
  renderTime();
};

setTimeBtn.onclick = () => {
  const minutes = Math.min(60, Math.max(1, Number(minuteInput.value)));
  totalSeconds = minutes * 60;
  remainingSeconds = totalSeconds;
  drawRing();
  renderTime();
};

/* ===============================
   Main Ring Visuals
=============================== */
function drawRing() {
  const dpr = window.devicePixelRatio || 1;
  const size = 260;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + "px";
  canvas.style.height = size + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const maxFullSeconds = 3600; 
  const progress = remainingSeconds / maxFullSeconds;
  const center = size / 2;
  const radius = 90;
  const lineWidth = 38; 
  const color = activeCategory ? activeCategory.color : "#FF2D55";

  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color; 
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round"; 
  ctx.globalAlpha = 0.15; 
  ctx.shadowBlur = 0; 
  ctx.stroke();

  if (progress > 0) {
    ctx.beginPath();
    ctx.arc(
      center, center, radius,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * progress
    );
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round"; 
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 25; 
    ctx.shadowColor = color;
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

/* ===============================
   Tracker: Daily 24h Ring & Tooltip
=============================== */
// [UX 개선] 링 위치 및 크기 정밀 조정 (글씨 가림 해결)
const RING_WIDTH = 40; 
// 링을 바깥쪽으로 조금 밀어내고, 숫자 위치도 조정
const OUTER_R = 170;   // 기존 165 -> 170 (확장)
const INNER_R = 120;   // 기존 115 -> 120 (확장 - 중앙 텍스트와 거리 확보)

function drawDailyRing() {
  const dpr = window.devicePixelRatio || 1;
  const size = 440; 
  dailyCanvas.width = size;
  dailyCanvas.height = size;
  
  const ctx = dailyCtx;
  const center = size / 2;
  
  ctx.clearRect(0, 0, size, size);

  ctx.fillStyle = "#ffffff"; 
  ctx.font = "bold 24px -apple-system, sans-serif"; 
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // 숫자 위치: 링 바깥쪽으로 더 밀어냄 (205 -> 210)
  const numRadius = size / 2 - 10; 
  for (let i = 1; i <= 12; i++) {
    const angle = (i - 3) * (Math.PI * 2) / 12;
    const x = center + Math.cos(angle) * numRadius;
    const y = center + Math.sin(angle) * numRadius;
    ctx.fillText(i, x, y);
  }

  // 배경 링
  ctx.globalAlpha = 0.15;
  ctx.lineWidth = RING_WIDTH;
  ctx.lineCap = "round";
  
  ctx.beginPath();
  ctx.arc(center, center, OUTER_R, 0, Math.PI * 2);
  ctx.strokeStyle = "#888"; 
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(center, center, INNER_R, 0, Math.PI * 2);
  ctx.strokeStyle = "#888";
  ctx.stroke();

  ctx.globalAlpha = 1;

  todayLog.sessions.forEach(session => {
    const startDate = new Date(session.start);
    const endDate = new Date(session.end);
    drawSessionArc(ctx, startDate, endDate, INNER_R, OUTER_R, session.color, RING_WIDTH, center);
  });
}

function drawSessionArc(ctx, start, end, innerR, outerR, color, width, center) {
  const dayStart = new Date(start);
  dayStart.setHours(0,0,0,0);
  
  const startSec = (start.getTime() - dayStart.getTime()) / 1000;
  const endSec = (end.getTime() - dayStart.getTime()) / 1000;
  
  const halfDay = 43200; // 12시간 = 43200초

  const draw = (radius, s, e) => {
    if (s >= e) return;
    // 0초 = -90도(12시 방향)
    const startAngle = (s / halfDay) * (Math.PI * 2) - (Math.PI / 2);
    const endAngle = (e / halfDay) * (Math.PI * 2) - (Math.PI / 2);
    
    ctx.beginPath();
    ctx.arc(center, center, radius, startAngle, endAngle);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.shadowBlur = 12; 
    ctx.shadowColor = color;
    ctx.stroke();
    ctx.shadowBlur = 0; 
  };

  // 오전 (0 ~ 12시) : Inner Ring
  if (startSec < halfDay) {
    const segEnd = Math.min(endSec, halfDay);
    draw(innerR, startSec, segEnd);
  }

  // 오후 (12 ~ 24시) : Outer Ring
  if (endSec > halfDay) {
    const segStart = Math.max(startSec, halfDay);
    draw(outerR, segStart - halfDay, endSec - halfDay);
  }
}

// [UX 핵심 개선] 감도 및 인식 범위 로직 동기화
dailyCanvas.addEventListener("mousemove", (e) => {
  const rect = dailyCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const scaleX = dailyCanvas.width / rect.width;
  const scaleY = dailyCanvas.height / rect.height;
  
  const x = mouseX * scaleX;
  const y = mouseY * scaleY;
  const center = dailyCanvas.width / 2; // 220
  
  const dx = x - center;
  const dy = y - center;
  const dist = Math.sqrt(dx*dx + dy*dy);
  let angle = Math.atan2(dy, dx); 
  
  let chartAngle = angle + Math.PI / 2;
  if (chartAngle < 0) chartAngle += Math.PI * 2; 
  
  const halfDay = 43200;
  const secondsInRing = (chartAngle / (Math.PI * 2)) * halfDay;
  
  // [인식 로직 변경] 변경된 반지름에 맞춰 판정 범위 수정
  // Inner(120), Outer(170) -> 중간값 약 145
  let checkTime = null;
  const SPLIT_RADIUS = 145; // 내/외측 구분선
  const MIN_TOUCH_R = 80;   // 중앙 텍스트 침범 방지 (증가)
  const MAX_TOUCH_R = 215;  // 캔버스 끝

  if (dist > MIN_TOUCH_R && dist <= SPLIT_RADIUS) {
    // 1. 안쪽 링 (오전)
    checkTime = secondsInRing;
  } else if (dist > SPLIT_RADIUS && dist < MAX_TOUCH_R) {
    // 2. 바깥쪽 링 (오후)
    checkTime = secondsInRing + halfDay;
  }

  if (checkTime !== null) {
    const hoveredSession = todayLog.sessions.find(s => {
      const dayStart = new Date(s.start);
      dayStart.setHours(0,0,0,0);
      const sSec = (s.start - dayStart.getTime()) / 1000;
      const eSec = (s.end - dayStart.getTime()) / 1000;
      return checkTime >= sSec && checkTime <= eSec;
    });

    if (hoveredSession) {
      // 해당 부분에서만 소요된 시간 계산 (세션 길이)
      const durationMin = Math.max(1, Math.round((hoveredSession.end - hoveredSession.start)/1000/60));
      
      // 카테고리 이름: 저장된 이름 우선 (삭제 대비)
      let catName = hoveredSession.name;
      if (!catName) {
         const cat = categories.find(c => c.id === hoveredSession.catId);
         catName = cat ? cat.name : "삭제된 카테고리";
      }
      
      showTooltip(`${catName}\n⏱ ${durationMin}분`, e.clientX, e.clientY);
      dailyCanvas.style.cursor = "pointer";
    } else {
      hideTooltip();
      dailyCanvas.style.cursor = "crosshair";
    }
  } else {
    hideTooltip();
    dailyCanvas.style.cursor = "default";
  }
});

dailyCanvas.addEventListener("mouseleave", () => {
  hideTooltip();
});


function updateDateDisplay() {
  const now = new Date();
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  todayDateEl.textContent = now.toLocaleDateString('ko-KR', options);
}

/* ===============================
   Tracker: Monthly Calendar & Tooltip
=============================== */
function renderCalendar(baseDate) {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth(); 

  calTitle.textContent = `${year}. ${String(month + 1).padStart(2, '0')}`;
  calGrid.innerHTML = "";

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  
  let startDay = firstDay.getDay() - 1; 
  if (startDay === -1) startDay = 6; 

  for (let i = 0; i < startDay; i++) {
    const empty = document.createElement("div");
    empty.className = "day-block empty";
    calGrid.appendChild(empty);
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const block = document.createElement("div");
    block.className = "day-block";
    block.dataset.date = `${year}.${String(month+1).padStart(2,'0')}.${String(d).padStart(2,'0')}`;
    
    // 기본 툴팁
    block.dataset.tooltip = `${block.dataset.date}`; 

    const today = new Date();
    if (year === today.getFullYear() && month === today.getMonth() && d === today.getDate()) {
      block.classList.add("today");
      block.id = "todayBlock"; 
    }

    // 마우스 이벤트 (툴팁)
    block.addEventListener("mousemove", (e) => {
      const tip = block.dataset.tooltip || block.dataset.date;
      showTooltip(tip, e.clientX, e.clientY);
    });
    block.addEventListener("mouseleave", () => {
      hideTooltip();
    });

    // 비동기 데이터 로드 및 적용
    loadAndApplyDailyData(year, month, d, block);
    calGrid.appendChild(block);
  }
}

async function loadAndApplyDailyData(year, month, day, blockElement) {
  if (!currentUser) return;
  
  const dateKey = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const todayKey = getTodayKey();
  
  let data = null;

  // [중요] 오늘 날짜면 DB대신 메모리의 최신 todayLog 사용 (실시간 반영 위함)
  if (dateKey === todayKey) {
    data = todayLog;
  } else {
    try {
      const docRef = doc(db, "users", currentUser.uid, "logs", dateKey);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        data = docSnap.data();
      }
    } catch (e) {
      // 에러 무시
    }
  }

  if (data && data.totals && Object.keys(data.totals).length > 0) {
    // 가장 오래한 카테고리 찾기
    let maxSec = -1;
    let maxCatId = null;
    let totalDaySec = 0; // 하루 총 집중 시간 (필요시 사용)

    for (const [catId, sec] of Object.entries(data.totals)) {
      if (sec > maxSec) {
        maxSec = sec;
        maxCatId = catId;
      }
      totalDaySec += sec; // 전체 시간 합산
    }

    if (maxCatId) {
      // 1. 현재 카테고리 목록에서 검색
      let catName = "";
      let catColor = "";
      
      const liveCat = categories.find(c => c.id === maxCatId);
      
      if (liveCat) {
        catName = liveCat.name;
        catColor = liveCat.color;
      } else {
        // 2. 목록에 없으면(삭제됨), 로그의 세션 기록에서 정보 추출 (복원)
        if (data.sessions) {
          const session = data.sessions.find(s => s.catId === maxCatId);
          if (session) {
            catColor = session.color || "#666"; // 색상 복원
            catName = session.name || "삭제된 카테고리"; // 이름 복원
          }
        }
      }
      if(!catName) catName = "알 수 없음";

      // 색상 적용
      if (catColor) {
        blockElement.style.background = catColor;
      }

      // [요청 사항 해결] 툴팁 정보: 날짜 + 총 해당 카테고리 소모 시간 + 해당 카테고리 이름
      // *주의: 해당 카테고리의 '총 시간'을 표시합니다.
      
      const mainHours = Math.floor(maxSec / 3600);
      const mainMinutes = Math.floor((maxSec % 3600) / 60);
      
      // 포맷:
      // 2026.01.30
      // 10시간 20분
      // 공부
      
      let timeStr = "";
      if (mainHours > 0) timeStr += `${mainHours}시간 `;
      timeStr += `${mainMinutes}분`;

      blockElement.dataset.tooltip = 
        `${blockElement.dataset.date}\n` +
        `⏱ ${timeStr}\n` +
        `${catName}`;
    }
  } else {
      // 데이터가 없는 날
      blockElement.dataset.tooltip = `${blockElement.dataset.date}\n기록 없음`;
      blockElement.style.background = "#3a3a3c"; // 기본색 복원
  }
}

function updateTodayCalendarBlock() {
  const block = document.getElementById("todayBlock");
  // 오늘 날짜 블록이 있으면 강제로 다시 계산하여 색상/툴팁 갱신
  if (block) {
    const now = new Date();
    loadAndApplyDailyData(now.getFullYear(), now.getMonth(), now.getDate(), block);
  }
}

prevMonthBtn.onclick = () => {
  currentCalDate.setMonth(currentCalDate.getMonth() - 1);
  renderCalendar(currentCalDate);
};
nextMonthBtn.onclick = () => {
  currentCalDate.setMonth(currentCalDate.getMonth() + 1);
  renderCalendar(currentCalDate);
};

/* ===============================
   Auth & Data Sync
=============================== */
function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}

async function saveTodayLog() {
  if (!currentUser) return;
  const dateKey = getTodayKey();
  try {
    await setDoc(doc(db, "users", currentUser.uid, "logs", dateKey), todayLog, { merge: true });
  } catch (e) {
    console.error("로그 저장 실패:", e);
  }
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    authBtn.textContent = "로그아웃";
    userProfile.src = user.photoURL;
    userProfile.classList.remove("hidden");
    userName.textContent = user.displayName;
    userName.classList.remove("hidden");

    try {
      const catRef = doc(db, "users", user.uid, "settings", "categories");
      const catSnap = await getDoc(catRef);
      if (catSnap.exists()) {
        categories = catSnap.data().list || [];
        const savedActive = categories.find(c => c.id === activeCategory.id);
        if(savedActive) activeCategory = savedActive;
        else if(categories.length > 0) activeCategory = categories[0];
      } else {
        saveUserCategories();
      }
    } catch(e) {
      console.error("카테고리 로드 에러:", e);
    }
    
    renderCategories();
    drawRing();

    const dateKey = getTodayKey();
    const docRef = doc(db, "users", user.uid, "logs", dateKey);
    
    try {
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const dbData = docSnap.data();
        const combinedSessions = [...(dbData.sessions || []), ...(todayLog.sessions || [])];
        
        const combinedTotals = { ...(dbData.totals || {}) };
        const localTotals = todayLog.totals || {};
        for (const [id, count] of Object.entries(localTotals)) {
          combinedTotals[id] = (combinedTotals[id] || 0) + count;
        }
        
        todayLog = { sessions: combinedSessions, totals: combinedTotals };
        saveTodayLog();
      } else {
        saveTodayLog();
      }
    } catch(e) {
      console.error("로그 로드 에러:", e);
    }

    drawDailyRing();
    renderCalendar(currentCalDate);

  } else {
    currentUser = null;
    todayLog = { sessions: [], totals: {} };
    categories = []; 
    activeCategory = { ...defaultCategory };
    
    authBtn.textContent = "Google 로그인";
    userProfile.classList.add("hidden");
    userName.classList.add("hidden");
    
    renderCategories();
    drawRing();
    drawDailyRing(); 
    renderCalendar(currentCalDate); 
  }
});

authBtn.onclick = async () => {
  const user = auth.currentUser;
  if (user) {
    await saveTodayLog(); 
    await signOut(auth);
  } else {
    await signInWithPopup(auth, googleProvider);
  }
};

/* ===============================
   Initialization
=============================== */
updateDateDisplay();
renderCategories();
drawRing();
renderTime();
drawDailyRing();
renderCalendar(currentCalDate);