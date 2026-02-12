/* ===============================
   Firebase & Firestore Imports
=============================== */
import { auth, googleProvider, db } from "./firebase.js";
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ===============================
   Sound Effects
=============================== */
const clickSound = new Audio('computer-mouse-click-351398.mp3');
const alarmSound = new Audio('bellding-254774.mp3');

function playClickSound() {
  const sound = clickSound.cloneNode();
  sound.volume = 0.6;
  sound.play().catch(() => {});
}

function playAlarmSound() {
  alarmSound.currentTime = 0;
  alarmSound.play().catch(e => console.log("알림음 재생 실패:", e));
}

document.addEventListener('click', (e) => {
  // [수정] 설정 아이콘(.category-settings) 클릭 시 소리 추가
  const target = e.target.closest('button, input, .category-item, .category-settings, .day-block, .settings-btn, .menu-item, .record-btn-float, .focus-mode-btn, .mode-toggle-btn');
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

// Controls
const mainFocusBtn = document.getElementById("mainFocusBtn");
const recordFocusBtn = document.getElementById("recordFocusBtn");
const exitFocusBtn = document.getElementById("exitFocusBtn");
const focusNoteDisplay = document.getElementById("focusNoteDisplay"); // 노트 표시용

// Clock Controls
const toggleViewBtn = document.getElementById("toggleViewBtn");
const timerModeContainer = document.getElementById("timerModeContainer");
const clockModeContainer = document.getElementById("clockModeContainer");
const realTimeClock = document.getElementById("realTimeClock");
const clockDate = document.getElementById("clockDate");
const clockFocusBtn = document.getElementById("clockFocusBtn");

const mainActionBtn = document.getElementById("mainActionBtn"); 
const resetBtn = document.getElementById("resetBtn");
const setTimeBtn = document.getElementById("setTimeBtn");

// Tooltip
const tooltipEl = document.getElementById("tooltip");

// View Switcher & Record Page
const timerView = document.getElementById("timerView");
const recordView = document.getElementById("recordView");
const openRecordBtn = document.getElementById("openRecordBtn");
const closeRecordBtn = document.getElementById("closeRecordBtn");
const recordDateTitle = document.getElementById("recordDateTitle");
const timeGrid = document.getElementById("timeGrid");
const editor = document.getElementById("editor");
const slashMenu = document.getElementById("slashMenu");

// Delete & Add Mode Controls
const deleteModeBtn = document.getElementById("deleteModeBtn");
const addModeBtn = document.getElementById("addModeBtn");
const editControls = document.getElementById("editControls");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
const gridTitleText = document.getElementById("gridTitleText"); 

const deleteControlsWrapper = document.querySelector(".delete-controls-wrapper");

/* ===============================
   Helper Functions
=============================== */
function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}

// [수정] 10분 단위 데이터 정제 (렌더링 시 보조, 핵심 로직은 renderTimeGrid에 위임)
// DB 저장용 데이터는 세션 원본을 유지하고, 렌더링 할 때만 10분 그리드 로직을 적용합니다.
function sanitizeLogs(logData) {
  // DB 저장시에는 raw 데이터를 유지하되, 지나치게 짧은(예: 1초 미만) 노이즈만 제거
  if (!logData || !logData.sessions) return logData;
  const validSessions = logData.sessions.filter(s => (s.end - s.start) > 1000);
  return { ...logData, sessions: validSessions };
}

async function saveTodayLog() {
  if (!currentUser) return;
  
  if (selectedDateKey === getTodayKey()) {
    todayLog.memo = editor.innerHTML;
  }
  
  // 저장 시 데이터 정제
  todayLog = sanitizeLogs(todayLog);
  viewLog = todayLog;

  try {
    await setDoc(doc(db, "users", currentUser.uid, "logs", getTodayKey()), todayLog);
    drawDailyRing(todayLog);
    renderTimeGrid(todayLog);
    updateTodayCalendarBlock(); // 캘린더 색상 즉시 업데이트
  } catch(e) { console.error("오늘 기록 저장 실패:", e); }
}

async function loadDateLog(dateKey) {
  if (!currentUser) return { sessions: [], totals: {}, memo: "" };
  try {
    const docRef = doc(db, "users", currentUser.uid, "logs", dateKey);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return sanitizeLogs(docSnap.data());
    }
  } catch (e) { console.error(e); }
  return { sessions: [], totals: {}, memo: "" };
}

function loadMemoData(dateKey) {
  if (viewLog && viewLog.memo) {
    editor.innerHTML = viewLog.memo;
  } else {
    editor.innerHTML = "";
  }
  const [y, m, d] = dateKey.split("-");
  recordDateTitle.textContent = `${y}. ${m}. ${d} 노트`;
}

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

// Clock State
let isClockMode = false;
let clockInterval = null;

// User & Data State
let currentUser = null;
let todayLog = { sessions: [], totals: {}, memo: "" }; 
let viewLog = { sessions: [], totals: {}, memo: "" };  

let currentCalDate = new Date(); 
let selectedDateKey = getTodayKey(); 

let wakeLock = null;

// 슬래시 메뉴 상태
let slashMenuIndex = 0;

// Delete & Add Mode Controls
let isDeleteMode = false;
let isAddMode = false;
let selectedAddCategory = null; 
let tempLogData = null; 
let undoStack = [];
let redoStack = [];

// Memo Auto-Save State
let saveTimeout = null;

/* ===============================
   Wake Lock
=============================== */
async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {});
    } catch (err) {
      console.log('Wake Lock failed, continuing execution.');
    }
  }
}

function releaseWakeLock() {
  if (wakeLock !== null) {
    wakeLock.release()
      .then(() => { wakeLock = null; })
      .catch((err) => console.error(err));
  }
}

document.addEventListener('visibilitychange', async () => {
  if (wakeLock !== null && document.visibilityState === 'visible') {
    if (timerInterval || isClockMode) { 
      await requestWakeLock();
    }
  }
});

/* ===============================
   Clock Logic (Real Time)
=============================== */
function updateClock() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  realTimeClock.textContent = `${hours}:${minutes}:${seconds}`;
  
  const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
  clockDate.textContent = now.toLocaleDateString('ko-KR', options);
}

function startClock() {
  updateClock();
  clockInterval = setInterval(updateClock, 1000);
  requestWakeLock().catch(e => console.log('WakeLock error in clock', e));
}

function stopClock() {
  if (clockInterval) {
    clearInterval(clockInterval);
    clockInterval = null;
  }
  releaseWakeLock();
}

toggleViewBtn.onclick = () => {
  timerView.classList.add("flipping");

  setTimeout(() => {
    isClockMode = !isClockMode;
    
    if (isClockMode) {
      timerModeContainer.classList.add("hidden");
      clockModeContainer.classList.remove("hidden");
      toggleViewBtn.textContent = "⏱ 타이머";
      timerView.classList.add("clock-mode-bg");
      startClock();
    } else {
      clockModeContainer.classList.add("hidden");
      timerModeContainer.classList.remove("hidden");
      toggleViewBtn.textContent = "🕒 현재 시각";
      timerView.classList.remove("clock-mode-bg");
      stopClock();
    }
  }, 300);

  setTimeout(() => {
    timerView.classList.remove("flipping");
  }, 600);
};


/* ===============================
   Tooltip Logic
=============================== */
function showTooltip(text, x, y) {
  tooltipEl.textContent = text;
  tooltipEl.classList.remove("hidden");
  moveTooltip(x, y);
}

function moveTooltip(x, y) {
  const offset = 15;
  let left = x + offset;
  let top = y + offset;
  const rect = tooltipEl.getBoundingClientRect();
  if (left + rect.width > window.innerWidth) left = x - rect.width - offset;
  if (top + rect.height > window.innerHeight) top = y - rect.height - offset;
  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
}

function hideTooltip() {
  tooltipEl.classList.add("hidden");
}

/* ===============================
   Category Logic
=============================== */
async function saveUserCategories() {
  if (!currentUser) return;
  try {
    await setDoc(doc(db, "users", currentUser.uid, "settings", "categories"), {
      list: categories
    });
  } catch(e) { console.error("카테고리 저장 실패:", e); }
}

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

  const nameLabel = document.createElement("span"); nameLabel.className = "settings-label"; nameLabel.textContent = "이름 변경";
  const nameInput = document.createElement("input"); nameInput.type = "text"; nameInput.value = cat.name; nameInput.style.marginBottom = "8px";
  
  const colorLabel = document.createElement("span"); colorLabel.className = "settings-label"; colorLabel.textContent = "색상 선택";
  const colorInput = document.createElement("input"); colorInput.type = "color"; colorInput.value = toHex(cat.color);

  const btnRow = document.createElement("div"); btnRow.className = "settings-row"; btnRow.style.marginTop = "12px";
  const cancelBtn = document.createElement("button"); cancelBtn.className = "settings-btn btn-cancel"; cancelBtn.textContent = "취소";
  cancelBtn.onclick = () => { panel.remove(); activeSettingsPanel = null; };

  const confirmBtn = document.createElement("button"); confirmBtn.className = "settings-btn btn-confirm"; confirmBtn.textContent = "확인";
  
  const confirmAction = async () => {
    playClickSound();

    cat.name = nameInput.value || cat.name;
    cat.color = colorInput.value;
    
    // 로그 업데이트
    if (todayLog && todayLog.sessions) {
        todayLog.sessions.forEach(session => {
            if (session.catId === cat.id) {
                session.color = cat.color;
                session.name = cat.name;
            }
        });
    }

    await saveUserCategories();
    if(currentUser) await saveTodayLog(); 

    if (activeCategory.id === cat.id) {
      activeCategory = cat;
      currentCategory.textContent = cat.name;
      drawRing();
    }
    renderCategories();
    if (selectedDateKey === getTodayKey()) {
      viewLog = todayLog;
      drawDailyRing(viewLog);
      renderTimeGrid(viewLog);
    }
    updateTodayCalendarBlock();
    
    panel.remove();
    activeSettingsPanel = null;
  };

  confirmBtn.onclick = confirmAction;

  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault(); 
        e.stopPropagation(); 
        confirmAction(); 
    }
  });

  const deleteBtn = document.createElement("button"); deleteBtn.className = "settings-btn btn-delete"; deleteBtn.textContent = "카테고리 삭제";
  deleteBtn.onclick = async () => {
    if(confirm("정말 이 카테고리를 삭제하시겠습니까?\n(과거 기록은 유지됩니다)")) {
      categories = categories.filter(c => c.id !== cat.id);
      if (activeCategory.id === cat.id) {
        activeCategory = { ...defaultCategory };
        currentCategory.textContent = activeCategory.name;
        drawRing();
      }
      renderCategories();
      await saveUserCategories();
      panel.remove();
      activeSettingsPanel = null;
    }
  };

  btnRow.append(cancelBtn, confirmBtn);
  panel.append(nameLabel, nameInput, colorLabel, colorInput, btnRow, deleteBtn);
  activeSettingsPanel = panel;
  
  nameInput.focus();
}

function toHex(colorStr) {
  if (/^#[0-9a-f]{6}$/i.test(colorStr)) return colorStr;
  const ctxCanvas = document.createElement('canvas').getContext('2d');
  ctxCanvas.fillStyle = colorStr;
  return ctxCanvas.fillStyle; 
}

document.addEventListener("mousedown", (e) => {
  if (activeSettingsPanel && !activeSettingsPanel.contains(e.target) && !e.target.closest(".category-settings")) {
    activeSettingsPanel.remove();
    activeSettingsPanel = null;
  }
});

/* ===============================
   Timer Logic & Tracking
=============================== */
function updateTimer() {
  if (remainingSeconds > 0) {
    remainingSeconds--;
    trackCurrentSecond();
    drawRing();
    renderTime();
  } else {
    stopTimerLogic(); 
    remainingSeconds = 0;
    drawRing();
    renderTime();
    playAlarmSound();
  }
}

async function startTimerLogic() {
  if (timerInterval) return; 

  if (remainingSeconds > 0) {
    timerInterval = setInterval(updateTimer, 1000);
    canvas.classList.add("running");
    mainActionBtn.textContent = "정지"; 
    requestWakeLock().catch(e => console.log('WakeLock error', e));
  }
}

function stopTimerLogic() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
    canvas.classList.remove("running");
    mainActionBtn.textContent = "시작"; 
    
    saveTodayLog(); 
    releaseWakeLock();
  }
}

function trackCurrentSecond() {
  if (!activeCategory) return;
  
  if (!todayLog) todayLog = { sessions: [], totals: {}, memo: "" };
  if (!todayLog.sessions) todayLog.sessions = [];
  if (!todayLog.totals) todayLog.totals = {};

  const now = new Date();
  const currentTime = now.getTime();
  const lastSession = todayLog.sessions[todayLog.sessions.length - 1];
  
  if (lastSession && 
      lastSession.catId === activeCategory.id && 
      (currentTime - lastSession.end) < 1500) {
    lastSession.end = currentTime; 
    lastSession.color = activeCategory.color;
    lastSession.name = activeCategory.name;
  } else {
    todayLog.sessions.push({
      catId: activeCategory.id,
      color: activeCategory.color,
      name: activeCategory.name,
      start: currentTime,
      end: currentTime
    });
  }

  // 총 시간 집계 (초 단위 누적)
  if (!todayLog.totals[activeCategory.id]) {
    todayLog.totals[activeCategory.id] = 0;
  }
  todayLog.totals[activeCategory.id] += 1;

  // UI 업데이트 (현재 뷰가 오늘이라면)
  if (selectedDateKey === getTodayKey()) {
    viewLog = todayLog; 
    drawDailyRing(viewLog); 
    
    if (!recordView.classList.contains("hidden")) {
        renderTimeGrid(viewLog);
    }
  }
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
  stopTimerLogic(); 
  const minutes = Math.min(60, Math.max(1, Number(minuteInput.value)));
  totalSeconds = minutes * 60;
  remainingSeconds = totalSeconds;
  drawRing();
  renderTime();
};

function drawRing() {
  const dpr = window.devicePixelRatio || 1;
  let size = 260; 

  const isFocusMode = document.body.classList.contains("focus-mode");
  if (isFocusMode) {
      const vmin = Math.min(window.innerWidth, window.innerHeight);
      size = vmin * 0.6; 
  }

  canvas.width = size * dpr;
  canvas.height = size * dpr;

  if (!isFocusMode) {
    canvas.style.width = "260px";
    canvas.style.height = "260px";
  } else {
    canvas.style.width = "";
    canvas.style.height = "";
  }
  
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const maxFullSeconds = 3600; 
  const progress = remainingSeconds / maxFullSeconds; 
  
  const center = size / 2;
  const radius = size * 0.35; 
  const lineWidth = size * 0.12; 
  const color = activeCategory ? activeCategory.color : "#FF2D55";

  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color; 
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round"; 
  ctx.globalAlpha = 0.15; 
  ctx.stroke();

  if (progress > 0) {
    ctx.beginPath();
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + (Math.PI * 2 * progress);
    
    ctx.arc(center, center, radius, startAngle, endAngle);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round"; 
    ctx.globalAlpha = 1;
    ctx.shadowBlur = size * 0.1;
    ctx.shadowColor = color;
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

/* ===============================
   View Switching & Focus Mode
=============================== */
openRecordBtn.onclick = () => {
  timerView.classList.add("hidden");
  recordView.classList.remove("hidden");
  if (!selectedDateKey) selectedDateKey = getTodayKey();
  loadMemoData(selectedDateKey);
  renderTimeGrid(viewLog); 
};

closeRecordBtn.onclick = () => {
  if (isDeleteMode) exitDeleteMode(false);
  if (isAddMode) exitAddMode(false);
  recordView.classList.add("hidden");
  timerView.classList.remove("hidden");
  hideSlashMenu();
};

function enterFocusMode() {
  document.body.classList.add("focus-mode");
  exitFocusBtn.classList.remove("hidden");
  
  if (editor && focusNoteDisplay) {
    focusNoteDisplay.innerHTML = editor.innerHTML;
    focusNoteDisplay.classList.remove("hidden");
  }

  requestAnimationFrame(drawRing);
}

function exitFocusMode() {
  document.body.classList.remove("focus-mode");
  exitFocusBtn.classList.add("hidden");
  
  if (focusNoteDisplay) {
    focusNoteDisplay.classList.add("hidden");
  }

  requestAnimationFrame(drawRing);
}

window.addEventListener('resize', () => {
    if (document.body.classList.contains('focus-mode')) {
        drawRing();
    }
});

mainFocusBtn.onclick = enterFocusMode;
clockFocusBtn.onclick = enterFocusMode;
recordFocusBtn.onclick = enterFocusMode;
exitFocusBtn.onclick = exitFocusMode;

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.body.classList.contains("focus-mode")) {
    exitFocusMode();
  }
});

/* ===============================
   Add Mode Logic (추가 기능)
=============================== */
addModeBtn.onclick = () => {
    if (!isAddMode) {
        showCategoryPickerForAdd();
    } else {
        exitAddMode(false);
    }
};

function showCategoryPickerForAdd() {
    if (activeSettingsPanel) {
        activeSettingsPanel.remove();
        activeSettingsPanel = null;
    }

    const panel = document.createElement("div");
    panel.className = "settings-panel";
    document.body.appendChild(panel);

    const rect = addModeBtn.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    panel.style.top = `${rect.bottom + scrollTop + 10}px`;
    panel.style.left = `${rect.left}px`;

    const label = document.createElement("span");
    label.className = "settings-label";
    label.textContent = "추가할 카테고리 선택";
    panel.appendChild(label);

    if (categories.length === 0) {
        const msg = document.createElement("div");
        msg.textContent = "카테고리가 없습니다.";
        msg.style.color = "#aaa";
        msg.style.fontSize = "13px";
        panel.appendChild(msg);
    } else {
        categories.forEach(cat => {
            const btn = document.createElement("button");
            btn.className = "menu-item";
            btn.textContent = cat.name;
            btn.style.width = "100%";
            btn.style.textAlign = "left";
            btn.style.border = "none";
            btn.style.marginBottom = "4px";
            btn.onclick = () => {
                selectedAddCategory = cat;
                enterAddMode();
                panel.remove();
            };
            panel.appendChild(btn);
        });
    }

    const closeHandler = (e) => {
        if (!panel.contains(e.target) && e.target !== addModeBtn) {
            panel.remove();
            document.removeEventListener("mousedown", closeHandler);
        }
    };
    document.addEventListener("mousedown", closeHandler);
}

function enterAddMode() {
    if (isDeleteMode) exitDeleteMode(false); 
    
    isAddMode = true;
    addModeBtn.classList.add("active");
    addModeBtn.textContent = `추가: ${selectedAddCategory.name}`;
    addModeBtn.style.background = selectedAddCategory.color;
    addModeBtn.style.color = "#fff";
    
    editControls.classList.remove("hidden");
    gridTitleText.classList.add("hidden");
    
    if(deleteControlsWrapper) deleteControlsWrapper.classList.add("editing");

    tempLogData = sanitizeLogs(JSON.parse(JSON.stringify(viewLog)));
    undoStack = [JSON.stringify(tempLogData)];
    redoStack = [];
    updateUndoRedoButtons();

    timeGrid.classList.add("add-mode");
    renderTimeGrid(tempLogData);
}

function exitAddMode(saveChanges) {
    isAddMode = false;
    addModeBtn.classList.remove("active");
    addModeBtn.textContent = "추가";
    addModeBtn.style.background = "";
    addModeBtn.style.color = "";
    
    editControls.classList.add("hidden");
    timeGrid.classList.remove("add-mode");
    gridTitleText.classList.remove("hidden");
    
    if(deleteControlsWrapper) deleteControlsWrapper.classList.remove("editing");

    if (saveChanges && tempLogData) {
        viewLog = tempLogData;
        if (selectedDateKey === getTodayKey()) {
            todayLog = JSON.parse(JSON.stringify(viewLog));
        }
        saveLogToDB(selectedDateKey, viewLog);
        renderTimeGrid(viewLog);
        drawDailyRing(viewLog);
        
        // 캘린더 즉시 업데이트
        if(selectedDateKey === getTodayKey()) updateTodayCalendarBlock();
        else updateCalendarCell(selectedDateKey);
        
    } else {
        renderTimeGrid(viewLog);
    }

    tempLogData = null;
    undoStack = [];
    redoStack = [];
    selectedAddCategory = null;
}


/* ===============================
   Delete Mode Logic
=============================== */
deleteModeBtn.onclick = () => {
  if (!viewLog || !viewLog.sessions) return;
  
  if (!isDeleteMode) {
    enterDeleteMode();
  } else {
    exitDeleteMode(false); 
  }
};

function enterDeleteMode() {
  if (isAddMode) exitAddMode(false); 

  isDeleteMode = true;
  deleteModeBtn.classList.add("active");
  editControls.classList.remove("hidden");
  gridTitleText.classList.add("hidden");
  
  if(deleteControlsWrapper) deleteControlsWrapper.classList.add("editing");
  
  tempLogData = sanitizeLogs(JSON.parse(JSON.stringify(viewLog)));
  undoStack = [JSON.stringify(tempLogData)];
  redoStack = [];
  updateUndoRedoButtons();
  
  timeGrid.classList.add("delete-mode");
  renderTimeGrid(tempLogData);
}

function exitDeleteMode(saveChanges) {
  isDeleteMode = false;
  deleteModeBtn.classList.remove("active");
  editControls.classList.add("hidden");
  timeGrid.classList.remove("delete-mode");
  
  gridTitleText.classList.remove("hidden");
  
  if(deleteControlsWrapper) deleteControlsWrapper.classList.remove("editing");
  
  if (saveChanges && tempLogData) {
    viewLog = tempLogData;
    
    if (selectedDateKey === getTodayKey()) {
        todayLog = JSON.parse(JSON.stringify(viewLog));
    }

    saveLogToDB(selectedDateKey, viewLog);
    
    renderTimeGrid(viewLog);
    drawDailyRing(viewLog); 
    
    // 캘린더 즉시 업데이트
    if(selectedDateKey === getTodayKey()) updateTodayCalendarBlock();
    else updateCalendarCell(selectedDateKey);
    
  } else {
    renderTimeGrid(viewLog);
  }
  
  tempLogData = null;
  undoStack = [];
  redoStack = [];
}

// 블록 클릭 핸들러 (통합: 삭제/추가)
function handleBlockClick(startSec, endSec) {
  if ((!isDeleteMode && !isAddMode) || !tempLogData) return;
  
  const newSessions = [];
  let changed = false;

  tempLogData.sessions.forEach(session => {
    const sDate = new Date(session.start);
    const eDate = new Date(session.end);
    const sSec = sDate.getHours()*3600 + sDate.getMinutes()*60 + sDate.getSeconds();
    const eSec = eDate.getHours()*3600 + eDate.getMinutes()*60 + eDate.getSeconds();

    if (eSec <= startSec || sSec >= endSec) {
      newSessions.push(session);
      return;
    }

    changed = true;
    
    // 겹치면 잘라내기
    if (sSec < startSec) {
      newSessions.push({
        ...session,
        end: new Date(sDate.setHours(0,0,0,0) + startSec * 1000).getTime()
      });
    }
    if (eSec > endSec) {
      newSessions.push({
        ...session,
        start: new Date(sDate.setHours(0,0,0,0) + endSec * 1000).getTime()
      });
    }
  });

  if (isAddMode && selectedAddCategory) {
      const dayBase = new Date(tempLogData.sessions[0]?.start || new Date().getTime()); 
      if(selectedDateKey) {
          const [y,m,d] = selectedDateKey.split("-");
          dayBase.setFullYear(y, m-1, d);
      }
      dayBase.setHours(0,0,0,0);
      
      const newStart = dayBase.getTime() + startSec * 1000;
      const newEnd = dayBase.getTime() + endSec * 1000;

      newSessions.push({
          catId: selectedAddCategory.id,
          name: selectedAddCategory.name,
          color: selectedAddCategory.color,
          start: newStart,
          end: newEnd
      });
      changed = true;
  }

  if (changed) {
    undoStack.push(JSON.stringify(tempLogData));
    redoStack = []; 
    
    // 시간순 정렬
    newSessions.sort((a,b) => a.start - b.start);

    tempLogData.sessions = newSessions;
    // 임시 데이터는 즉시 정제하지 않고 렌더링 시 처리
    
    renderTimeGrid(tempLogData);
    updateUndoRedoButtons();
  }
}

undoBtn.onclick = () => {
  if (undoStack.length > 0) {
    redoStack.push(JSON.stringify(tempLogData));
    const prevData = undoStack.pop();
    tempLogData = JSON.parse(prevData);
    renderTimeGrid(tempLogData);
    updateUndoRedoButtons();
  }
};

redoBtn.onclick = () => {
  if (redoStack.length > 0) {
    undoStack.push(JSON.stringify(tempLogData));
    const nextData = redoStack.pop();
    tempLogData = JSON.parse(nextData);
    renderTimeGrid(tempLogData);
    updateUndoRedoButtons();
  }
};

cancelDeleteBtn.onclick = () => {
    if(isDeleteMode) exitDeleteMode(false);
    if(isAddMode) exitAddMode(false);
};
confirmDeleteBtn.onclick = () => {
    if(isDeleteMode) exitDeleteMode(true);
    if(isAddMode) exitAddMode(true);
};

function updateUndoRedoButtons() {
  undoBtn.disabled = undoStack.length === 0;
  redoBtn.disabled = redoStack.length === 0;
}

async function saveLogToDB(dateKey, logData) {
  if (!currentUser) return;
  
  // 저장 시 카테고리별 total 재계산
  const newTotals = {};
  if(logData.sessions) {
      logData.sessions.forEach(s => {
          if(!newTotals[s.catId]) newTotals[s.catId] = 0;
          newTotals[s.catId] += (s.end - s.start)/1000;
      });
  }
  logData.totals = newTotals;

  try {
    await setDoc(doc(db, "users", currentUser.uid, "logs", dateKey), logData, { merge: true });
  } catch(e) { console.error("Save Error", e); }
}

/* ===============================
   Calendar & Grid (Rendering Logic)
=============================== */
function renderTimeGrid(logData) {
  timeGrid.innerHTML = "";
  
  const safeData = logData ? logData : { sessions: [] };
  
  // [핵심 로직] 10분 단위 블록 색칠 (과반수 로직 적용)
  // 각 10분 슬롯마다 어떤 카테고리가 5분 이상(300초) 차지했는지 계산
  
  for (let h = 0; h < 24; h++) {
    const row = document.createElement("div");
    row.className = "time-row"; 

    const label = document.createElement("div");
    label.className = "time-row-label";
    label.textContent = `${h}시`;
    row.appendChild(label);

    const blockContainer = document.createElement("div");
    blockContainer.className = "time-row-blocks";
    
    for (let b = 0; b < 6; b++) {
      const block = document.createElement("div");
      block.className = "time-block";
      
      const blockStartSec = (h * 3600) + (b * 600);
      const blockEndSec = blockStartSec + 600; 

      let dominantCategory = null;
      let maxDuration = 0;
      const durations = {};

      if (safeData.sessions) {
        safeData.sessions.forEach(s => {
           const sDate = new Date(s.start);
           const eDate = new Date(s.end);
           const sSec = sDate.getHours()*3600 + sDate.getMinutes()*60 + sDate.getSeconds();
           const eSec = eDate.getHours()*3600 + eDate.getMinutes()*60 + eDate.getSeconds();
           
           // 교집합 계산
           const overlapStart = Math.max(sSec, blockStartSec);
           const overlapEnd = Math.min(eSec, blockEndSec);
           const duration = Math.max(0, overlapEnd - overlapStart);

           if (duration > 0) {
               if(!durations[s.catId]) durations[s.catId] = { dur: 0, color: s.color, name: s.name };
               durations[s.catId].dur += duration;
           }
        });
      }

      // 해당 슬롯에서 가장 오래 지속된 카테고리 찾기
      for (const catId in durations) {
          if (durations[catId].dur > maxDuration) {
              maxDuration = durations[catId].dur;
              dominantCategory = durations[catId];
          }
      }

      // [규칙 적용] 5분(300초) 이상 차지했거나, 짧은 세션 중 가장 큰 지분일 때
      // 사용자 요청: 10분 단위로 보았을 때 더 큰 지분을 차지하는 그리드에게 줌.
      // 32-44분 (12분) -> 30-40 블록(8분), 40-50 블록(4분).
      // 위 로직대로라면 30-40 블록은 480초로 채택. 40-50 블록은 240초로 채택될 수도 있고 안될 수도 있음.
      // 10분 단위 표현을 위해 최소 임계값(예: 3분 이상)을 두어 노이즈 방지.
      if (dominantCategory && maxDuration >= 180) { // 3분 이상이면 색칠
         block.style.background = dominantCategory.color;
         block.title = `${dominantCategory.name}`;
         block.classList.add("has-data");
      }
      
      block.onclick = () => {
          if (isDeleteMode || isAddMode) {
              handleBlockClick(blockStartSec, blockEndSec);
          }
      };

      blockContainer.appendChild(block);
    }
    row.appendChild(blockContainer);
    timeGrid.appendChild(row);
  }
}

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
    const dStr = String(d).padStart(2,'0');
    const mStr = String(month+1).padStart(2,'0');
    const dateKey = `${year}-${mStr}-${dStr}`;
    
    block.dataset.date = `${year}.${mStr}.${dStr}`;
    block.dataset.key = dateKey;
    block.dataset.tooltip = `${block.dataset.date}`; 

    if (dateKey === getTodayKey()) {
      block.classList.add("today");
      block.id = "todayBlock"; 
    }
    if (dateKey === selectedDateKey) {
        block.classList.add("selected");
    }

    block.onclick = async () => {
        if (isDeleteMode || isAddMode) {
            if(!confirm("편집 중인 내용이 있습니다. 저장하지 않고 이동하시겠습니까?")) return;
            exitDeleteMode(false);
            exitAddMode(false);
        }

        const prev = document.querySelector(".day-block.selected");
        if(prev) prev.classList.remove("selected");
        block.classList.add("selected");

        selectedDateKey = dateKey;
        
        const rawLog = await loadDateLog(dateKey);
        viewLog = sanitizeLogs(rawLog); 
        
        drawDailyRing(viewLog);
        todayDateEl.textContent = `${year}년 ${month+1}월 ${d}일`;

        loadMemoData(dateKey);
        renderTimeGrid(viewLog);
    };

    block.addEventListener("mousemove", (e) => {
      const tip = block.dataset.tooltip || block.dataset.date;
      showTooltip(tip, e.clientX, e.clientY);
    });
    block.addEventListener("mouseleave", hideTooltip);

    loadAndApplyDailyData(year, month, d, block);
    calGrid.appendChild(block);
  }
}

// 캘린더 개별 셀 업데이트 함수 (편집 후 호출용)
function updateCalendarCell(targetDateKey) {
    const block = document.querySelector(`.day-block[data-key="${targetDateKey}"]`);
    if(block) {
        const [y, m, d] = targetDateKey.split("-");
        loadAndApplyDailyData(parseInt(y), parseInt(m)-1, parseInt(d), block);
    }
}

async function loadAndApplyDailyData(year, month, day, blockElement) {
  if (!currentUser) return;
  const dateKey = blockElement.dataset.key;
  let data = null;

  if (dateKey === getTodayKey() && selectedDateKey === getTodayKey()) {
     // 오늘이고 현재 보고 있다면 메모리 데이터 사용 (가장 최신)
     data = todayLog;
  } else {
    try {
      const docRef = doc(db, "users", currentUser.uid, "logs", dateKey);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) data = docSnap.data();
    } catch (e) {}
  }

  if (data && data.totals && Object.keys(data.totals).length > 0) {
    let maxSec = -1, maxCatId = null;
    for (const [catId, sec] of Object.entries(data.totals)) {
      if (sec > maxSec) { maxSec = sec; maxCatId = catId; }
    }
    if (maxCatId) {
      let catName = "", catColor = "";
      const liveCat = categories.find(c => c.id === maxCatId);
      if (liveCat) {
        catName = liveCat.name; catColor = liveCat.color;
      } else if (data.sessions) {
        const session = data.sessions.find(s => s.catId === maxCatId);
        if (session) { catColor = session.color; catName = session.name; }
      }
      
      if (catColor) blockElement.style.background = catColor;
      
      const mainHours = Math.floor(maxSec / 3600);
      const mainMinutes = Math.floor((maxSec % 3600) / 60);
      let timeStr = mainHours > 0 ? `${mainHours}시간 ` : "";
      timeStr += `${mainMinutes}분`;

      blockElement.dataset.tooltip = `${blockElement.dataset.date}\n⏱ ${timeStr}\n${catName || "삭제된 카테고리"}`;
    }
  } else {
      // 데이터가 없거나 삭제되어 totals가 비었을 경우 색상 제거
      blockElement.style.background = "";
  }
}

function updateTodayCalendarBlock() {
  const block = document.getElementById("todayBlock");
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

const RING_WIDTH = 40; 
const INNER_R = 120; // 0~12시
const OUTER_R = 170; // 12~24시

function drawDailyRing(logData) {
  const dpr = window.devicePixelRatio || 1;
  const size = 440; 
  dailyCanvas.width = size;
  dailyCanvas.height = size;
  
  const ctx = dailyCtx;
  const center = size / 2;
  
  ctx.clearRect(0, 0, size, size);

  // 중앙 텍스트
  ctx.fillStyle = "#ffffff"; 
  ctx.font = "bold 24px -apple-system, sans-serif"; 
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  
  // 시간 숫자
  const numRadius = size / 2 - 10; 
  for (let i = 1; i <= 12; i++) {
    const angle = (i - 3) * (Math.PI * 2) / 12;
    const x = center + Math.cos(angle) * numRadius;
    const y = center + Math.sin(angle) * numRadius;
    ctx.fillText(i, x, y);
  }

  // 1. 배경 링 (회색)
  ctx.lineWidth = RING_WIDTH;
  ctx.lineCap = "butt"; 
  
  // AM
  ctx.beginPath(); 
  ctx.arc(center, center, INNER_R, 0, Math.PI * 2); 
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)"; 
  ctx.stroke();

  // PM
  ctx.beginPath(); 
  ctx.arc(center, center, OUTER_R, 0, Math.PI * 2); 
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)"; 
  ctx.stroke();

  // 2. 데이터 세션 그리기
  if (logData && logData.sessions) {
    logData.sessions.forEach(session => {
      if (!session.start || !session.end || session.end <= session.start) return;

      const startDate = new Date(session.start);
      const endDate = new Date(session.end);
      drawSessionDual(ctx, startDate, endDate, session.color, center);
    });
  }

  // [추가] 10분 단위 구분선 그리기 (흰색 라인 오버레이)
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)"; // 튀지 않게 은은한 흰색
  ctx.lineWidth = 2;
  const totalSlots = 12 * 6; // 12시간 * 6개(10분단위) = 72개 슬롯
  
  for(let i=0; i<totalSlots; i++) {
      const angle = (i / totalSlots) * (Math.PI * 2) - (Math.PI / 2);
      
      // AM Ring Separators
      ctx.beginPath();
      ctx.moveTo(center + Math.cos(angle) * (INNER_R - RING_WIDTH/2), center + Math.sin(angle) * (INNER_R - RING_WIDTH/2));
      ctx.lineTo(center + Math.cos(angle) * (INNER_R + RING_WIDTH/2), center + Math.sin(angle) * (INNER_R + RING_WIDTH/2));
      ctx.stroke();
      
      // PM Ring Separators
      ctx.beginPath();
      ctx.moveTo(center + Math.cos(angle) * (OUTER_R - RING_WIDTH/2), center + Math.sin(angle) * (OUTER_R - RING_WIDTH/2));
      ctx.lineTo(center + Math.cos(angle) * (OUTER_R + RING_WIDTH/2), center + Math.sin(angle) * (OUTER_R + RING_WIDTH/2));
      ctx.stroke();
  }
}

function drawSessionDual(ctx, start, end, color, center) {
  const dayStart = new Date(start);
  dayStart.setHours(0,0,0,0);
  
  const startSec = (start.getTime() - dayStart.getTime()) / 1000;
  const endSec = (end.getTime() - dayStart.getTime()) / 1000;
  
  // 너무 짧은 세션 시각화 제외 (최소 1분)
  if (endSec - startSec < 60) return; 

  const halfDay = 43200; // 12시간

  const drawArc = (radius, s, e) => {
    if (s >= e) return;
    const startAngle = (s / halfDay) * (Math.PI * 2) - (Math.PI / 2);
    const endAngle = (e / halfDay) * (Math.PI * 2) - (Math.PI / 2);
    
    ctx.beginPath();
    ctx.arc(center, center, radius, startAngle, endAngle);
    ctx.strokeStyle = color;
    ctx.lineWidth = RING_WIDTH;
    ctx.lineCap = "butt"; 
    ctx.stroke();
  };

  // AM
  if (startSec < halfDay) {
    const segEnd = Math.min(endSec, halfDay);
    drawArc(INNER_R, startSec, segEnd);
  }
  
  // PM
  if (endSec > halfDay) {
    const segStart = Math.max(startSec, halfDay);
    drawArc(OUTER_R, segStart - halfDay, endSec - halfDay);
  }
}

// 듀얼 링 마우스 오버
dailyCanvas.addEventListener("mousemove", (e) => {
  const rect = dailyCanvas.getBoundingClientRect();
  const scaleX = dailyCanvas.width / rect.width;
  const scaleY = dailyCanvas.height / rect.height;
  
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  
  const center = dailyCanvas.width / 2;
  const dx = x - center;
  const dy = y - center;
  const dist = Math.sqrt(dx*dx + dy*dy);
  
  let angle = Math.atan2(dy, dx); 
  let chartAngle = angle + Math.PI / 2;
  if (chartAngle < 0) chartAngle += Math.PI * 2; 
  
  const halfDay = 43200; 
  const timeInRing = (chartAngle / (Math.PI * 2)) * halfDay;
  
  let checkTime = null;
  const halfWidth = RING_WIDTH / 2;
  
  if (dist >= INNER_R - halfWidth && dist <= INNER_R + halfWidth) {
      checkTime = timeInRing; // AM
  } else if (dist >= OUTER_R - halfWidth && dist <= OUTER_R + halfWidth) {
      checkTime = timeInRing + halfDay; // PM
  }

  if (checkTime !== null && viewLog.sessions) {
    const hoveredSession = viewLog.sessions.find(s => {
      const dayStart = new Date(s.start);
      dayStart.setHours(0,0,0,0);
      const sSec = (s.start - dayStart.getTime()) / 1000;
      const eSec = (s.end - dayStart.getTime()) / 1000;
      return checkTime >= sSec && checkTime <= eSec;
    });

    if (hoveredSession) {
      const durationMin = Math.round((hoveredSession.end - hoveredSession.start)/1000/60);
      let catName = hoveredSession.name || "삭제된 카테고리";
      
      const sTime = new Date(hoveredSession.start);
      const eTime = new Date(hoveredSession.end);
      const timeStr = `${sTime.getHours()}:${String(sTime.getMinutes()).padStart(2,'0')} ~ ${eTime.getHours()}:${String(eTime.getMinutes()).padStart(2,'0')}`;
      
      showTooltip(`${catName}\n⏱ ${durationMin}분\n(${timeStr})`, e.clientX, e.clientY);
      dailyCanvas.style.cursor = "pointer";
    } else {
      hideTooltip();
      dailyCanvas.style.cursor = "default";
    }
  } else {
    hideTooltip();
    dailyCanvas.style.cursor = "default";
  }
});
dailyCanvas.addEventListener("mouseleave", hideTooltip);

/* ===============================
   Auth & Initialization
=============================== */
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    authBtn.textContent = "로그아웃";
    userProfile.src = user.photoURL;
    userProfile.classList.remove("hidden");
    userName.textContent = user.displayName;
    userName.classList.remove("hidden");

    categories = [];
    activeCategory = { ...defaultCategory };
    todayLog = { sessions: [], totals: {}, memo: "" };
    viewLog = { sessions: [], totals: {}, memo: "" };
    
    // 카테고리 불러오기
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
    } catch(e) {}
    renderCategories();
    drawRing();

    selectedDateKey = getTodayKey();
    todayDateEl.textContent = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    
    // 로그 데이터 불러오기
    try {
      const docRef = doc(db, "users", user.uid, "logs", selectedDateKey);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const dbData = docSnap.data();
        todayLog = { 
            sessions: dbData.sessions || [], 
            totals: dbData.totals || {}, 
            memo: dbData.memo || "" 
        };
        // 불러온 직후 오늘 날짜라면 로컬에 저장하여 동기화 유지
        if(selectedDateKey === getTodayKey()) saveTodayLog(); 
      } else {
        saveTodayLog();
      }
    } catch(e) {}

    viewLog = todayLog; 
    drawDailyRing(viewLog);
    renderCalendar(currentCalDate);
    renderTimeGrid(viewLog); 
    loadMemoData(selectedDateKey); 

  } else {
    stopTimerLogic();
    currentUser = null;
    
    todayLog = { sessions: [], totals: {}, memo: "" };
    viewLog = { sessions: [], totals: {}, memo: "" };
    categories = []; 
    activeCategory = { ...defaultCategory }; 
    selectedDateKey = getTodayKey();
    
    authBtn.textContent = "Google 로그인";
    userProfile.classList.add("hidden");
    userName.classList.add("hidden");
    userProfile.src = "";
    userName.textContent = "";
    
    categoryList.innerHTML = "";
    editor.innerHTML = ""; 
    currentCategory.textContent = activeCategory.name; 
    
    renderCategories();
    drawRing();
    drawDailyRing({ sessions: [] }); 
    renderCalendar(currentCalDate); 
    renderTimeGrid({ sessions: [] }); 
  }
});

authBtn.onclick = async () => {
  const user = auth.currentUser;
  if (user) {
    stopTimerLogic();
    if (currentUser) {
        await saveTodayLog(); 
    }
    await signOut(auth);
  } else {
    await signInWithPopup(auth, googleProvider);
  }
};

/* ===============================
   Slash Menu Functions
=============================== */
function showSlashMenu(query) {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  
  slashMenu.classList.remove("hidden");
  
  let top = rect.bottom + window.scrollY;
  let left = rect.left + window.scrollX;
  
  if (left + 160 > window.innerWidth) left = window.innerWidth - 170;
  
  slashMenu.style.top = `${top}px`;
  slashMenu.style.left = `${left}px`;
  
  const items = slashMenu.querySelectorAll(".menu-item");
  let hasVisible = false;
  
  const shortcuts = {
      'ㄱ': '글제목',
      'ㅊ': '체크박스',
      'ㅁ': '메모',
      '메': '메모'
  };

  items.forEach((item, index) => {
    const itemText = item.textContent.toLowerCase();
    const lowerQuery = query ? query.toLowerCase() : "";
    
    let match = false;
    if (!lowerQuery) {
        match = true;
    } else {
        if (itemText.includes(lowerQuery)) match = true;
        if (shortcuts[lowerQuery] && itemText.includes(shortcuts[lowerQuery])) match = true;
    }

    if (match) {
        item.style.display = "flex";
        hasVisible = true;
    } else {
        item.style.display = "none";
    }
    item.classList.remove("selected");
  });

  if (!hasVisible) {
    hideSlashMenu();
  } else {
    slashMenuIndex = 0;
    const visibleItems = Array.from(items).filter(item => item.style.display !== "none");
    if(visibleItems.length > 0) visibleItems[0].classList.add("selected");
  }
}

function hideSlashMenu() {
  slashMenu.classList.add("hidden");
  slashMenuIndex = 0;
}

function updateSlashMenuSelection() {
  const items = slashMenu.querySelectorAll(".menu-item");
  const visibleItems = Array.from(items).filter(item => item.style.display !== "none");
  if (visibleItems.length === 0) return;
  
  items.forEach(i => i.classList.remove("selected"));
  
  if (slashMenuIndex >= visibleItems.length) slashMenuIndex = 0;
  if (slashMenuIndex < 0) slashMenuIndex = visibleItems.length - 1;
  
  visibleItems[slashMenuIndex].classList.add("selected");
}

function createNotionBlock(type) {
    if (type === "heading") {
        const h2 = document.createElement("div");
        h2.className = "notion-heading";
        h2.textContent = "제목 입력"; 
        return h2;
    } 
    else if (type === "checkbox") {
        const wrapper = document.createElement("div");
        wrapper.className = "notion-checkbox-wrapper";
        
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        
        const textSpan = document.createElement("span");
        textSpan.textContent = "\u200B"; 
        
        wrapper.appendChild(checkbox);
        wrapper.appendChild(textSpan);
        return wrapper;
    }
    else if (type === "callout") {
        const wrapper = document.createElement("div");
        wrapper.className = "notion-callout";
        wrapper.contentEditable = "false"; 

        const icon = document.createElement("div");
        icon.className = "callout-icon";
        icon.contentEditable = "false";
        
        const content = document.createElement("div");
        content.className = "callout-content";
        content.contentEditable = "true";
        
        const delBtn = document.createElement("div");
        delBtn.className = "callout-delete-btn";
        delBtn.contentEditable = "false"; 
        delBtn.onclick = (e) => {
            e.stopPropagation();
            wrapper.remove();
        };
        
        wrapper.appendChild(icon);
        wrapper.appendChild(content);
        wrapper.appendChild(delBtn);
        return wrapper;
    }
    return null;
}

function applySlashCommand(item) {
  const type = item.dataset.type;
  hideSlashMenu();
  
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  
  const currentTextNode = range.startContainer;
  let textContent = currentTextNode.textContent;
  const slashIdx = textContent.lastIndexOf("/");
  
  if (currentTextNode.nodeType === 3 && slashIdx >= 0) {
      currentTextNode.textContent = textContent.substring(0, slashIdx);
  }

  const parentBlock = currentTextNode.parentNode;
  const isBlockEmpty = parentBlock.textContent.trim() === "";

  const newElement = createNotionBlock(type);
  if (!newElement) return;

  if (isBlockEmpty && parentBlock.tagName === 'DIV' && !parentBlock.classList.contains('notion-editor')) {
      parentBlock.replaceWith(newElement);
  } else {
      if (parentBlock.nextSibling) {
          parentBlock.parentNode.insertBefore(newElement, parentBlock.nextSibling);
      } else {
          parentBlock.parentNode.appendChild(newElement);
      }
  }
  
  if (type === "heading") {
      const newRange = document.createRange();
      newRange.selectNodeContents(newElement);
      selection.removeAllRanges();
      selection.addRange(newRange);
  } else if (type === "checkbox") {
      const textSpan = newElement.querySelector("span");
      const newRange = document.createRange();
      newRange.setStart(textSpan, 1); 
      newRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(newRange);
  } else if (type === "callout") {
      const content = newElement.querySelector(".callout-content");
      requestAnimationFrame(() => {
          content.focus();
      });
  }
}

editor.addEventListener("keydown", (e) => {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  
  if (!slashMenu.classList.contains("hidden")) {
    const items = slashMenu.querySelectorAll(".menu-item");
    const visibleItems = Array.from(items).filter(item => item.style.display !== "none");

    if (e.key === "ArrowDown") {
      e.preventDefault();
      slashMenuIndex++;
      updateSlashMenuSelection();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      slashMenuIndex--;
      updateSlashMenuSelection();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault(); 
      e.stopImmediatePropagation(); 

      if (visibleItems.length > 0) {
        if (slashMenuIndex < 0) slashMenuIndex = 0;
        if (slashMenuIndex >= visibleItems.length) slashMenuIndex = 0;
        
        applySlashCommand(visibleItems[slashMenuIndex]);
      }
      return;
    }
    if (e.key === "Escape") {
        e.preventDefault();
        hideSlashMenu();
        return;
    }
  }

  const anchorNode = selection.anchorNode;
  const currentElement = anchorNode.nodeType === 3 ? anchorNode.parentNode : anchorNode;
  const calloutContent = currentElement.closest(".callout-content");

  if (calloutContent) {
      if (e.key === "Enter") {
          if (e.isComposing) return;

          if (!e.shiftKey) {
             e.preventDefault();
             const wrapper = calloutContent.closest(".notion-callout");
             const p = document.createElement("div");
             p.innerHTML = "<br>";
             wrapper.after(p);
             
             const range = document.createRange();
             range.setStart(p, 0);
             range.collapse(true);
             selection.removeAllRanges();
             selection.addRange(range);
             return;
          }
      }
      return; 
  }

  if (e.key === "Enter") {
      if (e.isComposing) return;

      const checkboxWrapper = currentElement.closest(".notion-checkbox-wrapper");
      if (checkboxWrapper && !e.shiftKey) {
          e.preventDefault(); 
          
          const textSpan = checkboxWrapper.querySelector("span");
          const textContent = textSpan ? textSpan.innerText.replace(/\u200B/g, '').trim() : "";
          
          if (textContent === "") {
              const p = document.createElement("div");
              p.innerHTML = "<br>";
              checkboxWrapper.replaceWith(p);
              
              const range = document.createRange();
              range.setStart(p, 0);
              range.collapse(true);
              selection.removeAllRanges();
              selection.addRange(range);
          } else {
              const newWrapper = createNotionBlock("checkbox");
              checkboxWrapper.after(newWrapper);
              
              const newSpan = newWrapper.querySelector("span");
              const range = document.createRange();
              range.setStart(newSpan, 1);
              range.collapse(true);
              selection.removeAllRanges();
              selection.addRange(range);
          }
          return;
      }

      const headingBlock = currentElement.closest(".notion-heading");
      if (headingBlock) {
          e.preventDefault();
          const p = document.createElement("div"); 
          p.innerHTML = "<br>";
          headingBlock.after(p);
          const range = document.createRange();
          range.setStart(p, 0);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
          return;
      }
  }
});

editor.addEventListener("keyup", (e) => {
  if (["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(e.key)) return;
  
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  const node = selection.anchorNode;
  if (!node) return;
  
  const text = node.textContent;
  
  const slashIdx = text.lastIndexOf("/");
  if (slashIdx >= 0) {
      const query = text.slice(slashIdx + 1);
      if (query.length < 10 && !query.includes(" ")) {
        showSlashMenu(query);
      } else {
        hideSlashMenu();
      }
  } else {
    hideSlashMenu();
  }
});

slashMenu.addEventListener('mousedown', (e) => {
    e.preventDefault(); 
    const item = e.target.closest('.menu-item');
    if (item) {
        applySlashCommand(item);
    }
});

editor.addEventListener("input", (e) => {
    if (!currentUser) return;
    if (saveTimeout) clearTimeout(saveTimeout);
    
    if(focusNoteDisplay && !focusNoteDisplay.classList.contains("hidden")) {
        focusNoteDisplay.innerHTML = editor.innerHTML;
    }

    saveTimeout = setTimeout(async () => {
        if (selectedDateKey === getTodayKey()) {
            todayLog.memo = editor.innerHTML;
            viewLog.memo = editor.innerHTML; 
            await saveTodayLog();
        } else {
            viewLog.memo = editor.innerHTML;
            await saveLogToDB(selectedDateKey, viewLog);
        }
    }, 1000);
});

renderCategories();
drawRing();
renderTime();
drawDailyRing({ sessions: [] });
renderCalendar(currentCalDate);

window.addEventListener("beforeunload", () => {
  if (currentUser && selectedDateKey === getTodayKey() && editor.innerHTML !== viewLog.memo) {
      todayLog.memo = editor.innerHTML;
      saveTodayLog(); 
  }
});