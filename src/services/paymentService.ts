import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  query,
} from 'firebase/firestore';
import { db, isFirebaseConfigured, handleFirestoreError, OperationType } from '../firebase/config';
import { COLLECTIONS } from './collections';
import { Payment, PaymentMethod, PaymentStatus } from '../types';

let localPaymentsCache: Payment[] = [];

function normalizeIsoDate(val: any): string {
  if (!val) return new Date().toISOString();
  if (typeof val === 'string') return val;
  if (typeof val?.toDate === 'function') return val.toDate().toISOString();
  if (typeof val?.seconds === 'number') return new Date(val.seconds * 1000).toISOString();
  return new Date().toISOString();
}

function mapDocToPayment(id: string, data: Record<string, any>): Payment {
  const txnId = data.transactionId || data.transactionNumber || data.reference || data.txnId || `#TXN-${id.slice(0, 6).toUpperCase()}`;
  const isoCreatedAt = normalizeIsoDate(data.createdAt || data.updatedAt || data.date);
  return {
    id,
    transactionId: txnId,
    transactionNumber: txnId,
    restaurantId: data.restaurantId || '',
    restaurantName: data.restaurantName || data.merchantName || 'تاجر غير محدد',
    amount: typeof data.amount === 'number' ? data.amount : (Number(data.amount) || Number(data.amountCents) / 100 || 0),
    paymentMethod: (data.paymentMethod as PaymentMethod) || (data.integrationId ? 'Paymob' : data.method === 'card' ? 'Visa' : data.method === 'wallet' ? 'Mobile Wallet' : 'غير محدد'),
    status: (data.status as PaymentStatus) || 'success',
    date: typeof data.date === 'string' && data.date ? data.date : isoCreatedAt.split('T')[0],
    createdAt: isoCreatedAt,
    notes: data.notes || '',
    raw: data,
  };
}

export const PaymentService = {
  async getAll(): Promise<{ data: Payment[]; isLive: boolean }> {
    if (!isFirebaseConfigured) {
      return { data: localPaymentsCache, isLive: false };
    }

    try {
      const q = query(collection(db, COLLECTIONS.PAYMENTS));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        localPaymentsCache = [];
        return { data: [], isLive: true };
      }

      const list: Payment[] = [];
      snapshot.forEach((docSnap) => {
        list.push(mapDocToPayment(docSnap.id, docSnap.data()));
      });

      localPaymentsCache = list;
      return { data: list, isLive: true };
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTIONS.PAYMENTS);
      return { data: localPaymentsCache, isLive: false };
    }
  },

  async create(data: Omit<Payment, 'id' | 'transactionId'> & { transactionId?: string }): Promise<Payment> {
    const txnId = data.transactionId || `#TXN-${Math.floor(100000 + Math.random() * 900000)}`;
    const nowIso = new Date().toISOString();
    const payload = {
      transactionId: txnId,
      transactionNumber: txnId,
      restaurantId: data.restaurantId || '',
      restaurantName: data.restaurantName,
      amount: Number(data.amount) || 0,
      paymentMethod: data.paymentMethod,
      status: data.status || 'success',
      date: data.date || nowIso.split('T')[0],
      notes: data.notes || '',
      createdAt: nowIso,
    };

    if (isFirebaseConfigured) {
      try {
        const docRef = await addDoc(collection(db, COLLECTIONS.PAYMENTS), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        const created: Payment = {
          ...payload,
          id: docRef.id,
        };
        localPaymentsCache = [created, ...localPaymentsCache];
        return created;
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, COLLECTIONS.PAYMENTS);
      }
    }

    const newPayment: Payment = {
      ...payload,
      id: `pay_${Date.now()}`,
    };

    localPaymentsCache = [newPayment, ...localPaymentsCache];
    return newPayment;
  },
};
