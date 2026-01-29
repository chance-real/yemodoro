// ===============================
// Firebase imports
// ===============================
import { auth, googleProvider } from "./firebase.js";
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ===============================
// DOM 요소
// ===============================
const loginModal = document.getElementById("loginModal");
const loginBtn = document.getElementById("loginBtn");
const closeModal = document.getElementById("closeModal");
const googleLoginBtn = document.getElementById("googleLogin");
const logoutBtn = document.getElementById("logoutBtn");
const userLabel = document.getElementById("userLabel");

// ===============================
// 초기 상태
// ===============================
loginModal.classList.add("hidden");

// ===============================
// 로그인 모달 열기 / 닫기
// ===============================
loginBtn.onclick = () => {
  loginModal.classList.remove("hidden");
};

closeModal.onclick = () => {
  loginModal.classList.add("hidden");
};

// ===============================
// Google 로그인
// ===============================
googleLoginBtn.onclick = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    console.log("로그인 성공:", result.user);
    loginModal.classList.add("hidden");
  } catch (err) {
    console.error(err);
    alert(err.message);
  }
};

// ===============================
// 로그아웃
// ===============================
logoutBtn.onclick = async () => {
  await signOut(auth);
};

// ===============================
// 로그인 상태 변화 감지 (UI 반영만)
// ===============================
onAuthStateChanged(auth, (user) => {
  if (user) {
    userLabel.textContent = user.displayName || "User";
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
  } else {
    userLabel.textContent = "Guest";
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
  }
});
