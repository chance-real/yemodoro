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
  const target = e.target.closest('button, input, .category-item, .category-settings, .day-block, .settings-btn, .menu-item, .record-btn-float, .focus-mode-btn');
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

// [NEW] Delete Mode Controls
const deleteModeBtn = document.getElementById("deleteModeBtn");
const editControls = document.getElementById("editControls");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
const gridTitleText = document.getElementById("gridTitleText"); 

/* ===============================
   Helper Functions
=============================== */
function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}

// [핵심] 10분 단위(600초) 데이터 정제 함수
// 1. 10분 미만(0~599초) 기록은 자동 삭제
// 2. 19분 -> 10분으로 내림 처리 (Math.floor)
function sanitizeLogs(logData) {
  if (!logData || !logData.sessions) return logData;

  const validSessions = [];
  const newTotals = {};

  logData.sessions.forEach(session => {
    // 10분 단위 (600초)
    const UNIT = 600 * 1000; 
    let duration = session.end - session.start;

    // 10분 미만이면 삭제 (저장하지 않음)
    if (duration < UNIT) return;

    // 10분 단위로 내림 처리 (예: 19분 -> 10분)
    const quantizedDuration = Math.floor(duration / UNIT) * UNIT;
    
    // 종료 시간 재설정 (시작 시간 + 정제된 지속시간)
    const newEnd = session.start + quantizedDuration;

    // 카테고리별 합계 계산
    if (!newTotals[session.catId]) newTotals[session.catId] = 0;
    newTotals[session.catId] += (quantizedDuration / 1000); // 초 단위 저장

    validSessions.push({
      ...session,
      end: newEnd
    });
  });

  return {
    ...logData,
    sessions: validSessions,
    totals: newTotals
  };
}

async function saveTodayLog() {
  if (!currentUser) return;
  
  if (selectedDateKey === getTodayKey()) {
    todayLog.memo = editor.innerHTML;
  }
  
  // 저장 전에 10분 단위 정제 적용
  const cleanLog = sanitizeLogs(todayLog);
  // 메모리 상의 todayLog도 정제된 것으로 교체 (UI 반영을 위해)
  todayLog = cleanLog;
  viewLog = cleanLog;

  try {
    await setDoc(doc(db, "users", currentUser.uid, "logs", getTodayKey()), cleanLog);
    // UI 즉시 업데이트 (삭제된 9분 등 반영)
    drawDailyRing(cleanLog);
    renderTimeGrid(cleanLog);
  } catch(e) { console.error("오늘 기록 저장 실패:", e); }
}

async function loadDateLog(dateKey) {
  if (!currentUser) return { sessions: [], totals: {}, memo: "" };
  try {
    const docRef = doc(db, "users", currentUser.uid, "logs", dateKey);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      // 불러올 때도 혹시 모르니 정제
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
  recordDateTitle.textContent = `${y}. ${m}. ${d} 기록`;
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

// User & Data State
let currentUser = null;
let todayLog = { sessions: [], totals: {}, memo: "" }; 
let viewLog = { sessions: [], totals: {}, memo: "" };  

let currentCalDate = new Date(); 
let selectedDateKey = getTodayKey(); 

let wakeLock = null;

// 슬래시 메뉴 상태
let slashMenuIndex = 0;

// [NEW] Delete Mode State
let isDeleteMode = false;
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
    if (timerInterval) { 
      await requestWakeLock();
    }
  }
});

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
    
    // 타이머 멈출 때 10분 미만 기록 삭제 및 저장
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

  // 실시간 합계는 대략적으로 보여주지만, 저장은 정제된 값으로 함
  if (!todayLog.totals[activeCategory.id]) {
    todayLog.totals[activeCategory.id] = 0;
  }
  todayLog.totals[activeCategory.id] += 1;

  if (selectedDateKey === getTodayKey()) {
    // 실시간 뷰에서는 일단 있는 그대로 보여주다가, 멈출 때 정제함
    // 하지만 링/그리드가 너무 지저분해지는 것을 막기 위해, 그릴 때 필터링하는 방법도 있음
    // 여기서는 일단 Raw Data로 보여주고 10분 되면 Grid 한 칸이 참.
    viewLog = todayLog; 
    
    // 하지만 사용자가 '실시간으로 10분 단위로 채워지는걸' 원한다면 
    // 그리는 시점에서 sanitizeLogs를 호출해서 그려야 함.
    const displayLog = sanitizeLogs(JSON.parse(JSON.stringify(todayLog)));
    drawDailyRing(displayLog); 
    
    if (!recordView.classList.contains("hidden")) {
        renderTimeGrid(displayLog);
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
    ctx.shadowBlur = 25; 
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
  // 열 때 정제된 뷰를 확실히 보여줌
  const cleanLog = sanitizeLogs(viewLog);
  renderTimeGrid(cleanLog); 
};

closeRecordBtn.onclick = () => {
  if (isDeleteMode) {
      exitDeleteMode(false); 
  }
  recordView.classList.add("hidden");
  timerView.classList.remove("hidden");
  hideSlashMenu();
};

function enterFocusMode() {
  document.body.classList.add("focus-mode");
  exitFocusBtn.classList.remove("hidden");
}

function exitFocusMode() {
  document.body.classList.remove("focus-mode");
  exitFocusBtn.classList.add("hidden");
}

mainFocusBtn.onclick = enterFocusMode;
recordFocusBtn.onclick = enterFocusMode;
exitFocusBtn.onclick = exitFocusMode;

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.body.classList.contains("focus-mode")) {
    exitFocusMode();
  }
});

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
  isDeleteMode = true;
  deleteModeBtn.classList.add("active");
  editControls.classList.remove("hidden");
  gridTitleText.classList.add("hidden");
  
  // 편집 시작 전에도 정제된 데이터 기반
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
  
  if (saveChanges && tempLogData) {
    // 삭제 후 저장 시에도 sanitizeLogs를 한 번 더 거치면 안전함 (하지만 10분 단위 삭제라 이미 정제됨)
    viewLog = tempLogData;
    
    if (selectedDateKey === getTodayKey()) {
        todayLog = JSON.parse(JSON.stringify(viewLog));
    }

    saveLogToDB(selectedDateKey, viewLog);
    
    renderTimeGrid(viewLog);
    drawDailyRing(viewLog); // 즉시 링에 반영 (100% 페어링)
    updateTodayCalendarBlock(); 
    
  } else {
    // 취소 시 원래대로
    renderTimeGrid(sanitizeLogs(viewLog));
  }
  
  tempLogData = null;
  undoStack = [];
  redoStack = [];
}

// 블록 클릭 시 삭제 처리
function handleBlockClick(startSec, endSec) {
  if (!isDeleteMode || !tempLogData) return;
  
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
    
    // 잘라내기
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

  if (changed) {
    undoStack.push(JSON.stringify(tempLogData));
    redoStack = []; 
    
    tempLogData.sessions = newSessions;
    // 잘라낸 후에도 sanitizeLogs를 적용해 10분 미만 자투리가 생기면 없앰
    tempLogData = sanitizeLogs(tempLogData);

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

cancelDeleteBtn.onclick = () => exitDeleteMode(false);
confirmDeleteBtn.onclick = () => exitDeleteMode(true);

function updateUndoRedoButtons() {
  undoBtn.disabled = undoStack.length === 0;
  redoBtn.disabled = redoStack.length === 0;
}

async function saveLogToDB(dateKey, logData) {
  if (!currentUser) return;
  try {
    await setDoc(doc(db, "users", currentUser.uid, "logs", dateKey), logData, { merge: true });
  } catch(e) { console.error("Save Error", e); }
}

/* ===============================
   Calendar & Grid (Modified for Delete)
=============================== */
function renderTimeGrid(logData) {
  timeGrid.innerHTML = "";
  
  // Grid를 그릴 때는 항상 정제된 데이터(10분 단위)를 기준으로 함
  const safeData = logData ? logData : { sessions: [] };
  
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

      let hasSession = null;
      if (safeData.sessions) {
         hasSession = safeData.sessions.find(s => {
           const sDate = new Date(s.start);
           const eDate = new Date(s.end);
           const sSec = sDate.getHours()*3600 + sDate.getMinutes()*60 + sDate.getSeconds();
           const eSec = eDate.getHours()*3600 + eDate.getMinutes()*60 + eDate.getSeconds();
           
           // 10분 단위로 정제되었으므로 겹치는 부분이 있으면 해당 블록은 채워짐
           // (sSec < blockEndSec && eSec > blockStartSec)
           // 단, 정제된 데이터는 정확히 600초 배수이므로 logic이 깔끔함
           return (sSec < blockEndSec && eSec > blockStartSec);
         });
      }

      if (hasSession) {
         block.style.background = hasSession.color;
         block.title = `${hasSession.name}`;
         block.classList.add("has-data");
      }
      
      block.onclick = () => {
          if (isDeleteMode && hasSession) {
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
        if (isDeleteMode) {
            if(!confirm("편집 중인 내용이 있습니다. 저장하지 않고 이동하시겠습니까?")) return;
            exitDeleteMode(false);
        }

        const prev = document.querySelector(".day-block.selected");
        if(prev) prev.classList.remove("selected");
        block.classList.add("selected");

        selectedDateKey = dateKey;
        
        const rawLog = await loadDateLog(dateKey);
        viewLog = sanitizeLogs(rawLog); // 로드 시 정제
        
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

async function loadAndApplyDailyData(year, month, day, blockElement) {
  if (!currentUser) return;
  const dateKey = blockElement.dataset.key;
  let data = null;

  if (dateKey === getTodayKey()) {
    data = todayLog;
  } else {
    try {
      const docRef = doc(db, "users", currentUser.uid, "logs", dateKey);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) data = docSnap.data();
    } catch (e) {}
  }

  // 캘린더 표시용 데이터도 정제된 값을 기준
  if(data) data = sanitizeLogs(data);

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

  // 2. 데이터 세션 (10분 단위 정제된 데이터만 들어옴)
  if (logData && logData.sessions) {
    logData.sessions.forEach(session => {
      if (!session.start || !session.end || session.end <= session.start) return;

      const startDate = new Date(session.start);
      const endDate = new Date(session.end);
      drawSessionDual(ctx, startDate, endDate, session.color, center);
    });
  }
}

function drawSessionDual(ctx, start, end, color, center) {
  const dayStart = new Date(start);
  dayStart.setHours(0,0,0,0);
  
  // 하루 중 초
  const startSec = (start.getTime() - dayStart.getTime()) / 1000;
  const endSec = (end.getTime() - dayStart.getTime()) / 1000;
  
  // 10분 이하는 이미 삭제되었으므로 그리기만 하면 됨
  if (endSec - startSec < 600) return; 

  const halfDay = 43200; // 12시간

  const drawArc = (radius, s, e) => {
    if (s >= e) return;
    const startAngle = (s / halfDay) * (Math.PI * 2) - (Math.PI / 2);
    const endAngle = (e / halfDay) * (Math.PI * 2) - (Math.PI / 2);
    
    ctx.beginPath();
    ctx.arc(center, center, radius, startAngle, endAngle);
    ctx.strokeStyle = color;
    ctx.lineWidth = RING_WIDTH;
    ctx.lineCap = "butt"; // 블록 형태 유지를 위해 butt
    // 약간의 간격을 위해 선보다 살짝 작게 그리거나 strokeStyle 경계를 줄 수 있으나
    // 사용자가 '100% 페어링'을 원하므로 꽉 채워서 그림
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
    
    try {
      const docRef = doc(db, "users", user.uid, "logs", selectedDateKey);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const dbData = docSnap.data();
        const combinedSessions = [...(dbData.sessions || []), ...(todayLog.sessions || [])];
        const combinedTotals = { ...(dbData.totals || {}) };
        const localTotals = todayLog.totals || {};
        for (const [id, count] of Object.entries(localTotals)) {
          combinedTotals[id] = (combinedTotals[id] || 0) + count;
        }
        todayLog = { sessions: combinedSessions, totals: combinedTotals, memo: dbData.memo || "" };
        
        // 로드 후 즉시 정제 및 저장
        saveTodayLog();
      } else {
        saveTodayLog();
      }
    } catch(e) {}

    // viewLog를 todayLog(이미 정제됨)와 연결
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
    
    categoryList.innerHTML = "";
    editor.innerHTML = "";
    
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
   Slash Menu Functions (Refined)
=============================== */
function showSlashMenu(query) {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  
  slashMenu.classList.remove("hidden");
  
  // 에디터 위치 기반으로 메뉴 위치 조정
  const editorRect = editor.getBoundingClientRect();
  let top = rect.bottom + window.scrollY;
  let left = rect.left + window.scrollX;
  
  // 화면 밖으로 나가지 않게 조정
  if (left + 160 > window.innerWidth) left = window.innerWidth - 170;
  
  slashMenu.style.top = `${top}px`;
  slashMenu.style.left = `${left}px`;
  
  const items = slashMenu.querySelectorAll(".menu-item");
  let hasVisible = false;
  
  // 첫 번째 항목이 기본 선택되도록 인덱스 초기화
  slashMenuIndex = 0;

  items.forEach((item, index) => {
    item.classList.remove("selected");
    if (index === 0) item.classList.add("selected");
    item.style.display = "flex"; 
    hasVisible = true;
  });

  if (!hasVisible) {
    hideSlashMenu();
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
  
  if (slashMenuIndex >= visibleItems.length) slashMenuIndex = 0;
  if (slashMenuIndex < 0) slashMenuIndex = visibleItems.length - 1;
  
  items.forEach(i => i.classList.remove("selected"));
  visibleItems[slashMenuIndex].classList.add("selected");
}

function applySlashCommand(item) {
  const type = item.dataset.type;
  hideSlashMenu();
  
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  
  // '/' 문자 제거 및 노드 정리
  const node = range.startContainer;
  if (node.nodeType === 3) { // Text Node
      const text = node.textContent;
      const slashIdx = text.lastIndexOf("/");
      if (slashIdx >= 0) {
          node.textContent = text.slice(0, slashIdx);
          range.setStart(node, slashIdx);
          range.setEnd(node, slashIdx);
      }
  }

  // 기능 적용
  if (type === "heading") {
      // 1. 글제목 (H2 태그에 클래스 적용)
      // execCommand를 쓰지 않고 HTML 삽입으로 처리하여 커스텀 스타일 적용
      const h2 = document.createElement("div");
      h2.className = "notion-heading";
      h2.textContent = "제목 입력"; // 플레이스홀더 느낌
      
      const br = document.createElement("br"); // 다음 줄 입력용
      
      // 현재 블록(p나 div)을 교체하거나 삽입
      range.insertNode(h2);
      
      // 커서를 제목 내부로 이동
      const newRange = document.createRange();
      newRange.selectNodeContents(h2);
      selection.removeAllRanges();
      selection.addRange(newRange);

  } else if (type === "checkbox") {
      // 2. 체크박스
      const wrapper = document.createElement("div");
      wrapper.className = "notion-checkbox-wrapper";
      
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      
      const textSpan = document.createElement("span");
      textSpan.textContent = "\u00A0"; // 공백
      
      wrapper.appendChild(checkbox);
      wrapper.appendChild(textSpan);
      
      range.insertNode(wrapper);
      
      // 커서를 체크박스 옆 텍스트로 이동
      range.setStart(textSpan, 1);
      range.setEnd(textSpan, 1);
      selection.removeAllRanges();
      selection.addRange(range);

  } else if (type === "callout") {
      // 3. 메모 (Callout)
      const callout = document.createElement("div");
      callout.className = "notion-callout";
      callout.textContent = "메모를 작성하세요";
      
      range.insertNode(callout);
      
      // 커서를 메모 내부로
      const newRange = document.createRange();
      newRange.selectNodeContents(callout);
      selection.removeAllRanges();
      selection.addRange(newRange);
  }
}

// 1. 에디터 입력 감지 (슬래시 메뉴 호출 및 엔터 처리)
editor.addEventListener("keydown", (e) => {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  
  // 슬래시 메뉴가 열려있을 때
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
      if (visibleItems.length > 0) {
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

  // 글제목(Heading)에서의 엔터 처리
  // 엔터 -> 스타일 해제 (일반 텍스트), Shift+Enter -> 스타일 유지
  const anchorNode = selection.anchorNode;
  const currentBlock = anchorNode.nodeType === 3 ? anchorNode.parentNode : anchorNode;

  if (currentBlock.classList && currentBlock.classList.contains("notion-heading")) {
      if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          // 제목 아래에 일반 p 태그 삽입 후 커서 이동
          const p = document.createElement("div"); // div가 줄바꿈 처리에 더 안전
          p.innerHTML = "<br>";
          if (currentBlock.nextSibling) {
              currentBlock.parentNode.insertBefore(p, currentBlock.nextSibling);
          } else {
              currentBlock.parentNode.appendChild(p);
          }
          
          const range = document.createRange();
          range.setStart(p, 0);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
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
  
  // 슬래시 감지
  // '/'가 입력되었고, 뒤에 공백이 없어야 함
  const slashIdx = text.lastIndexOf("/");
  if (slashIdx >= 0) {
      // 슬래시 뒤의 텍스트가 10자 이내일 때만 메뉴 호출
      if (text.length - slashIdx < 10) {
        showSlashMenu(text.slice(slashIdx + 1));
      } else {
        hideSlashMenu();
      }
  } else {
    hideSlashMenu();
  }
});

// 메뉴 클릭 처리 (mousedown 사용: click은 focus 잃음 문제 발생 가능)
slashMenu.addEventListener('mousedown', (e) => {
    e.preventDefault(); // 에디터 포커스 유지
    const item = e.target.closest('.menu-item');
    if (item) {
        applySlashCommand(item);
    }
});

// 자동 저장 (디바운스)
editor.addEventListener("input", (e) => {
    if (!currentUser) return;
    if (saveTimeout) clearTimeout(saveTimeout);
    
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

// Initial Render
renderCategories();
drawRing();
renderTime();
drawDailyRing({ sessions: [] });
renderCalendar(currentCalDate);