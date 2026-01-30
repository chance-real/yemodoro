/* ===============================
   Firebase & Firestore Imports
=============================== */
import { auth, googleProvider, db } from "./firebase.js";
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ===============================
   Sound Effects (New)
=============================== */
// 오디오 파일 로드 (파일명을 정확히 매칭)
const clickSound = new Audio('computer-mouse-click-351398.mp3');
const alarmSound = new Audio('bellding-254774.mp3');

// 사운드 재생 함수 (반응속도 최적화)
function playClickSound() {
  // 연속 클릭 시 소리가 끊기지 않도록 복제해서 재생
  const sound = clickSound.cloneNode();
  sound.volume = 0.6; // 너무 시끄럽지 않게 볼륨 조절
  sound.play().catch(() => {}); // 자동재생 차단 예외처리
}

function playAlarmSound() {
  alarmSound.currentTime = 0;
  alarmSound.play().catch(e => console.log("알림음 재생 실패:", e));
}

// ✅ [핵심] 글로벌 클릭 리스너: "클릭 가능한 요소"만 감지하여 소리 재생
document.addEventListener('click', (e) => {
  // 클릭된 요소가 인터랙티브한 요소인지 확인 (버튼, 인풋, 설정아이콘, 날짜블록 등)
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
const mainActionBtn = document.getElementById("mainActionBtn"); // 시작/정지 통합 버튼
const resetBtn = document.getElementById("resetBtn");
const setTimeBtn = document.getElementById("setTimeBtn");

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
    console.error("카테고리 저장 실패 (권한을 확인하세요):", e);
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
    if(confirm("정말 이 카테고리를 삭제하시겠습니까?")) {
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
    // ✅ 타이머 종료 시 알림음 재생
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
  }
}

function trackCurrentSecond() {
  if (!activeCategory) return;
  const now = new Date();
  
  const lastSession = todayLog.sessions[todayLog.sessions.length - 1];
  const currentTime = now.getTime();
  
  if (lastSession && 
      lastSession.catId === activeCategory.id && 
      (currentTime - lastSession.end) < 1500) {
    lastSession.end = currentTime; 
  } else {
    todayLog.sessions.push({
      catId: activeCategory.id,
      color: activeCategory.color,
      start: currentTime,
      end: currentTime
    });
  }

  if (!todayLog.totals[activeCategory.id]) {
    todayLog.totals[activeCategory.id] = 0;
  }
  todayLog.totals[activeCategory.id] += 1;

  drawDailyRing();
  updateTodayCalendarBlock();
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
   Tracker: Daily 24h Ring
=============================== */
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

  const numRadius = size / 2 - 15; 
  for (let i = 1; i <= 12; i++) {
    const angle = (i - 3) * (Math.PI * 2) / 12;
    const x = center + Math.cos(angle) * numRadius;
    const y = center + Math.sin(angle) * numRadius;
    ctx.fillText(i, x, y);
  }

  const outerR = 175; 
  const innerR = 135; 
  const ringWidth = 22;

  ctx.globalAlpha = 0.15;
  ctx.lineWidth = ringWidth;
  ctx.lineCap = "round";
  
  ctx.beginPath();
  ctx.arc(center, center, outerR, 0, Math.PI * 2);
  ctx.strokeStyle = "#888"; 
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(center, center, innerR, 0, Math.PI * 2);
  ctx.strokeStyle = "#888";
  ctx.stroke();

  ctx.globalAlpha = 1;

  todayLog.sessions.forEach(session => {
    const startDate = new Date(session.start);
    const endDate = new Date(session.end);
    drawSessionArc(ctx, startDate, endDate, innerR, outerR, session.color, ringWidth, center);
  });
}

function drawSessionArc(ctx, start, end, innerR, outerR, color, width, center) {
  const dayStart = new Date(start);
  dayStart.setHours(0,0,0,0);
  
  const startSec = (start.getTime() - dayStart.getTime()) / 1000;
  const endSec = (end.getTime() - dayStart.getTime()) / 1000;
  
  const halfDay = 43200;

  const draw = (radius, s, e) => {
    if (s >= e) return;
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

  if (startSec < halfDay) {
    const segEnd = Math.min(endSec, halfDay);
    draw(innerR, startSec, segEnd);
  }

  if (endSec > halfDay) {
    const segStart = Math.max(startSec, halfDay);
    draw(outerR, segStart - halfDay, endSec - halfDay);
  }
}

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
    
    const today = new Date();
    if (year === today.getFullYear() && month === today.getMonth() && d === today.getDate()) {
      block.classList.add("today");
      block.id = "todayBlock"; 
    }

    block.title = `${year}-${month+1}-${d}`;
    loadDominantColor(year, month, d, block);
    calGrid.appendChild(block);
  }
}

async function loadDominantColor(year, month, day, blockElement) {
  if (!currentUser) return;
  
  const dateKey = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const todayKey = getTodayKey();
  
  if (dateKey === todayKey) {
    applyDominantColor(todayLog.totals, blockElement);
    return;
  }

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
    // console.error("Error loading date color:", e); // 조용히 실패
  }
}

function applyDominantColor(totals, element) {
  if (!totals || Object.keys(totals).length === 0) return;
  
  let maxSec = -1;
  let maxCatId = null;
  
  for (const [catId, sec] of Object.entries(totals)) {
    if (sec > maxSec) {
      maxSec = sec;
      maxCatId = catId;
    }
  }

  if (maxCatId) {
    const cat = categories.find(c => c.id === maxCatId);
    if (cat) {
      element.style.background = cat.color;
    }
  }
}

function updateTodayCalendarBlock() {
  const block = document.getElementById("todayBlock");
  if (block) {
    applyDominantColor(todayLog.totals, block);
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
    // console.log("Log Saved");
  } catch (e) {
    console.error("로그 저장 실패 (권한을 확인하세요):", e);
    // alert("데이터 저장이 실패했습니다. Firebase Console에서 규칙(Rules)을 확인해주세요.");
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