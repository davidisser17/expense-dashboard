import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA4ofTMXyajqL8rCC9gcqV2op5JvYXQ2xE",
  authDomain: "expense-dashboard-fc6b2.firebaseapp.com",
  projectId: "expense-dashboard-fc6b2",
  storageBucket: "expense-dashboard-fc6b2.firebasestorage.app",
  messagingSenderId: "631899575231",
  appId: "1:631899575231:web:38ad9c3ab711a589f3c70a",
  measurementId: "G-6H63JNR9YR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);