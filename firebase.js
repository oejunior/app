// firebase.js
// Inicializa Firebase (Auth + Firestore). Cole seu firebaseConfig.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// Cole aqui (Firebase Console -> Project settings -> Web app -> firebaseConfig)
export const firebaseConfig = {
 apiKey: "AIzaSyCY9SuOi5l-m0IQo4sXqh76P3FWqRdRbVw",
    authDomain: "docceapp.firebaseapp.com",
    projectId: "docceapp",
    storageBucket: "docceapp.firebasestorage.app",
    messagingSenderId: "298918875800",
    appId: "1:298918875800:web:fe022c386ff49eada276ed",
    measurementId: "G-4ZVMQJ74B3"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const fs = {
  doc, getDoc, addDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, limit, getDocs,
  serverTimestamp, Timestamp
};

export const fa = {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
};
