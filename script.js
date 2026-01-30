/* ===============================
   Firebase & Firestore Imports
=============================== */
import { auth, googleProvider, db } from "./firebase.js";
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
let todayLog = { sessions: [], totals: {} }; // 오늘 하루 데이터
// totals 구조: { [categoryId]: seconds, ... }

// Calendar State
let currentCalDate = new Date(); // 달력 표시 기준 날짜

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
    btn.style.textShadow = "0 1px 2px rgba(0,0,0,0.5)";
    
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
function openSettings(cat, parentItem) {
  if (activeSettingsPanel) {
    activeSettingsPanel.remove();
    activeSettingsPanel = null;
  }

  const panel = document.createElement("div");
  panel.className = "settings-panel";

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

    if (activeCategory.id === cat.id) {
      activeCategory = cat;
      currentCategory.textContent = cat.name;
      drawRing();
    }
    
    renderCategories(); 
    panel.remove();
    activeSettingsPanel = null;
  };

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(confirmBtn);

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "settings-btn btn-delete";
  deleteBtn.textContent = "카테고리 삭제";
  deleteBtn.onclick = () => {
    if(confirm("정말 이 카테고리를 삭제하시겠습니까?")) {
      categories = categories.filter(c => c.id !== cat.id);
      if (activeCategory.id === cat.id) {
        activeCategory = { ...defaultCategory };
        currentCategory.textContent = activeCategory.name;
        drawRing();
      }
      renderCategories();
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

  parentItem.appendChild(panel);
  activeSettingsPanel = panel;
}

function toHex(colorStr) {
  if (/^#[0-9a-f]{6}$/i.test(colorStr)) return colorStr;
  const ctxCanvas = document.createElement('canvas').getContext('2d');
  ctxCanvas.fillStyle = colorStr;
  return ctxCanvas.fillStyle; 
}

document.addEventListener("click", (e) => {
  if (activeSettingsPanel && !e.target.closest(".category-item")) {
    activeSettingsPanel.remove();
    activeSettingsPanel = null;
  }
});

/* ===============================
   Timer Logic & Tracking
=============================== */
function updateTimer() {
  remainingSeconds--;

  // ✅ 실시간 트래킹 로직 추가
  trackCurrentSecond();

  if (remainingSeconds <= 0) {
    clearInterval(timerInterval);
    timerInterval = null;
    remainingSeconds = 0;
    canvas.classList.remove("running");
    
    // 타이머 종료 시 파이어베이스 저장
    saveTodayLog();
  }
  
  drawRing();
  renderTime();
}

// 1초마다 실행되어 현재 상태를 로그에 기록
function trackCurrentSecond() {
  if (!activeCategory) return;
  const now = new Date();
  
  // 1. Session 기록 (AM/PM 링을 그리기 위함)
  // 가장 최근 세션이 같은 카테고리이고, 시간 차이가 1.5초 이내라면 이어 붙임
  const lastSession = todayLog.sessions[todayLog.sessions.length - 1];
  const currentTime = now.getTime();
  
  if (lastSession && 
      lastSession.catId === activeCategory.id && 
      (currentTime - lastSession.end) < 1500) {
    lastSession.end = currentTime; // 시간 연장
  } else {
    // 새 세션 시작
    todayLog.sessions.push({
      catId: activeCategory.id,
      color: activeCategory.color,
      start: currentTime,
      end: currentTime
    });
  }

  // 2. Totals 기록 (캘린더 도미넌트 컬러를 위함)
  if (!todayLog.totals[activeCategory.id]) {
    todayLog.totals[activeCategory.id] = 0;
  }
  todayLog.totals[activeCategory.id] += 1;

  // 3. UI 실시간 업데이트
  drawDailyRing();
  
  // 오늘 날짜의 캘린더 블록 색상 업데이트 (실시간)
  updateTodayCalendarBlock();
}

function renderTime() {
  const m = Math.floor(remainingSeconds / 60);
  const s = remainingSeconds % 60;
  timerEl.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

document.getElementById("startBtn").onclick = () => {
  if (!timerInterval && remainingSeconds > 0) {
    timerInterval = setInterval(updateTimer, 1000);
    canvas.classList.add("running");
    drawRing();
  }
};

document.getElementById("stopBtn").onclick = () => {
  clearInterval(timerInterval);
  timerInterval = null;
  canvas.classList.remove("running");
  drawRing();
  saveTodayLog(); // 정지 시 저장
};

document.getElementById("resetBtn").onclick = () => {
  clearInterval(timerInterval);
  timerInterval = null;
  remainingSeconds = totalSeconds;
  canvas.classList.remove("running");
  drawRing();
  renderTime();
  saveTodayLog();
};

document.getElementById("setTimeBtn").onclick = () => {
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
  const radius = 95;
  const lineWidth = 18;
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
    ctx.shadowBlur = 20; 
    ctx.shadowColor = color;
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

/* ===============================
   Tracker: Daily 24h Ring
=============================== */
function drawDailyRing() {
  const dpr = window.devicePixelRatio || 1;
  const size = 440; // canvas pixel size (CSS: 220px)
  dailyCanvas.width = size;
  dailyCanvas.height = size;
  // CSS size is controlled via style, keep canvas internal res high for sharpness
  
  const ctx = dailyCtx;
  const center = size / 2;
  
  // Clear
  ctx.clearRect(0, 0, size, size);

  // --- 1. Draw Clock Numbers ---
  ctx.fillStyle = "#666";
  ctx.font = "bold 16px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const numRadius = size / 2 - 20; // 숫자 배치 반지름
  for (let i = 1; i <= 12; i++) {
    // 12시 = -90도, 3시 = 0도
    const angle = (i - 3) * (Math.PI * 2) / 12;
    const x = center + Math.cos(angle) * numRadius;
    const y = center + Math.sin(angle) * numRadius;
    ctx.fillText(i, x, y);
  }

  // --- 2. Draw Sessions ---
  // Inner Ring (AM): 00:00 - 11:59 -> Radius ~80 (css scale) -> ~160 (canvas scale)
  // Outer Ring (PM): 12:00 - 23:59 -> Radius ~60 (css scale) -> ~120 (canvas scale)
  
  // Rings Base (Dimmed)
  const outerR = 150; 
  const innerR = 110; 
  const ringWidth = 16;

  // Background Rings
  ctx.globalAlpha = 0.1;
  ctx.lineWidth = ringWidth;
  ctx.lineCap = "round";
  
  // Outer (PM)
  ctx.beginPath();
  ctx.arc(center, center, outerR, 0, Math.PI * 2);
  ctx.strokeStyle = "#444";
  ctx.stroke();

  // Inner (AM)
  ctx.beginPath();
  ctx.arc(center, center, innerR, 0, Math.PI * 2);
  ctx.strokeStyle = "#444";
  ctx.stroke();

  ctx.globalAlpha = 1;

  // Draw Actual Sessions
  todayLog.sessions.forEach(session => {
    const startDate = new Date(session.start);
    const endDate = new Date(session.end);

    // 시작/종료 시분초 -> 0~12 값으로 변환
    // AM/PM 구분
    drawSessionArc(ctx, startDate, endDate, innerR, outerR, session.color, ringWidth, center);
  });
}

function drawSessionArc(ctx, start, end, innerR, outerR, color, width, center) {
  // 하루 시작 00:00:00
  const dayStart = new Date(start);
  dayStart.setHours(0,0,0,0);
  
  const startSec = (start.getTime() - dayStart.getTime()) / 1000;
  const endSec = (end.getTime() - dayStart.getTime()) / 1000;
  
  // 12시간 = 43200초
  const halfDay = 43200;

  // Helper to draw arc
  const draw = (radius, s, e) => {
    if (s >= e) return;
    // 0초 = -90도 (12시 방향)
    const startAngle = (s / halfDay) * (Math.PI * 2) - (Math.PI / 2);
    const endAngle = (e / halfDay) * (Math.PI * 2) - (Math.PI / 2);
    
    ctx.beginPath();
    ctx.arc(center, center, radius, startAngle, endAngle);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.shadowBlur = 10;
    ctx.shadowColor = color;
    ctx.stroke();
    ctx.shadowBlur = 0; // reset
  };

  // AM 체크 (0 ~ 43200)
  if (startSec < halfDay) {
    // AM 구간
    const segEnd = Math.min(endSec, halfDay);
    draw(innerR, startSec, segEnd);
  }

  // PM 체크 (43200 ~ 86400)
  if (endSec > halfDay) {
    // PM 구간
    const segStart = Math.max(startSec, halfDay);
    // 12시간을 빼서 0~12 스케일로 맞춤
    draw(outerR, segStart - halfDay, endSec - halfDay);
  }
}

// 오늘 날짜 표시
function updateDateDisplay() {
  const now = new Date();
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  todayDateEl.textContent = now.toLocaleDateString('ko-KR', options);
}

/* ===============================
   Tracker: Monthly Calendar
=============================== */
function renderCalendar(baseDate) {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth(); // 0-indexed

  calTitle.textContent = `${year}. ${String(month + 1).padStart(2, '0')}`;
  calGrid.innerHTML = "";

  // 이 달의 1일
  const firstDay = new Date(year, month, 1);
  // 이 달의 마지막 날
  const lastDay = new Date(year, month + 1, 0);
  
  // 요일 보정 (월요일 시작)
  // getDay(): 일0, 월1, 화2 ... 토6
  // 우리 목표: 월0, 화1 ... 일6
  let startDay = firstDay.getDay() - 1; 
  if (startDay === -1) startDay = 6; // 일요일이면 6으로

  // 빈 블록 채우기
  for (let i = 0; i < startDay; i++) {
    const empty = document.createElement("div");
    empty.className = "day-block empty";
    calGrid.appendChild(empty);
  }

  // 날짜 채우기
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const block = document.createElement("div");
    block.className = "day-block";
    
    // 오늘인지 체크
    const today = new Date();
    if (year === today.getFullYear() && month === today.getMonth() && d === today.getDate()) {
      block.classList.add("today");
      block.id = "todayBlock"; // 실시간 업데이트용 ID
    }

    // 날짜 텍스트 (작게 표시 옵션, 여기선 색상 위주라 생략하거나 hover로)
    block.title = `${year}-${month+1}-${d}`;

    // Firestore에서 데이터 로드하여 색상 칠하기
    // (여기서는 비동기로 로드되므로, 일단 그려놓고 데이터 오면 업데이트)
    loadDominantColor(year, month, d, block);

    calGrid.appendChild(block);
  }
}

async function loadDominantColor(year, month, day, blockElement) {
  if (!currentUser) return;
  
  const dateKey = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  
  // 만약 오늘이라면 메모리에 있는 todayLog 사용
  const todayKey = getTodayKey();
  if (dateKey === todayKey) {
    applyDominantColor(todayLog.totals, blockElement);
    return;
  }

  // 과거 데이터는 Firestore에서 가져오기
  // (최적화를 위해선 월별 데이터를 한 번에 가져오는 게 좋으나, 로직 유지 위해 개별 조회)
  try {
    const docRef = doc(db, "users", currentUser.uid, "logs", dateKey);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.totals) {
        applyDominantColor(data.totals, blockElement);
      }
    }
  } catch (e) {
    console.error("Error loading date color:", e);
  }
}

function applyDominantColor(totals, element) {
  if (!totals || Object.keys(totals).length === 0) return;
  
  // 가장 큰 값 찾기
  let maxSec = -1;
  let maxCatId = null;
  
  for (const [catId, sec] of Object.entries(totals)) {
    if (sec > maxSec) {
      maxSec = sec;
      maxCatId = catId;
    }
  }

  // 해당 카테고리 색상 찾기
  if (maxCatId) {
    // 1. 현재 카테고리 목록에서 찾기
    const cat = categories.find(c => c.id === maxCatId);
    if (cat) {
      element.style.background = cat.color;
    } else {
      // 2. 목록에 없으면(삭제됨) todayLog의 session history에서 색상 추적하거나 기본값
      // 여기선 간단히 세션 로그에서 색상 역추적
      // (복잡해지므로, 삭제된 카테고리는 회색 처리하거나 유지)
      // * 개선: Firestore에 totals 저장할 때 colorCode도 같이 저장하면 좋음.
      // 현재 로직상 카테고리 id로 매칭.
      // 임시로 찾을 수 없으면 유지.
    }
  }
}

function updateTodayCalendarBlock() {
  const block = document.getElementById("todayBlock");
  if (block) {
    applyDominantColor(todayLog.totals, block);
  }
}

// 캘린더 네비게이션
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
    console.log("Log Saved");
  } catch (e) {
    console.error("Save Error", e);
  }
}

// Auth State Change
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    authBtn.textContent = "로그아웃";
    userProfile.src = user.photoURL;
    userProfile.classList.remove("hidden");
    userName.textContent = user.displayName;
    userName.classList.remove("hidden");

    // 오늘 데이터 불러오기
    const dateKey = getTodayKey();
    const docRef = doc(db, "users", user.uid, "logs", dateKey);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      // 병합
      todayLog.sessions = [...(data.sessions || []), ...todayLog.sessions];
      // totals 병합은 복잡하므로, 일단 DB값 우선 + 현재 메모리 값 더하기
      // (간단히 DB 로드 값으로 덮어씀. 앱 새로고침 시 초기화되므로)
      todayLog = data; 
      if (!todayLog.sessions) todayLog.sessions = [];
      if (!todayLog.totals) todayLog.totals = {};
    }

    // UI 갱신
    drawDailyRing();
    renderCalendar(currentCalDate);

  } else {
    currentUser = null;
    todayLog = { sessions: [], totals: {} };
    authBtn.textContent = "Google 로그인";
    userProfile.classList.add("hidden");
    userName.classList.add("hidden");
    
    // UI 초기화
    drawDailyRing(); // 빈 링
    renderCalendar(currentCalDate); // 빈 캘린더 (색상 없음)
  }
});

authBtn.onclick = async () => {
  const user = auth.currentUser;
  if (user) {
    await saveTodayLog(); // 로그아웃 전 저장
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
drawDailyRing(); // 초기 빈 시계
renderCalendar(currentCalDate); // 초기 달력