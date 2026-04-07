import { db, auth } from '../firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  query, 
  onSnapshot,
  getDocFromServer
} from 'firebase/firestore';
import { Person, TreeData } from '../types';
import { INITIAL_DATA } from '../constants';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const storageService = {
  // Load all people to reconstruct the tree
  async loadTree(): Promise<TreeData> {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error("User not authenticated");

    const path = `users/${userId}/people`;
    try {
      const q = query(collection(db, path));
      const querySnapshot = await getDocs(q);
      const peopleMap: Record<string, Person> = {};
      
      querySnapshot.forEach((doc) => {
        peopleMap[doc.id] = doc.data() as Person;
      });

      // If empty, seed with initial data
      if (Object.keys(peopleMap).length === 0) {
        return this.seedData(userId);
      }

      // Load meta for rootId
      const metaPath = `users/${userId}/meta/tree`;
      const metaDoc = await getDoc(doc(db, metaPath));
      const rootId = metaDoc.exists() ? metaDoc.data().rootId : Object.keys(peopleMap)[0];

      return {
        rootId,
        people: peopleMap
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return { rootId: '', people: {} }; // Unreachable due to throw
    }
  },

  // Save or Update a single person
  async savePerson(person: Person): Promise<void> {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error("User not authenticated");

    const path = `users/${userId}/people/${person.id}`;
    try {
      await setDoc(doc(db, `users/${userId}/people`, person.id), person);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  // Delete a person
  async deletePerson(id: string): Promise<void> {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error("User not authenticated");

    const path = `users/${userId}/people/${id}`;
    try {
      await deleteDoc(doc(db, `users/${userId}/people`, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  // Save tree metadata
  async saveTreeMeta(rootId: string): Promise<void> {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error("User not authenticated");

    const path = `users/${userId}/meta/tree`;
    try {
      await setDoc(doc(db, path), { rootId });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  // Seed initial data if empty
  async seedData(userId: string): Promise<TreeData> {
    const people = Object.values(INITIAL_DATA.people);
    for (const person of people) {
      await this.savePerson(person);
    }
    await this.saveTreeMeta(INITIAL_DATA.rootId);
    return INITIAL_DATA;
  },

  // Validate connection
  async testConnection() {
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
    } catch (error) {
      if (error instanceof Error && error.message.includes('the client is offline')) {
        console.error("Please check your Firebase configuration.");
      }
    }
  }
};
