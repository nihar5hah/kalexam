import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

function isConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.storageBucket &&
      firebaseConfig.messagingSenderId &&
      firebaseConfig.appId
  );
}

export function getFirebaseStorage() {
  if (!isConfigured()) {
    throw new Error("Firebase is not configured. Set NEXT_PUBLIC_FIREBASE_* environment variables.");
  }

  const app = getFirebaseApp();
  return getStorage(app);
}

export function getFirebaseApp() {
  if (!isConfigured()) {
    throw new Error("Firebase is not configured. Set NEXT_PUBLIC_FIREBASE_* environment variables.");
  }

  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}

export function getFirebaseDb() {
  return getFirestore(getFirebaseApp());
}

export function getGoogleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}
