// Firebase 설정 파일
import { initializeApp } from 'firebase/app';
import { getAuth, indexedDBLocalPersistence, initializeAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import { Capacitor } from '@capacitor/core';

const firebaseConfig = {
    apiKey: "AIzaSyBbpprm6wI3N23HzAQXDo8gfIMPzgHm2Ic",
    authDomain: "todolist-share.firebaseapp.com",
    databaseURL: "https://todolist-share-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "todolist-share",
    storageBucket: "todolist-share.firebasestorage.app",
    messagingSenderId: "865182648003",
    appId: "1:865182648003:web:b8def5d731e1ea928bc476",
    measurementId: "G-EP2Z17K5N5",
};

const app = initializeApp(firebaseConfig);

// 네이티브 앱(Capacitor)에서는 indexedDBLocalPersistence 사용
// 웹 브라우저에서는 기본 getAuth 사용
let auth;
if (Capacitor.isNativePlatform()) {
    auth = initializeAuth(app, {
        persistence: indexedDBLocalPersistence,
    });
} else {
    auth = getAuth(app);
}

export { auth };
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'asia-northeast3');
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/calendar');

export default app;
