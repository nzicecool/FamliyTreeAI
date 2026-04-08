import { auth, db, googleProvider } from '../firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// User Interface
export interface User {
  id: string;
  name: string;
  email: string;
  photoUrl: string;
  role: 'user' | 'admin';
}

function buildUserProfile(firebaseUser: FirebaseUser): User {
  return {
    id: firebaseUser.uid,
    name: firebaseUser.displayName || 'Unknown User',
    email: firebaseUser.email || '',
    photoUrl: firebaseUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${firebaseUser.uid}`,
    role: 'user'
  };
}

async function getOrCreateUserProfile(firebaseUser: FirebaseUser): Promise<User> {
  const userDocRef = doc(db, 'users', firebaseUser.uid);
  const userDoc = await getDoc(userDocRef);

  if (userDoc.exists()) {
    return userDoc.data() as User;
  }

  const newUser = buildUserProfile(firebaseUser);
  await setDoc(userDocRef, newUser);
  return newUser;
}

// In a real app, this would use Firebase Auth or Google Identity Services
export const authService = {
  
  loginWithGoogle: async (): Promise<User> => {
    const result = await signInWithPopup(auth, googleProvider);
    return getOrCreateUserProfile(result.user);
  },

  logout: async (): Promise<void> => {
    await signOut(auth);
  },

  getCurrentUser: (): User | null => {
    // This is synchronous, but Firebase Auth is asynchronous.
    // We'll use onAuthStateChanged in App.tsx instead.
    return null;
  },

  onAuthStateChange: (callback: (user: User | null) => void) => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          callback(await getOrCreateUserProfile(firebaseUser));
        } catch (error) {
          console.error('Failed to resolve user profile after auth state change', error);
          callback(null);
        }
      } else {
        callback(null);
      }
    });
  }
};
