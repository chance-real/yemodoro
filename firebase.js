import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD5VpW761mxWL3VKce6p7j-h9MHfc6Fi-A",
  authDomain: "yemodoro.firebaseapp.com",
  projectId: "yemodoro",
  storageBucket: "yemodoro.firebasestorage.app",
  messagingSenderId: "1025081764810",
  appId: "1:1025081764810:web:874c773c1eeddec02d7d33",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
// ✅ 데이터베이스 추가
export const db = getFirestore(app);