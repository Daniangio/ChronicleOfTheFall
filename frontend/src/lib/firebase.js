import { getApp, getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onIdTokenChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
};

const requiredConfigKeys = ["apiKey", "authDomain", "projectId", "appId"];

const missingConfigKeys = requiredConfigKeys.filter((key) => !firebaseConfig[key]);

const getFirebaseAuth = () => {
  if (missingConfigKeys.length > 0) {
    throw new Error(
      `Missing Firebase environment configuration: ${missingConfigKeys.join(", ")}`
    );
  }

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  return getAuth(app);
};

export const ensureFirebasePersistence = async () => {
  const auth = getFirebaseAuth();
  await setPersistence(auth, browserLocalPersistence);
  return auth;
};

export const subscribeToIdTokenChanges = (callback) =>
  onIdTokenChanged(getFirebaseAuth(), callback);

export const signInWithEmail = (email, password) =>
  signInWithEmailAndPassword(getFirebaseAuth(), email, password);

export const signUpWithEmail = (email, password) =>
  createUserWithEmailAndPassword(getFirebaseAuth(), email, password);

export const signOutFirebase = () => signOut(getFirebaseAuth());
