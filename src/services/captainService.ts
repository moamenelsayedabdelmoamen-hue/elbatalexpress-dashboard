import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db, isFirebaseConfigured, handleFirestoreError, OperationType } from '../firebase/config';
import { COLLECTIONS } from './collections';
import { Captain, CaptainStatus } from '../types';
import { extractCoordinates } from '../utils/geoUtils';

let localCaptainsCache: Captain[] = [];

function formatFirestoreDate(val: any): string {
  if (!val) return '';
  if (typeof val?.toDate === 'function') {
    return val.toDate().toISOString();
  }
  if (typeof val === 'object' && typeof val.seconds === 'number') {
    return new Date(val.seconds * 1000).toISOString();
  }
  return String(val);
}

function mapDocToCaptain(id: string, data: Record<string, any>): Captain {
  const profileImage =
    data.profileImage ||
    data.profileImageUrl ||
    data.photoURL ||
    data.photoUrl ||
    data.avatar ||
    data.image ||
    data.imageUrl ||
    data.personalPhoto ||
    data.captainImage ||
    data.photo ||
    data.picture ||
    data.userImage ||
    '';

  const email =
    data.email ||
    data.captainEmail ||
    data.userEmail ||
    data.contactEmail ||
    '';

  const password =
    data.password ||
    data.captainPassword ||
    data.userPassword ||
    data.pass ||
    data.pin ||
    '';

  const rawStatus = (data.status as CaptainStatus) || (data.isOnline ? 'online' : 'offline');

  // Determine whether captain is allowed to receive orders
  let canReceiveOrders = true;
  if (typeof data.canReceiveOrders === 'boolean') {
    canReceiveOrders = data.canReceiveOrders;
  } else if (typeof data.isReceivingOrders === 'boolean') {
    canReceiveOrders = data.isReceivingOrders;
  } else if (typeof data.receiveOrders === 'boolean') {
    canReceiveOrders = data.receiveOrders;
  } else if (data.isBlocked === true || data.isSuspended === true || data.orderReceptionDisabled === true) {
    canReceiveOrders = false;
  }

  const createdAt = formatFirestoreDate(data.createdAt) || new Date().toISOString();
  const updatedAt = formatFirestoreDate(data.updatedAt) || createdAt;
  const statusUpdatedAt =
    formatFirestoreDate(data.statusUpdatedAt || data.lastStatusUpdate || data.updatedAt || data.createdAt) ||
    createdAt;

  const coords = extractCoordinates(data);

  return {
    id,
    name: data.name || data.fullName || data.displayName || 'كابتن بدون اسم',
    phone: data.phone || data.phoneNumber || data.mobile || '—',
    email: email || '—',
    password: password ? String(password) : '',
    profileImage,
    photoURL: profileImage,
    status: rawStatus,
    isOnline: Boolean(data.isOnline ?? rawStatus === 'online'),
    canReceiveOrders,
    ordersCount:
      typeof data.ordersCount === 'number'
        ? data.ordersCount
        : typeof data.totalDeliveries === 'number'
        ? data.totalDeliveries
        : typeof data.completedOrders === 'number'
        ? data.completedOrders
        : 0,
    rating: typeof data.rating === 'number' ? data.rating : 5.0,
    createdAt,
    updatedAt,
    statusUpdatedAt,
    vehicleType: data.vehicleType || data.vehicle || 'دراجة نارية',
    location: data.location || data.coordinates || data.coords,
    coords,
    lastLocationUpdate: data.lastLocationUpdate || data.lastUpdate || data.updatedAt,
    raw: data,
  };
}

export const CaptainService = {
  async getAll(): Promise<{ data: Captain[]; isLive: boolean }> {
    if (!isFirebaseConfigured) {
      return { data: localCaptainsCache, isLive: false };
    }

    try {
      const q = query(collection(db, COLLECTIONS.CAPTAINS), orderBy('name', 'asc'));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        localCaptainsCache = [];
        return { data: [], isLive: true };
      }

      const list: Captain[] = [];
      snapshot.forEach((docSnap) => {
        list.push(mapDocToCaptain(docSnap.id, docSnap.data()));
      });

      localCaptainsCache = list;
      return { data: list, isLive: true };
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTIONS.CAPTAINS);
      return { data: localCaptainsCache, isLive: false };
    }
  },

  async updateStatus(id: string, status: CaptainStatus): Promise<void> {
    const nowIso = new Date().toISOString();
    localCaptainsCache = localCaptainsCache.map((c) =>
      c.id === id ? { ...c, status, isOnline: status === 'online', statusUpdatedAt: nowIso } : c
    );

    if (isFirebaseConfigured) {
      try {
        const docRef = doc(db, COLLECTIONS.CAPTAINS, id);
        await updateDoc(docRef, {
          status,
          isOnline: status === 'online',
          statusUpdatedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `${COLLECTIONS.CAPTAINS}/${id}`);
      }
    }
  },

  async toggleOrderReception(id: string, canReceiveOrders: boolean): Promise<void> {
    const nowIso = new Date().toISOString();
    const newStatus: CaptainStatus = canReceiveOrders ? 'online' : 'offline';

    localCaptainsCache = localCaptainsCache.map((c) =>
      c.id === id
        ? {
            ...c,
            canReceiveOrders,
            status: newStatus,
            isOnline: canReceiveOrders,
            statusUpdatedAt: nowIso,
          }
        : c
    );

    if (isFirebaseConfigured) {
      try {
        const docRef = doc(db, COLLECTIONS.CAPTAINS, id);
        await updateDoc(docRef, {
          canReceiveOrders,
          isReceivingOrders: canReceiveOrders,
          receiveOrders: canReceiveOrders,
          isBlocked: !canReceiveOrders,
          status: newStatus,
          isOnline: canReceiveOrders,
          statusUpdatedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `${COLLECTIONS.CAPTAINS}/${id}`);
        throw error;
      }
    }
  },

  async updatePassword(id: string, newPassword: string): Promise<void> {
    const nowIso = new Date().toISOString();
    localCaptainsCache = localCaptainsCache.map((c) =>
      c.id === id ? { ...c, password: newPassword, updatedAt: nowIso } : c
    );

    if (isFirebaseConfigured) {
      try {
        const docRef = doc(db, COLLECTIONS.CAPTAINS, id);
        await updateDoc(docRef, {
          password: newPassword,
          captainPassword: newPassword,
          updatedAt: serverTimestamp(),
        });

        // Also sync to users collection if a corresponding user profile document exists
        try {
          const userDocRef = doc(db, COLLECTIONS.USERS, id);
          const userSnap = await getDoc(userDocRef);
          if (userSnap.exists()) {
            await updateDoc(userDocRef, {
              password: newPassword,
              updatedAt: serverTimestamp(),
            });
          }
        } catch {
          // Ignore if users doc doesn't exist
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `${COLLECTIONS.CAPTAINS}/${id}`);
        throw error;
      }
    }
  },

  async updateCaptain(id: string, updates: Partial<Captain>): Promise<void> {
    const nowIso = new Date().toISOString();
    localCaptainsCache = localCaptainsCache.map((c) =>
      c.id === id ? { ...c, ...updates, updatedAt: nowIso } : c
    );

    if (isFirebaseConfigured) {
      try {
        const docRef = doc(db, COLLECTIONS.CAPTAINS, id);
        const payload: Record<string, any> = {
          updatedAt: serverTimestamp(),
        };

        if (updates.name !== undefined) payload.name = updates.name;
        if (updates.phone !== undefined) payload.phone = updates.phone;
        if (updates.email !== undefined) payload.email = updates.email;
        if (updates.vehicleType !== undefined) payload.vehicleType = updates.vehicleType;
        if (updates.password !== undefined) {
          payload.password = updates.password;
          payload.captainPassword = updates.password;
        }
        if (updates.profileImage !== undefined) {
          payload.profileImage = updates.profileImage;
          payload.photoURL = updates.profileImage;
        }
        if (updates.status !== undefined) {
          payload.status = updates.status;
          payload.isOnline = updates.status === 'online';
          payload.statusUpdatedAt = serverTimestamp();
        }
        if (updates.canReceiveOrders !== undefined) {
          payload.canReceiveOrders = updates.canReceiveOrders;
          payload.isReceivingOrders = updates.canReceiveOrders;
          payload.receiveOrders = updates.canReceiveOrders;
          payload.isBlocked = !updates.canReceiveOrders;
          payload.statusUpdatedAt = serverTimestamp();
        }

        await updateDoc(docRef, payload);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `${COLLECTIONS.CAPTAINS}/${id}`);
        throw error;
      }
    }
  },

  async create(data: Omit<Captain, 'id'>): Promise<Captain> {
    const newId = `capt_${Date.now()}`;
    const nowIso = new Date().toISOString();
    const canReceive = data.canReceiveOrders !== undefined ? data.canReceiveOrders : data.status !== 'offline';

    const newCaptain: Captain = {
      ...data,
      id: newId,
      canReceiveOrders: canReceive,
      createdAt: nowIso,
      updatedAt: nowIso,
      statusUpdatedAt: nowIso,
    };

    localCaptainsCache = [newCaptain, ...localCaptainsCache];

    if (isFirebaseConfigured) {
      try {
        const docRef = doc(db, COLLECTIONS.CAPTAINS, newId);
        await setDoc(docRef, {
          name: data.name,
          phone: data.phone,
          email: data.email || '',
          password: data.password || '',
          captainPassword: data.password || '',
          profileImage: data.profileImage || '',
          photoURL: data.profileImage || '',
          status: data.status,
          isOnline: data.status === 'online',
          canReceiveOrders: canReceive,
          isReceivingOrders: canReceive,
          receiveOrders: canReceive,
          isBlocked: !canReceive,
          ordersCount: data.ordersCount || 0,
          rating: data.rating || 5.0,
          vehicleType: data.vehicleType || 'دراجة نارية',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          statusUpdatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `${COLLECTIONS.CAPTAINS}/${newId}`);
      }
    }

    return newCaptain;
  },

  async delete(id: string): Promise<void> {
    localCaptainsCache = localCaptainsCache.filter((c) => c.id !== id);

    if (isFirebaseConfigured) {
      try {
        const docRef = doc(db, COLLECTIONS.CAPTAINS, id);
        await deleteDoc(docRef);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `${COLLECTIONS.CAPTAINS}/${id}`);
      }
    }
  },
};
