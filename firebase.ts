import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

let app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

try {
  if (firebaseConfig && firebaseConfig.apiKey) {
    app = initializeApp(firebaseConfig);
    _auth = getAuth(app);
    _db = firebaseConfig.firestoreDatabaseId
      ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
      : getFirestore(app);
  } else {
    console.warn('Firebase client config is missing apiKey; client SDK disabled.');
  }
} catch (err) {
  console.error('Failed to initialize Firebase client SDK:', err);
}

export const auth = _auth as Auth;
export const db = _db as Firestore;
export const googleProvider = new GoogleAuthProvider();
