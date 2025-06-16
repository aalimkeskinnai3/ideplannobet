import { useState, useEffect } from 'react';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  orderBy,
  where,
  onSnapshot,
  Timestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';

export const useDutyFirestore = <T extends { id: string; createdAt?: Date }>(
  collectionName: string,
  filters?: { field: string; operator: any; value: any }[]
) => {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let q = query(collection(db, collectionName), orderBy('createdAt', 'desc'));
    
    // Apply filters if provided
    if (filters && filters.length > 0) {
      filters.forEach(filter => {
        q = query(q, where(filter.field, filter.operator, filter.value));
      });
    }
    
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const items = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate?.() || new Date()
        })) as T[];
        
        setData(items);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [collectionName, JSON.stringify(filters)]);

  const add = async (item: Omit<T, 'id' | 'createdAt'>) => {
    try {
      await addDoc(collection(db, collectionName), {
        ...item,
        createdAt: Timestamp.now()
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const update = async (id: string, updates: Partial<Omit<T, 'id' | 'createdAt'>>) => {
    try {
      await updateDoc(doc(db, collectionName, id), {
        ...updates,
        updatedAt: Timestamp.now()
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteDoc(doc(db, collectionName, id));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const bulkAdd = async (items: Omit<T, 'id' | 'createdAt'>[]) => {
    try {
      const promises = items.map(item => 
        addDoc(collection(db, collectionName), {
          ...item,
          createdAt: Timestamp.now()
        })
      );
      await Promise.all(promises);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  return { data, loading, error, add, update, remove, bulkAdd };
};