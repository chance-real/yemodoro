import { auth, db, googleProvider } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =====================
   DOM
===================== */
const modal = document.getElementById("loginModal");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userLabel = document.getElementById("userLabel");

const email = document.getElementById("email");
const password = document.getElementById("password");
const emailLogin = document.getElementById("emailLogin");
const emailSignup = document.getElementById("emailSignup");
const googleLogin = document.getElementById("googleLogin");

const totalTimeEl = document.getElementById("totalTime");

/* =====================
   상태
===================== */
let data = {
  totalMinutes: 0
};

/* =====================
   Guest 사용 가능
===================== */
function render() {
  totalTimeEl.textContent =
    `${Math.floor(data.totalMinutes / 60)}시간 ${data.totalMinutes % 60}분`;
}

render();

/* =====================
   UI
===================== */
loginBtn.onclick = () => modal.classList.remove("hidden");
modal.onclick = e => {
  if (e.target === modal) modal.classList.add("hidden");
};

logoutBtn.onclick = async () => {
  await signOut(auth);
};

/* =====================
   Auth
===================== */
emailLogin.onclick = async () => {
  await signInWithEmailAndPassword(auth, email.value, password.value);
};

emailSignup.onclick = async () => {
  await createUserWithEmailAndPassword(auth, email.value, password.value);
};

googleLogin.onclick = async () => {
  await signInWithPopup(auth, googleProvider);
};

/* =====================
   로그인 상태 감지
===================== */
onAuthStateChanged(auth, async user => {
  if (!user) {
    userLabel.textContent = "Guest";
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    return;
  }

  modal.classList.add("hidden");
  loginBtn.classList.add("hidden");
  logoutBtn.classList.remove("hidden");
  userLabel.textContent = user.email || "Google User";

  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    data = snap.data();
  } else {
    await setDoc(ref, data);
  }

  render();
});
