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

let data = {
  totalMinutes: 0
};

const modal = document.getElementById("loginModal");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userLabel = document.getElementById("userLabel");

loginBtn.onclick = () => modal.classList.remove("hidden");

logoutBtn.onclick = async () => {
  await signOut(auth);
};

emailLogin.onclick = async () => {
  await signInWithEmailAndPassword(auth, email.value, password.value);
};

emailSignup.onclick = async () => {
  await createUserWithEmailAndPassword(auth, email.value, password.value);
};

googleLogin.onclick = async () => {
  await signInWithPopup(auth, googleProvider);
};

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

  document.getElementById("totalTime").textContent =
    `${Math.floor(data.totalMinutes / 60)}시간 ${data.totalMinutes % 60}분`;
});
