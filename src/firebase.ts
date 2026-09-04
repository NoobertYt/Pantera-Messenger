import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getAnalytics, isSupported, Analytics } from "firebase/analytics";

// User provided Firebase configuration
export const firebaseConfig = {
  apiKey: "AIzaSyCcaRsyPSMvuNrHPEqEwg_kajoLhlvsv2M",
  authDomain: "kotogram-c360f.firebaseapp.com",
  projectId: "kotogram-c360f",
  storageBucket: "kotogram-c360f.firebasestorage.app",
  messagingSenderId: "239052405176",
  appId: "1:239052405176:web:bcf298e9bb2a946906774d",
  measurementId: "G-GQN558YHP6"
};

let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);

export let analytics: Analytics | null = null;
if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  }).catch(() => {
    // Analytics optional in restricted iframe environments
  });
}

export default app;
