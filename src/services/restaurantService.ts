import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db, isFirebaseConfigured, handleFirestoreError, OperationType } from '../firebase/config';
import { COLLECTIONS } from './collections';
import { Restaurant, SubscriptionStatus } from '../types';
import { extractCoordinates } from '../utils/geoUtils';

// Local cache for real data fetched from Firestore
let localRestaurantsCache: Restaurant[] = [];

function formatTimestamp(val: any): string {
  if (!val) return new Date().toISOString();
  if (typeof val?.toDate === 'function') {
    return val.toDate().toISOString();
  }
  if (typeof val === 'object' && typeof val.seconds === 'number') {
    return new Date(val.seconds * 1000).toISOString();
  }
  return String(val);
}

function mapDocToRestaurant(id: string, data: Record<string, any>): Restaurant {
  const logo =
    data.logo ||
    data.logoUrl ||
    data.logoURL ||
    data.image ||
    data.imageUrl ||
    data.imageURL ||
    data.photoURL ||
    data.photoUrl ||
    data.avatar ||
    data.icon ||
    data.merchantLogo ||
    '';

  const ownerEmail =
    data.ownerEmail ||
    data.email ||
    data.merchantEmail ||
    data.userEmail ||
    data.contactEmail ||
    '';

  const coords = extractCoordinates(data);

  return {
    id,
    name: data.name || data.nameAr || data.merchantName || data.restaurantName || data.title || 'بدون اسم',
    category: data.category || data.cuisine || data.type || 'عام',
    phone: data.phone || data.phoneNumber || data.contact || '—',
    rating: typeof data.rating === 'number' ? data.rating : (typeof data.stars === 'number' ? data.stars : 5.0),
    subscriptionStatus:
      (data.subscriptionStatus as SubscriptionStatus) ||
      (data.subscription?.status as SubscriptionStatus) ||
      'Active',
    isActive: typeof data.isActive === 'boolean' ? data.isActive : (data.status === 'active' || data.status === 'نشط'),
    createdAt: formatTimestamp(data.createdAt || data.registeredAt || data.updatedAt),
    address: data.address || data.locationAddress || data.addressAr || (typeof data.location === 'string' ? data.location : '—'),
    ownerEmail: ownerEmail || '—',
    logo,
    image: logo,
    location: data.location || data.coordinates || data.coords,
    coords,
    raw: data,
  };
}

export const RestaurantService = {
  async getAll(): Promise<{ data: Restaurant[]; isLive: boolean }> {
    if (!isFirebaseConfigured) {
      return { data: localRestaurantsCache, isLive: false };
    }

    try {
      const q = query(collection(db, COLLECTIONS.RESTAURANTS), orderBy('name', 'asc'));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        localRestaurantsCache = [];
        return { data: [], isLive: true };
      }

      const list: Restaurant[] = [];
      snapshot.forEach((docSnap) => {
        list.push(mapDocToRestaurant(docSnap.id, docSnap.data()));
      });

      localRestaurantsCache = list;
      return { data: list, isLive: true };
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTIONS.RESTAURANTS);
      return { data: localRestaurantsCache, isLive: false };
    }
  },

  async getById(id: string): Promise<Restaurant | null> {
    if (!isFirebaseConfigured) {
      return localRestaurantsCache.find((r) => r.id === id) || null;
    }

    try {
      const docRef = doc(db, COLLECTIONS.RESTAURANTS, id);
      const snap = await getDoc(docRef);
      if (!snap.exists()) {
        return localRestaurantsCache.find((r) => r.id === id) || null;
      }
      return mapDocToRestaurant(snap.id, snap.data());
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${COLLECTIONS.RESTAURANTS}/${id}`);
      return localRestaurantsCache.find((r) => r.id === id) || null;
    }
  },

  async toggleActive(id: string, currentStatus: boolean): Promise<boolean> {
    const newStatus = !currentStatus;

    localRestaurantsCache = localRestaurantsCache.map((r) =>
      r.id === id ? { ...r, isActive: newStatus } : r
    );

    if (isFirebaseConfigured) {
      try {
        const docRef = doc(db, COLLECTIONS.RESTAURANTS, id);
        await updateDoc(docRef, {
          isActive: newStatus,
          status: newStatus ? 'active' : 'inactive',
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `${COLLECTIONS.RESTAURANTS}/${id}`);
      }
    }
    return newStatus;
  },

  async update(id: string, updates: Partial<Restaurant>): Promise<void> {
    localRestaurantsCache = localRestaurantsCache.map((r) =>
      r.id === id ? { ...r, ...updates } : r
    );

    if (isFirebaseConfigured) {
      try {
        const docRef = doc(db, COLLECTIONS.RESTAURANTS, id);
        const payload: Record<string, any> = {
          updatedAt: serverTimestamp(),
        };
        if (updates.name !== undefined) payload.name = updates.name;
        if (updates.category !== undefined) payload.category = updates.category;
        if (updates.phone !== undefined) payload.phone = updates.phone;
        if (updates.address !== undefined) payload.address = updates.address;
        if (updates.subscriptionStatus !== undefined) payload.subscriptionStatus = updates.subscriptionStatus;
        if (updates.ownerEmail !== undefined) {
          payload.ownerEmail = updates.ownerEmail;
          payload.email = updates.ownerEmail;
        }
        if (updates.logo !== undefined) {
          payload.logo = updates.logo;
          payload.image = updates.logo;
        }

        await updateDoc(docRef, payload);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `${COLLECTIONS.RESTAURANTS}/${id}`);
      }
    }
  },

  async create(data: Omit<Restaurant, 'id'>): Promise<Restaurant> {
    const newId = `rest_${Date.now()}`;
    const newRestaurant: Restaurant = {
      ...data,
      id: newId,
      createdAt: new Date().toISOString(),
    };

    localRestaurantsCache = [newRestaurant, ...localRestaurantsCache];

    if (isFirebaseConfigured) {
      try {
        const docRef = doc(db, COLLECTIONS.RESTAURANTS, newId);
        await setDoc(docRef, {
          name: data.name,
          category: data.category || 'عام',
          phone: data.phone || '',
          ownerEmail: data.ownerEmail || '',
          email: data.ownerEmail || '',
          logo: data.logo || '',
          image: data.logo || '',
          rating: data.rating || 5.0,
          subscriptionStatus: data.subscriptionStatus || 'Active',
          isActive: data.isActive,
          address: data.address || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `${COLLECTIONS.RESTAURANTS}/${newId}`);
      }
    }

    return newRestaurant;
  },

  async delete(id: string): Promise<void> {
    localRestaurantsCache = localRestaurantsCache.filter((r) => r.id !== id);

    if (isFirebaseConfigured) {
      try {
        const docRef = doc(db, COLLECTIONS.RESTAURANTS, id);
        await deleteDoc(docRef);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `${COLLECTIONS.RESTAURANTS}/${id}`);
      }
    }
  },
};
