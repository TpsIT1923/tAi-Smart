import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyA0mfMLrUUat7jUsgMKztD_tIBs299sQLI",
    authDomain: "tps-taismart-adminportal.firebaseapp.com",
    projectId: "tps-taismart-adminportal",
    storageBucket: "tps-taismart-adminportal.firebasestorage.app",
    messagingSenderId: "249406780089",
    appId: "1:249406780089:web:842d66ccb1163d94212168",
    measurementId: "G-3H6E14YSMZ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({ prompt: 'select_account' });

export { 
    auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged,
    collection, doc, setDoc, deleteDoc, onSnapshot
};