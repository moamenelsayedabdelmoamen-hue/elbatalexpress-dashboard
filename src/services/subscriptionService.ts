import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, isFirebaseConfigured, handleFirestoreError, OperationType } from '../firebase/config';
import { COLLECTIONS, SUBSCRIPTION_PLANS } from './collections';
import { Subscription, SubscriptionStatus } from '../types';

let localSubscriptionsCache: Subscription[] = [];

export const OFFICIAL_PACKAGES = [
  { captainsCount: 2, price: 400, label: '2 كابتن - 400 جنيه' },
  { captainsCount: 4, price: 800, label: '4 كابتن - 800 جنيه' },
  { captainsCount: 6, price: 1200, label: '6 كابتن - 1200 جنيه' },
  { captainsCount: 8, price: 1600, label: '8 كابتن - 1600 جنيه' },
] as const;

function parseFirestoreDateToYMD(val: any): string {
  if (!val) return '';
  try {
    if (typeof val?.toDate === 'function') {
      return val.toDate().toISOString().split('T')[0];
    }
    if (typeof val === 'object' && typeof val.seconds === 'number') {
      return new Date(val.seconds * 1000).toISOString().split('T')[0];
    }
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
      }
    }
    if (typeof val === 'number') {
      return new Date(val).toISOString().split('T')[0];
    }
  } catch {
    // ignore
  }
  return '';
}

function addDaysToYMD(ymd: string, days: number): string {
  try {
    const base = ymd ? new Date(ymd) : new Date();
    if (isNaN(base.getTime())) {
      return new Date(Date.now() + days * 86400000).toISOString().split('T')[0];
    }
    base.setDate(base.getDate() + days);
    return base.toISOString().split('T')[0];
  } catch {
    return new Date(Date.now() + days * 86400000).toISOString().split('T')[0];
  }
}

function normalizePlanAndPrice(data: Record<string, any>): {
  captainsCount: number;
  price: number;
  plan: string;
} {
  const subObj = typeof data.subscription === 'object' && data.subscription ? data.subscription : {};
  let captainsCount =
    Number(
      data.captainsCount ??
        subObj.captainsCount ??
        data.maxCaptains ??
        data.allowedCaptains ??
        0
    ) || 0;

  let price =
    Number(
      data.price ??
        data.subscriptionPrice ??
        subObj.price ??
        subObj.amount ??
        data.amount ??
        0
    ) || 0;

  const rawPlanStr = String(data.plan || data.subscriptionPlan || subObj.plan || '');

  if (!captainsCount) {
    if (rawPlanStr.includes('8') || price === 1600) captainsCount = 8;
    else if (rawPlanStr.includes('6') || price === 1200) captainsCount = 6;
    else if (rawPlanStr.includes('4') || price === 800) captainsCount = 4;
    else captainsCount = 2;
  }

  // Match with the 4 official packages: 2->400, 4->800, 6->1200, 8->1600
  const matchedPkg = OFFICIAL_PACKAGES.find((p) => p.captainsCount === captainsCount);
  if (!price && matchedPkg) {
    price = matchedPkg.price;
  } else if (matchedPkg && (price === 600 || price === 700 || price === 1000)) {
    // Upgrade legacy default prices to the current official package prices
    price = matchedPkg.price;
  }

  const planLabel = matchedPkg
    ? matchedPkg.label
    : rawPlanStr || `${captainsCount} كابتن - ${price} جنيه`;

  return {
    captainsCount,
    price: price || 400,
    plan: planLabel,
  };
}

function normalizeStatus(rawStatus: any, endDateYMD?: string, isActiveMerchant?: boolean): SubscriptionStatus {
  const s = String(rawStatus || '').trim();
  if (s === 'Active' || s === 'active' || s === 'نشط' || s === 'ساري') {
    if (endDateYMD && endDateYMD < new Date().toISOString().split('T')[0]) {
      return 'Expired';
    }
    return 'Active';
  }
  if (s === 'Pending' || s === 'pending' || s === 'معلق' || s === 'قيد الانتظار') return 'Pending';
  if (s === 'Expired' || s === 'expired' || s === 'منتهي') return 'Expired';
  if (s === 'Suspended' || s === 'suspended' || s === 'موقوف' || s === 'inactive') return 'Suspended';

  if (isActiveMerchant === false) return 'Suspended';
  if (endDateYMD && endDateYMD < new Date().toISOString().split('T')[0]) return 'Expired';
  return 'Active';
}

function mapDocToSubscription(
  id: string,
  data: Record<string, any>,
  merchantDoc?: { id: string; data: Record<string, any> }
): Subscription {
  const mData = merchantDoc?.data || {};
  const subObj = typeof data.subscription === 'object' && data.subscription ? data.subscription : {};
  const mSubObj = typeof mData.subscription === 'object' && mData.subscription ? mData.subscription : {};

  const restaurantId =
    data.restaurantId ||
    data.merchantId ||
    data.restaurant?.id ||
    merchantDoc?.id ||
    id;

  const restaurantName =
    data.restaurantName ||
    data.merchantName ||
    data.restaurant?.name ||
    mData.name ||
    mData.nameAr ||
    mData.merchantName ||
    mData.restaurantName ||
    'تاجر غير محدد';

  const merchantLogo =
    data.merchantLogo ||
    data.logo ||
    mData.logo ||
    mData.logoUrl ||
    mData.image ||
    mData.photoURL ||
    '';

  const merchantPhone = data.merchantPhone || data.phone || mData.phone || mData.phoneNumber || '';
  const merchantEmail = data.merchantEmail || data.email || mData.ownerEmail || mData.email || '';

  const combinedData = { ...mSubObj, ...mData, ...subObj, ...data };
  const { captainsCount, price, plan } = normalizePlanAndPrice(combinedData);

  const startDate =
    parseFirestoreDateToYMD(
      data.startDate ||
        data.subscriptionStartDate ||
        subObj.startDate ||
        mData.subscriptionStartDate ||
        mData.startDate ||
        mSubObj.startDate ||
        data.createdAt ||
        mData.createdAt
    ) || new Date().toISOString().split('T')[0];

  const endDate =
    parseFirestoreDateToYMD(
      data.endDate ||
        data.subscriptionEndDate ||
        data.expiryDate ||
        data.expiresAt ||
        subObj.endDate ||
        subObj.expiresAt ||
        mData.subscriptionEndDate ||
        mData.endDate ||
        mData.expiryDate ||
        mData.expiresAt ||
        mSubObj.endDate ||
        mSubObj.expiresAt
    ) || addDaysToYMD(startDate, 30);

  const rawStatus =
    data.status ||
    data.subscriptionStatus ||
    subObj.status ||
    mData.subscriptionStatus ||
    mSubObj.status;

  const isActiveMerchant =
    typeof mData.isActive === 'boolean' ? mData.isActive : undefined;

  const status = normalizeStatus(rawStatus, endDate, isActiveMerchant);

  return {
    id,
    restaurantId,
    restaurantName,
    merchantLogo,
    merchantPhone,
    merchantEmail,
    plan,
    captainsCount,
    price,
    startDate,
    endDate,
    status,
    raw: data,
  };
}

export const SubscriptionService = {
  plans: SUBSCRIPTION_PLANS,

  async getAll(): Promise<{ data: Subscription[]; isLive: boolean }> {
    if (!isFirebaseConfigured) {
      return { data: localSubscriptionsCache, isLive: false };
    }

    try {
      // Fetch both collections in parallel so we get all registered merchants and all subscription records
      const [subsSnap, merchantsSnap] = await Promise.all([
        getDocs(collection(db, COLLECTIONS.SUBSCRIPTIONS)),
        getDocs(collection(db, COLLECTIONS.RESTAURANTS)),
      ]);

      const merchantsById = new Map<string, Record<string, any>>();
      const merchantsByName = new Map<string, { id: string; data: Record<string, any> }>();

      merchantsSnap.forEach((docSnap) => {
        const d = docSnap.data();
        merchantsById.set(docSnap.id, d);
        const nameKey = String(d.name || d.nameAr || d.merchantName || d.restaurantName || '')
          .trim()
          .toLowerCase();
        if (nameKey) {
          merchantsByName.set(nameKey, { id: docSnap.id, data: d });
        }
      });

      const list: Subscription[] = [];
      const coveredMerchantIds = new Set<string>();

      // 1. Map existing subscription documents
      subsSnap.forEach((docSnap) => {
        const subData = docSnap.data();
        const restId = subData.restaurantId || subData.merchantId || subData.restaurant?.id || '';
        const restNameKey = String(subData.restaurantName || subData.merchantName || '')
          .trim()
          .toLowerCase();

        let matchedMerchant: { id: string; data: Record<string, any> } | undefined;
        if (restId && merchantsById.has(restId)) {
          matchedMerchant = { id: restId, data: merchantsById.get(restId)! };
        } else if (merchantsById.has(docSnap.id)) {
          matchedMerchant = { id: docSnap.id, data: merchantsById.get(docSnap.id)! };
        } else if (restNameKey && merchantsByName.has(restNameKey)) {
          matchedMerchant = merchantsByName.get(restNameKey);
        }

        if (matchedMerchant) {
          coveredMerchantIds.add(matchedMerchant.id);
        } else if (restId) {
          coveredMerchantIds.add(restId);
        }

        list.push(mapDocToSubscription(docSnap.id, subData, matchedMerchant));
      });

      // 2. Also include every registered merchant in `restaurants` that doesn't have a separate doc in `subscriptions`
      merchantsSnap.forEach((docSnap) => {
        if (!coveredMerchantIds.has(docSnap.id)) {
          const mData = docSnap.data();
          list.push(
            mapDocToSubscription(docSnap.id, mData, {
              id: docSnap.id,
              data: mData,
            })
          );
        }
      });

      // Sort newest startDate first
      list.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));

      localSubscriptionsCache = list;
      return { data: list, isLive: true };
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTIONS.SUBSCRIPTIONS);
      return { data: localSubscriptionsCache, isLive: false };
    }
  },

  async syncMerchantDocument(
    restaurantId: string,
    updates: {
      status?: SubscriptionStatus;
      plan?: string;
      captainsCount?: number;
      price?: number;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<void> {
    if (!isFirebaseConfigured || !restaurantId) return;
    try {
      const restRef = doc(db, COLLECTIONS.RESTAURANTS, restaurantId);
      const payload: Record<string, any> = {
        updatedAt: serverTimestamp(),
      };
      if (updates.status !== undefined) {
        payload.subscriptionStatus = updates.status;
      }
      if (updates.plan !== undefined) {
        payload.subscriptionPlan = updates.plan;
      }
      if (updates.captainsCount !== undefined) {
        payload.captainsCount = updates.captainsCount;
      }
      if (updates.price !== undefined) {
        payload.subscriptionPrice = updates.price;
      }
      if (updates.startDate !== undefined) {
        payload.subscriptionStartDate = updates.startDate;
        payload.startDate = updates.startDate;
      }
      if (updates.endDate !== undefined) {
        payload.subscriptionEndDate = updates.endDate;
        payload.endDate = updates.endDate;
      }
      await updateDoc(restRef, payload);
    } catch {
      // Ignore if restaurantId doc doesn't exist in restaurants collection
    }
  },

  async updateStatus(id: string, status: SubscriptionStatus, restaurantId?: string): Promise<void> {
    const targetSub = localSubscriptionsCache.find((s) => s.id === id);
    const targetRestId = restaurantId || targetSub?.restaurantId || id;

    localSubscriptionsCache = localSubscriptionsCache.map((sub) =>
      sub.id === id ? { ...sub, status } : sub
    );

    if (isFirebaseConfigured) {
      try {
        const docRef = doc(db, COLLECTIONS.SUBSCRIPTIONS, id);
        await setDoc(
          docRef,
          {
            ...(targetSub
              ? {
                  restaurantId: targetSub.restaurantId,
                  restaurantName: targetSub.restaurantName,
                  plan: targetSub.plan,
                  captainsCount: targetSub.captainsCount || 2,
                  price: targetSub.price || 400,
                  startDate: targetSub.startDate,
                  endDate: targetSub.endDate,
                }
              : {}),
            status,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        await this.syncMerchantDocument(targetRestId, { status });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `${COLLECTIONS.SUBSCRIPTIONS}/${id}`);
        throw error;
      }
    }
  },

  async updateSubscription(
    id: string,
    updates: {
      restaurantId?: string;
      restaurantName?: string;
      captainsCount: number;
      price: number;
      plan: string;
      startDate: string;
      endDate: string;
      status: SubscriptionStatus;
    }
  ): Promise<void> {
    const existing = localSubscriptionsCache.find((s) => s.id === id);
    const targetRestId = updates.restaurantId || existing?.restaurantId || id;

    localSubscriptionsCache = localSubscriptionsCache.map((sub) =>
      sub.id === id ? { ...sub, ...updates } : sub
    );

    if (isFirebaseConfigured) {
      try {
        const docRef = doc(db, COLLECTIONS.SUBSCRIPTIONS, id);
        await setDoc(
          docRef,
          {
            restaurantId: targetRestId,
            restaurantName: updates.restaurantName || existing?.restaurantName || '',
            captainsCount: updates.captainsCount,
            price: updates.price,
            plan: updates.plan,
            startDate: updates.startDate,
            endDate: updates.endDate,
            status: updates.status,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        await this.syncMerchantDocument(targetRestId, {
          status: updates.status,
          plan: updates.plan,
          captainsCount: updates.captainsCount,
          price: updates.price,
          startDate: updates.startDate,
          endDate: updates.endDate,
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `${COLLECTIONS.SUBSCRIPTIONS}/${id}`);
        throw error;
      }
    }
  },

  async create(data: Omit<Subscription, 'id'>): Promise<Subscription> {
    // If a subscription for this restaurantId already exists in cache, update it instead of duplicating
    const existing = localSubscriptionsCache.find(
      (s) => s.restaurantId && s.restaurantId === data.restaurantId
    );
    const subId = existing ? existing.id : data.restaurantId || `sub_${Date.now()}`;

    const newSub: Subscription = {
      ...data,
      id: subId,
    };

    if (existing) {
      localSubscriptionsCache = localSubscriptionsCache.map((s) =>
        s.id === subId ? newSub : s
      );
    } else {
      localSubscriptionsCache = [newSub, ...localSubscriptionsCache];
    }

    if (isFirebaseConfigured) {
      try {
        const docRef = doc(db, COLLECTIONS.SUBSCRIPTIONS, subId);
        await setDoc(
          docRef,
          {
            restaurantId: data.restaurantId,
            restaurantName: data.restaurantName,
            plan: data.plan,
            captainsCount: data.captainsCount || 2,
            price: data.price,
            startDate: data.startDate,
            endDate: data.endDate,
            status: data.status,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        if (data.restaurantId) {
          await this.syncMerchantDocument(data.restaurantId, {
            status: data.status,
            plan: data.plan,
            captainsCount: data.captainsCount || 2,
            price: data.price,
            startDate: data.startDate,
            endDate: data.endDate,
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `${COLLECTIONS.SUBSCRIPTIONS}/${subId}`);
        throw error;
      }
    }

    return newSub;
  },

  async renew(id: string, days: number = 30): Promise<string> {
    const existing = localSubscriptionsCache.find((s) => s.id === id);
    const todayYMD = new Date().toISOString().split('T')[0];
    // If current endDate is in the future, extend from endDate; otherwise extend from today
    const baseDate =
      existing?.endDate && existing.endDate > todayYMD ? existing.endDate : todayYMD;
    const formattedEndDate = addDaysToYMD(baseDate, days);
    const startDate = existing?.startDate || todayYMD;

    localSubscriptionsCache = localSubscriptionsCache.map((sub) =>
      sub.id === id ? { ...sub, status: 'Active', endDate: formattedEndDate } : sub
    );

    if (isFirebaseConfigured) {
      try {
        const docRef = doc(db, COLLECTIONS.SUBSCRIPTIONS, id);
        await setDoc(
          docRef,
          {
            ...(existing
              ? {
                  restaurantId: existing.restaurantId,
                  restaurantName: existing.restaurantName,
                  plan: existing.plan,
                  captainsCount: existing.captainsCount || 2,
                  price: existing.price || 400,
                  startDate,
                }
              : {}),
            status: 'Active',
            endDate: formattedEndDate,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        if (existing?.restaurantId) {
          await this.syncMerchantDocument(existing.restaurantId, {
            status: 'Active',
            startDate,
            endDate: formattedEndDate,
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `${COLLECTIONS.SUBSCRIPTIONS}/${id}`);
        throw error;
      }
    }

    return formattedEndDate;
  },

  async delete(id: string): Promise<void> {
    localSubscriptionsCache = localSubscriptionsCache.filter((s) => s.id !== id);
    if (isFirebaseConfigured) {
      try {
        await deleteDoc(doc(db, COLLECTIONS.SUBSCRIPTIONS, id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `${COLLECTIONS.SUBSCRIPTIONS}/${id}`);
      }
    }
  },
};
