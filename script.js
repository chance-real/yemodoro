import { auth, db } from "./firebase.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  doc,
  setDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ================= 상태 ================= */
const WORK_TIME = 25 * 60;
let timeLeft = WORK_TIME;
let timer = null;
let isRunning = false;
let currentCategoryId = null;
let sessionElapsed = 0;

let categories = [];
let logs = [];

/* ================= DOM ================= */
const els = {
  catList: document.getElementById("category-list"),
  addBtn: document.getElementById("add-category-btn"),
  play: document.getElementById("btn-play-mini"),
  reset: document.getElementById("btn-reset-mini"),
  mini: document.getElementById("mini-time-display"),
  main: document.getElementById("main-time-display"),
  total: document.getElementById("total-time"),
  today: document.getElementById("today-time"),
  ring: document.getElementById("daily-ring"),
  ringTotal: document.getElementById("daily-total"),
  title: document.getElementById("current-category-title"),
  badge: document.getElementById("user-badge")
};

/* ================= Auth ================= */
window.signup = async () => {
  const email = prompt("이메일");
  const password = prompt("비밀번호 (6자 이상)");
  await createUserWithEmailAndPassword(auth, email, password);
};

window.login = async () => {
  const email = prompt("이메일");
  const password = prompt("비밀번호");
  await signInWithEmailAndPassword(auth, email, password);
};

onAuthStateChanged(auth, async user => {
  if (!user) return;
  els.badge.innerText = user.email;

  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    ({ categories = [], logs = [] } = snap.data());
  } else {
    await setDoc(ref, { categories: [], logs: [] });
  }

  renderCategories();
  updateDashboard();
});

/* ================= Firestore 저장 ================= */
async function save() {
  if (!auth.currentUser) return;
  await setDoc(doc(db, "users", auth.currentUser.uid),
    { categories, logs },
    { merge: true }
  );
}

/* ================= 기능 ================= */
function randomColor() {
  return `hsl(${Math.random() * 360},70%,55%)`;
}

function renderCategories() {
  els.catList.innerHTML = "";
  categories.forEach(c => {
    const div = document.createElement("div");
    div.className = "menu-item" + (c.id === currentCategoryId ? " active" : "");
    div.innerHTML = `<span class="dot" style="background:${c.color}"></span>${c.name}`;
    div.onclick = () => selectCategory(c.id);
    els.catList.appendChild(div);
  });
}

function selectCategory(id) {
  currentCategoryId = id;
  const cat = categories.find(c => c.id === id);
  els.title.innerHTML = `<span class="dot" style="background:${cat.color}"></span>${cat.name}`;
  renderCategories();
}

function format(sec) {
  return `${Math.floor(sec / 3600)}시간 ${Math.floor(sec % 3600 / 60)}분`;
}

function updateDashboard() {
  const today = new Date().toISOString().split("T")[0];
  const todayLogs = logs.filter(l => l.date === today);
  const todaySec = todayLogs.reduce((a, b) => a + b.seconds, 0) + sessionElapsed;
  const totalSec = logs.reduce((a, b) => a + b.seconds, 0) + sessionElapsed;

  els.today.innerText = format(todaySec);
  els.total.innerText = format(totalSec);
  renderDailyRing(todayLogs);
}

function renderDailyRing(todayLogs) {
  const byCat = {};
  todayLogs.forEach(l => {
    byCat[l.catId] = (byCat[l.catId] || 0) + l.seconds;
  });

  let deg = 0;
  const segs = [];

  Object.entries(byCat).forEach(([id, sec]) => {
    const cat = categories.find(c => c.id == id);
    const d = sec / (24 * 3600) * 360;
    segs.push(`${cat.color} ${deg}deg ${deg + d}deg`);
    deg += d;
  });

  segs.push(`#25262b ${deg}deg 360deg`);
  els.ring.style.background = `conic-gradient(${segs.join(",")})`;
}

/* ================= 이벤트 ================= */
els.addBtn.onclick = () => {
  const name = prompt("카테고리 이름");
  if (!name) return;
  categories.push({ id: crypto.randomUUID(), name, color: randomColor() });
  save();
  renderCategories();
};

els.play.onclick = () => {
  if (!currentCategoryId || isRunning) return;
  isRunning = true;
  timer = setInterval(() => {
    timeLeft--;
    sessionElapsed++;
    if (timeLeft <= 0) {
      logs.push({
        catId: currentCategoryId,
        date: new Date().toISOString().split("T")[0],
        seconds: sessionElapsed
      });
      sessionElapsed = 0;
      timeLeft = WORK_TIME;
      save();
    }
    updateDashboard();
  }, 1000);
};

els.reset.onclick = () => {
  clearInterval(timer);
  isRunning = false;
  timeLeft = WORK_TIME;
  sessionElapsed = 0;
};
