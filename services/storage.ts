
import { openDB, DBSchema } from 'idb';
import { StudentProcessedData } from '../types';

const DB_NAME = 'laosun_edu_db_v4';
const STORE_NAME = 'students';

interface EduDB extends DBSchema {
  [STORE_NAME]: {
    key: string;
    value: StudentProcessedData;
  };
}

// Initialize the Database
export const initDB = async () => {
  return openDB<EduDB>(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    },
  });
};

// Get all students
export const getAllStudents = async (): Promise<StudentProcessedData[]> => {
  try {
    const db = await initDB();
    return await db.getAll(STORE_NAME);
  } catch (error) {
    console.error('Failed to get students from DB:', error);
    return [];
  }
};

// Save all students (Overwrite strategy to sync with App state)
export const saveAllStudents = async (students: StudentProcessedData[]) => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  
  // Clear existing data to ensure deleted items are removed
  // IndexedDB is fast enough to handle bulk writes for this use case
  await store.clear();
  
  for (const student of students) {
    await store.put(student);
  }
  
  await tx.done;
};

// Clear the entire database
export const clearDatabase = async () => {
  const db = await initDB();
  await db.clear(STORE_NAME);
};
