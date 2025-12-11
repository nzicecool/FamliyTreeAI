
import { Person, TreeData } from '../types';
import { INITIAL_DATA } from '../constants';

const DB_NAME = 'FamilyTreeAI_DB';
const DB_VERSION = 1;
const STORE_NAME = 'people';

// Helper to open database
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
  });
};

export const storageService = {
  // Load all people to reconstruct the tree
  async loadTree(): Promise<TreeData> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const peopleList = request.result as Person[];
        
        // If DB is empty, seed it with initial data
        if (peopleList.length === 0) {
          this.seedData().then(resolve).catch(reject);
        } else {
          // Convert array back to Record<string, Person>
          const peopleMap: Record<string, Person> = {};
          peopleList.forEach(p => peopleMap[p.id] = p);
          
          resolve({
            rootId: '1', // In a real app, this might be stored in a separate 'meta' store
            people: peopleMap
          });
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  },

  // Save or Update a single person
  async savePerson(person: Person): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(person);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  // Seed initial data if empty
  async seedData(): Promise<TreeData> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const people = Object.values(INITIAL_DATA.people);
      let completed = 0;

      people.forEach(person => {
        store.put(person);
        completed++;
      });

      transaction.oncomplete = () => resolve(INITIAL_DATA);
      transaction.onerror = () => reject(transaction.error);
    });
  },
  
  // Clear database (helper for debugging/logout if needed)
  async clearDatabase(): Promise<void> {
      const db = await openDB();
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_NAME, 'readwrite');
          const store = transaction.objectStore(STORE_NAME);
          store.clear();
          transaction.oncomplete = () => resolve();
      });
  }
};