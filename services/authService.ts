import { auth, db, googleProvider } from '../firebase';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// User Interface
export interface User {
  id: string;
  name: string;
  email: string;
  photoUrl: string;
  role: 'user' | 'admin';
}

// In a real app, this would use Firebase Auth or Google Identity Services
export const authService = {
  
  loginWithGoogle: async (): Promise<User> => {
    const result = await signInWithPopup(auth, googleProvider);
    const firebaseUser = result.user;
    
    // Check if user exists in Firestore
    const userDocRef = doc(db, 'users', firebaseUser.uid);
    const userDoc = await getDoc(userDocRef);
    
    if (!userDoc.exists()) {
      // Create new user profile
      const newUser: User = {
        id: firebaseUser.uid,
        name: firebaseUser.displayName || 'Unknown User',
        email: firebaseUser.email || '',
        photoUrl: firebaseUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${firebaseUser.uid}`,
        role: 'user'
      };
      await setDoc(userDocRef, newUser);
      return newUser;
    }
    
    return userDoc.data() as User;
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
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          callback(userDoc.data() as User);
        } else {
          // This case should be handled by loginWithGoogle, but just in case:
          callback(null);
        }
      } else {
        callback(null);
      }
    });
  }
};
