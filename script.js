const categoryList = document.getElementById("categoryList");
const categoryInput = document.getElementById("categoryInput");
const addCategoryBtn = document.getElementById("addCategoryBtn");
const currentCategory = document.getElementById("currentCategory");

const timerEl = document.getElementById("timer");
const canvas = document.getElementById("ring");
const ctx = canvas.getContext("2d");

const minuteInput = document.getElementById("minuteInput");

// ✅ 초기값: 뽀모도로 레드, 이름 변경 반영
let defaultCategory = {
  name: "예모도로(기본_25분)",
  color: "#FF2D55" // 네온 레드
};

let categories = [];
let activeCategory = { ...defaultCategory }; // 시작하자마자 적용

let totalSeconds = 25 * 60;
let remainingSeconds = totalSeconds;
let timerInterval = null;

// 현재 열려있는 설정 패널 추적
let activeSettingsPanel = null;

/* ===============================
   Category Logic
=============================== */
function renderCategories() {
  categoryList.innerHTML = "";
  categories.forEach(cat => {
    const item = document.createElement("div");
    item.className = "category-item";

    // 1. 카테고리 선택 버튼
    const btn = document.createElement("button");
    btn.className = "category-btn";
    btn.textContent = cat.name;
    // 버튼 배경색: 약간 투명하게 하여 은은하게
    btn.style.background = cat.color; 
    btn.style.textShadow = "0 1px 2px rgba(0,0,0,0.5)";
    btn.onclick = () => {
      activeCategory = cat;
      currentCategory.textContent = cat.name;
      drawRing();
    };

    // 2. 설정(톱니바퀴) 버튼
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
    id: Date.now(),
    name,
    color: `hsl(${Math.random() * 360}, 80%, 60%)`
  };

  categories.push(newCat);
  categoryInput.value = "";
  
  // 카테고리 추가 시 바로 선택하고 싶다면 아래 주석 해제
  // activeCategory = newCat;
  // currentCategory.textContent = newCat.name;
  
  renderCategories();
  drawRing(); // 링 색상 업데이트를 위해 필요할 수 있음
}

addCategoryBtn.onclick = addCategory;

categoryInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.isComposing) {
    e.preventDefault();
    addCategory();
  }
});

/* ===============================
   Settings Panel (Functional)
=============================== */
function openSettings(cat, parentItem) {
  // 기존 패널 닫기
  if (activeSettingsPanel) {
    activeSettingsPanel.remove();
    activeSettingsPanel = null;
  }

  const panel = document.createElement("div");
  panel.className = "settings-panel";

  // 이름 수정
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = cat.name;

  // 색상 수정
  const colorWrapper = document.createElement("div");
  colorWrapper.className = "settings-row";
  
  const colorInput = document.createElement("input");
  colorInput.type = "color";
  // HSL to Hex 변환이 복잡하므로, 일단 현재 값이 hex라면 그대로, 아니면 기본값
  // (input type=color는 hex만 받음. 간단한 구현을 위해 여기선 사용자 선택값 사용)
  // 기존 값이 hex가 아니면 검정으로 뜰 수 있음. 
  // UX를 위해 색상 선택 시 바로 hex로 저장하도록 로직 통일 권장.
  
  // 저장 버튼
  const saveBtn = document.createElement("button");
  saveBtn.className = "settings-btn btn-save";
  saveBtn.textContent = "저장";
  saveBtn.onclick = () => {
    cat.name = nameInput.value;
    cat.color = colorInput.value;
    // 만약 현재 선택된 카테고리를 수정했다면 즉시 반영
    if (activeCategory.id === cat.id) {
      activeCategory = cat;
      currentCategory.textContent = cat.name;
      drawRing();
    }
    renderCategories();
    panel.remove();
    activeSettingsPanel = null;
  };

  // 삭제 버튼
  const delBtn = document.createElement("button");
  delBtn.className = "settings-btn btn-delete";
  delBtn.textContent = "삭제";
  delBtn.onclick = () => {
    categories = categories.filter(c => c.id !== cat.id);
    // 현재 보고 있는 카테고리가 삭제되면 기본값으로 복귀
    if (activeCategory.id === cat.id) {
      activeCategory = { ...defaultCategory };
      currentCategory.textContent = activeCategory.name;
      drawRing();
    }
    renderCategories();
    panel.remove();
    activeSettingsPanel = null;
  };

  colorWrapper.appendChild(colorInput);
  panel.appendChild(nameInput);
  panel.appendChild(colorWrapper);
  
  const btnRow = document.createElement("div");
  btnRow.className = "settings-row";
  btnRow.appendChild(saveBtn);
  btnRow.appendChild(delBtn);
  panel.appendChild(btnRow);

  parentItem.appendChild(panel);
  activeSettingsPanel = panel;
}

// 패널 외부 클릭 시 닫기
document.addEventListener("click", (e) => {
  if (activeSettingsPanel && !e.target.closest(".category-item")) {
    activeSettingsPanel.remove();
    activeSettingsPanel = null;
  }
});

/* ===============================
   Timer Logic
=============================== */
function updateTimer() {
  remainingSeconds--;
  if (remainingSeconds <= 0) {
    clearInterval(timerInterval);
    timerInterval = null;
    remainingSeconds = 0;
    canvas.classList.remove("running");
  }
  drawRing();
  renderTime();
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
    drawRing(); // 상태 변경 즉시 반영
  }
};

document.getElementById("stopBtn").onclick = () => {
  clearInterval(timerInterval);
  timerInterval = null;
  canvas.classList.remove("running");
  drawRing();
};

document.getElementById("resetBtn").onclick = () => {
  clearInterval(timerInterval);
  timerInterval = null;
  remainingSeconds = totalSeconds;
  canvas.classList.remove("running");
  drawRing();
  renderTime();
};

document.getElementById("setTimeBtn").onclick = () => {
  const minutes = Math.min(60, Math.max(1, Number(minuteInput.value)));
  totalSeconds = minutes * 60;
  remainingSeconds = totalSeconds;
  drawRing();
  renderTime();
};

/* ===============================
   Ring Visuals (Sophisticated Neon)
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

  // 진행률 (60분 기준)
  const maxFullSeconds = 3600; 
  const progress = remainingSeconds / maxFullSeconds;

  const center = size / 2;
  const radius = 95;
  const lineWidth = 18;
  const color = activeCategory ? activeCategory.color : "#FF2D55";

  // 1. 꺼진 부분 (Unlit Part) - 중요!
  // 회색(#2a2a2a) 대신, 현재 색상을 유지하되 투명도를 낮춤(Dimmed)
  // 빛이 꺼진 형광등처럼 보이게 함
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color; 
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round"; // 끝부분 둥글게
  
  // 네온이 꺼진 느낌을 위해 투명도를 낮추고 글로우 제거
  ctx.globalAlpha = 0.15; 
  ctx.shadowBlur = 0; 
  ctx.stroke();

  // 2. 켜진 부분 (Lit Part) - 에너지 충만
  if (progress > 0) {
    ctx.beginPath();
    ctx.arc(
      center,
      center,
      radius,
      -Math.PI / 2, // 12시 방향 시작
      -Math.PI / 2 + Math.PI * 2 * progress
    );
    
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round"; // 둥근 끝처리
    
    // 네온 글로우 효과
    ctx.globalAlpha = 1;
    // 러닝 중일 때와 아닐 때 글로우 강도 차이 (선택 사항, 여기선 항상 예쁘게)
    ctx.shadowBlur = 20; 
    ctx.shadowColor = color;
    
    ctx.stroke();
    
    // 3. 접점 디테일 (The Tip)
    // 에너지가 닳고 있는 끝부분에 살짝 더 밝은 하이라이트를 주어 "타오르는 심지" 느낌 연출
    // 복잡한 그라데이션 대신 심플한 덧칠로 세련됨 유지
    /*
    ctx.shadowBlur = 30; // 끝부분만 더 강한 빛
    ctx.beginPath();
    const endAngle = -Math.PI / 2 + Math.PI * 2 * progress;
    ctx.arc(center, center, radius, endAngle - 0.05, endAngle); // 아주 짧은 구간 덧칠
    ctx.stroke();
    */
  }
  
  // 리셋
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

// 초기화 실행
renderCategories();
drawRing();
renderTime();