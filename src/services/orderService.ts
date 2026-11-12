import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db, isFirebaseConfigured, handleFirestoreError, OperationType } from '../firebase/config';
import { COLLECTIONS } from './collections';
import { Order, OrderStatus } from '../types';

let localOrdersCache: Order[] = [];

export function parseAnyTimestampToIso(rawVal: any): string {
  if (!rawVal) return '';
  try {
    if (typeof rawVal === 'object' && typeof rawVal.toDate === 'function') {
      return rawVal.toDate().toISOString();
    }
    if (typeof rawVal === 'object' && typeof rawVal.seconds === 'number') {
      return new Date(rawVal.seconds * 1000).toISOString();
    }
    if (rawVal instanceof Date) {
      return rawVal.toISOString();
    }
    if (typeof rawVal === 'number') {
      const ms = rawVal < 10000000000 ? rawVal * 1000 : rawVal;
      return new Date(ms).toISOString();
    }
    if (typeof rawVal === 'string') {
      const trimmed = rawVal.trim();
      if (!trimmed) return '';
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) {
        return d.toISOString();
      }
      return trimmed;
    }
  } catch {
    // ignore
  }
  return '';
}

export function formatDurationArabic(seconds: number): string {
  if (seconds < 0 || isNaN(seconds)) seconds = 0;
  const rounded = Math.round(seconds);
  if (rounded === 0) return 'أقل من ثانية';
  if (rounded < 60) {
    return `${rounded} ثانية`;
  }
  const mins = Math.floor(rounded / 60);
  const remSecs = rounded % 60;
  if (mins < 60) {
    return remSecs > 0 ? `${mins} دقيقة و ${remSecs} ث` : `${mins} دقيقة`;
  }
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours} ساعة و ${remMins} د` : `${hours} ساعة`;
}

function mapDocToOrder(id: string, data: Record<string, any>): Order {
  const rawDeliveryFee =
    data.deliveryFee !== undefined
      ? data.deliveryFee
      : data.delivery_fee !== undefined
      ? data.delivery_fee
      : data.deliveryPrice !== undefined
      ? data.deliveryPrice
      : data.delivery_price !== undefined
      ? data.delivery_price
      : data.deliveryCost !== undefined
      ? data.deliveryCost
      : data.delivery_cost !== undefined
      ? data.delivery_cost
      : data.shippingFee !== undefined
      ? data.shippingFee
      : data.shipping_fee !== undefined
      ? data.shipping_fee
      : data.fee !== undefined
      ? data.fee
      : data.captainFee !== undefined
      ? data.captainFee
      : data.captain_fee !== undefined
      ? data.captain_fee
      : data.deliveryAmount !== undefined
      ? data.deliveryAmount
      : data.delivery_amount !== undefined
      ? data.delivery_amount
      : typeof data.delivery === 'number'
      ? data.delivery
      : data.pricing?.deliveryFee !== undefined
      ? data.pricing.deliveryFee
      : data.pricing?.delivery_fee !== undefined
      ? data.pricing.delivery_fee
      : 0;

  const realDeliveryFee =
    typeof rawDeliveryFee === 'number'
      ? rawDeliveryFee
      : parseFloat(String(rawDeliveryFee).replace(/[^\d.-]/g, '')) || 0;

  const realOrderNumber =
    data.orderNumber !== undefined && data.orderNumber !== null && data.orderNumber !== ''
      ? data.orderNumber
      : data.order_number !== undefined && data.order_number !== null && data.order_number !== ''
      ? data.order_number
      : data.orderId !== undefined && data.orderId !== null && data.orderId !== ''
      ? data.orderId
      : data.order_id !== undefined && data.order_id !== null && data.order_id !== ''
      ? data.order_id
      : data.orderNo !== undefined && data.orderNo !== null && data.orderNo !== ''
      ? data.orderNo
      : data.order_no !== undefined && data.order_no !== null && data.order_no !== ''
      ? data.order_no
      : data.code !== undefined && data.code !== null && data.code !== ''
      ? data.code
      : data.orderCode !== undefined && data.orderCode !== null && data.orderCode !== ''
      ? data.orderCode
      : data.number !== undefined && data.number !== null && data.number !== ''
      ? data.number
      : id;

  const realCaptainId = data.captainId || data.captain?.id || data.captain?.uid || '';
  const realCaptainName =
    data.captainName ||
    data.captain?.name ||
    data.captain?.displayName ||
    '';

  const rawCreatedAt =
    data.createdAt ||
    data.created_at ||
    data.orderDate ||
    data.order_date ||
    data.date ||
    data.timestamp ||
    data.time;

  const parsedCreatedAt = parseAnyTimestampToIso(rawCreatedAt) || new Date().toISOString();

  // Stage Timestamps
  const timestampsObj = typeof data.timestamps === 'object' && data.timestamps ? data.timestamps : {};
  const historyObj = typeof data.statusHistory === 'object' && data.statusHistory ? data.statusHistory : {};

  const assignedAt = parseAnyTimestampToIso(
    data.assignedAt ||
      data.assigned_at ||
      data.captainAssignedAt ||
      timestampsObj.assignedAt
  );

  const acceptedAt = parseAnyTimestampToIso(
    data.acceptedAt ||
      data.accepted_at ||
      data.captainAcceptedAt ||
      data.captain_accepted_at ||
      timestampsObj.acceptedAt ||
      historyObj.Accepted ||
      assignedAt
  );

  const arrivedAtMerchantAt = parseAnyTimestampToIso(
    data.arrivedAtMerchantAt ||
      data.arrived_at_merchant_at ||
      data.arrivedAtRestaurantAt ||
      data.arrived_at_restaurant_at ||
      data.arrivedAtStoreAt ||
      data.arrivedAt ||
      data.merchantArrivalTime ||
      data.readyAt ||
      timestampsObj.arrivedAtMerchantAt ||
      timestampsObj.arrivedAtMerchant ||
      historyObj.Ready
  );

  const pickedUpAt = parseAnyTimestampToIso(
    data.pickedUpAt ||
      data.picked_up_at ||
      data.receivedFromMerchantAt ||
      data.received_from_merchant_at ||
      data.pickupTime ||
      data.pickedAt ||
      timestampsObj.pickedUpAt ||
      historyObj['Picked Up']
  );

  const deliveredAt = parseAnyTimestampToIso(
    data.deliveredAt ||
      data.delivered_at ||
      data.completedAt ||
      data.completed_at ||
      data.deliveryTime ||
      timestampsObj.deliveredAt ||
      historyObj.Delivered
  );

  // Calculate Captain Search Duration
  let captainSearchSeconds: number | undefined =
    typeof data.captainSearchSeconds === 'number'
      ? data.captainSearchSeconds
      : typeof data.searchDurationSeconds === 'number'
      ? data.searchDurationSeconds
      : undefined;

  let captainSearchDuration: string | undefined =
    data.captainSearchDuration || data.searchDurationText || undefined;

  if (captainSearchSeconds === undefined && acceptedAt && parsedCreatedAt) {
    const startMs = new Date(parsedCreatedAt).getTime();
    const endMs = new Date(acceptedAt).getTime();
    if (!isNaN(startMs) && !isNaN(endMs) && endMs >= startMs) {
      captainSearchSeconds = Math.round((endMs - startMs) / 1000);
    }
  }

  if (!captainSearchDuration && captainSearchSeconds !== undefined) {
    captainSearchDuration = formatDurationArabic(captainSearchSeconds);
  }

  const distanceToMerchantKm =
    typeof data.distanceToMerchantKm === 'number' ? data.distanceToMerchantKm : undefined;

  return {
    id,
    orderNumber: String(realOrderNumber),
    restaurantId: data.restaurantId || data.restaurant?.id || '',
    restaurantName: data.restaurantName || data.merchantName || data.restaurant?.name || 'تاجر غير محدد',
    customerName: data.customerName || data.customer?.name || 'عميل',
    customerPhone: data.customerPhone || data.customer?.phone || '',
    deliveryAddress: data.deliveryAddress || data.address || '',
    captainId: realCaptainId,
    captainName: realCaptainName,
    subtotal:
      typeof data.subtotal === 'number'
        ? data.subtotal
        : typeof data.itemsTotal === 'number'
        ? data.itemsTotal
        : data.total || 0,
    deliveryFee: realDeliveryFee,
    total: typeof data.total === 'number' ? data.total : 0,
    status: (data.status as OrderStatus) || 'New',
    createdAt: parsedCreatedAt,
    assignedAt,
    acceptedAt,
    arrivedAtMerchantAt,
    pickedUpAt,
    deliveredAt,
    captainSearchDuration,
    captainSearchSeconds,
    distanceToMerchantKm,
    items: data.items || [],
    raw: data,
  };
}

export const OrderService = {
  async getAll(): Promise<{ data: Order[]; isLive: boolean }> {
    if (!isFirebaseConfigured) {
      return { data: localOrdersCache, isLive: false };
    }

    try {
      let snapshot;
      try {
        const q = query(collection(db, COLLECTIONS.ORDERS), orderBy('createdAt', 'desc'));
        snapshot = await getDocs(q);
      } catch (err) {
        snapshot = await getDocs(collection(db, COLLECTIONS.ORDERS));
      }

      if (snapshot.empty) {
        localOrdersCache = [];
        return { data: [], isLive: true };
      }

      const list: Order[] = [];
      snapshot.forEach((docSnap) => {
        list.push(mapDocToOrder(docSnap.id, docSnap.data()));
      });

      list.sort((a, b) => {
        const timeA = new Date(a.createdAt).getTime() || 0;
        const timeB = new Date(b.createdAt).getTime() || 0;
        return timeB - timeA;
      });

      localOrdersCache = list;
      return { data: list, isLive: true };
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTIONS.ORDERS);
      return { data: localOrdersCache, isLive: false };
    }
  },

  async updateStatus(id: string, newStatus: OrderStatus): Promise<Partial<Order>> {
    const nowIso = new Date().toISOString();
    const existing = localOrdersCache.find((o) => o.id === id);

    const stageUpdates: Partial<Order> = { status: newStatus };
    const firestoreUpdates: Record<string, any> = {
      status: newStatus,
      updatedAt: serverTimestamp(),
    };

    if (newStatus === 'Accepted' && !existing?.acceptedAt) {
      stageUpdates.acceptedAt = nowIso;
      firestoreUpdates.acceptedAt = nowIso;
      if (existing?.createdAt && existing.captainSearchSeconds === undefined) {
        const startMs = new Date(existing.createdAt).getTime();
        const endMs = Date.now();
        if (!isNaN(startMs) && endMs >= startMs) {
          const secs = Math.round((endMs - startMs) / 1000);
          stageUpdates.captainSearchSeconds = secs;
          stageUpdates.captainSearchDuration = formatDurationArabic(secs);
          firestoreUpdates.captainSearchSeconds = secs;
          firestoreUpdates.captainSearchDuration = stageUpdates.captainSearchDuration;
        }
      }
    } else if ((newStatus === 'Preparing' || newStatus === 'Ready') && !existing?.arrivedAtMerchantAt) {
      stageUpdates.arrivedAtMerchantAt = nowIso;
      firestoreUpdates.arrivedAtMerchantAt = nowIso;
    } else if (newStatus === 'Picked Up' && !existing?.pickedUpAt) {
      stageUpdates.pickedUpAt = nowIso;
      firestoreUpdates.pickedUpAt = nowIso;
    } else if (newStatus === 'Delivered' && !existing?.deliveredAt) {
      stageUpdates.deliveredAt = nowIso;
      firestoreUpdates.deliveredAt = nowIso;
    }

    localOrdersCache = localOrdersCache.map((order) =>
      order.id === id ? { ...order, ...stageUpdates } : order
    );

    if (isFirebaseConfigured) {
      try {
        const docRef = doc(db, COLLECTIONS.ORDERS, id);
        await updateDoc(docRef, firestoreUpdates);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `${COLLECTIONS.ORDERS}/${id}`);
      }
    }

    return stageUpdates;
  },

  async recordStageTimestamp(
    orderId: string,
    field: 'acceptedAt' | 'arrivedAtMerchantAt' | 'pickedUpAt' | 'deliveredAt',
    customIso?: string
  ): Promise<string> {
    const timestampIso = customIso || new Date().toISOString();

    localOrdersCache = localOrdersCache.map((o) =>
      o.id === orderId ? { ...o, [field]: timestampIso } : o
    );

    if (isFirebaseConfigured) {
      try {
        const docRef = doc(db, COLLECTIONS.ORDERS, orderId);
        await updateDoc(docRef, {
          [field]: timestampIso,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `${COLLECTIONS.ORDERS}/${orderId}`);
        throw error;
      }
    }

    return timestampIso;
  },

  async assignCaptain(
    orderId: string,
    captainId: string,
    captainName: string,
    extra?: {
      searchDurationSeconds?: number;
      searchDurationText?: string;
      distanceToMerchantKm?: number;
    }
  ): Promise<{
    acceptedAt: string;
    captainSearchDuration: string;
    captainSearchSeconds: number;
    distanceToMerchantKm?: number;
  }> {
    const nowIso = new Date().toISOString();
    const existing = localOrdersCache.find((o) => o.id === orderId);

    let searchSecs = extra?.searchDurationSeconds;
    if (searchSecs === undefined && existing?.createdAt) {
      const createdMs = new Date(existing.createdAt).getTime();
      const nowMs = Date.now();
      if (!isNaN(createdMs) && nowMs >= createdMs) {
        searchSecs = Math.round((nowMs - createdMs) / 1000);
      }
    }
    if (searchSecs === undefined) {
      searchSecs = 1;
    }

    const searchDurationText = extra?.searchDurationText || formatDurationArabic(searchSecs);

    localOrdersCache = localOrdersCache.map((order) =>
      order.id === orderId
        ? {
            ...order,
            captainId,
            captainName,
            status: order.status === 'New' ? 'Accepted' : order.status,
            assignedAt: nowIso,
            acceptedAt: order.acceptedAt || nowIso,
            captainSearchSeconds: searchSecs,
            captainSearchDuration: searchDurationText,
            ...(extra?.distanceToMerchantKm !== undefined
              ? { distanceToMerchantKm: extra.distanceToMerchantKm }
              : {}),
          }
        : order
    );

    if (isFirebaseConfigured) {
      try {
        const docRef = doc(db, COLLECTIONS.ORDERS, orderId);
        const payload: Record<string, any> = {
          captainId,
          captainName,
          captain: {
            id: captainId,
            name: captainName,
          },
          status: 'Accepted',
          assignedAt: nowIso,
          acceptedAt: existing?.acceptedAt || nowIso,
          captainSearchSeconds: searchSecs,
          captainSearchDuration: searchDurationText,
          updatedAt: serverTimestamp(),
        };
        if (extra?.distanceToMerchantKm !== undefined) {
          payload.distanceToMerchantKm = extra.distanceToMerchantKm;
        }
        await updateDoc(docRef, payload);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `${COLLECTIONS.ORDERS}/${orderId}`);
      }
    }

    return {
      acceptedAt: existing?.acceptedAt || nowIso,
      captainSearchDuration: searchDurationText,
      captainSearchSeconds: searchSecs,
      distanceToMerchantKm: extra?.distanceToMerchantKm,
    };
  },

  async create(data: {
    restaurantId: string;
    restaurantName: string;
    captainId: string;
    captainName: string;
    deliveryAddress?: string;
    deliveryFee?: number;
    notes?: string;
    customerName?: string;
    customerPhone?: string;
    subtotal?: number;
    total?: number;
    items?: { name: string; quantity: number; price: number }[];
  }): Promise<Order> {
    const timestamp = Date.now();
    const nowIso = new Date().toISOString();
    const newId = `ord_${timestamp}`;
    const orderNumber = `#ELB-${Math.floor(1000 + Math.random() * 9000)}`;

    const deliveryFee = Number(data.deliveryFee ?? 0);
    const subtotal = Number(data.subtotal ?? 0);
    const total = Number(data.total ?? subtotal + deliveryFee);

    const newOrder: Order = {
      id: newId,
      orderNumber,
      restaurantId: data.restaurantId,
      restaurantName: data.restaurantName,
      captainId: data.captainId,
      captainName: data.captainName,
      customerName: data.customerName || '',
      customerPhone: data.customerPhone || '',
      deliveryAddress: data.deliveryAddress || '',
      subtotal,
      deliveryFee,
      total,
      status: 'Accepted',
      createdAt: nowIso,
      assignedAt: nowIso,
      acceptedAt: nowIso,
      captainSearchSeconds: 1,
      captainSearchDuration: '1 ثانية',
      items: data.items && data.items.length > 0 ? data.items : [],
      raw: {
        ...data,
        notes: data.notes || '',
        orderNumber,
        status: 'Accepted',
        dispatchedBy: 'admin',
      },
    };

    localOrdersCache = [newOrder, ...localOrdersCache];

    if (isFirebaseConfigured) {
      try {
        const docRef = doc(db, COLLECTIONS.ORDERS, newId);
        await setDoc(docRef, {
          orderNumber,
          orderId: orderNumber,
          restaurantId: data.restaurantId,
          restaurantName: data.restaurantName,
          captainId: data.captainId,
          captainName: data.captainName,
          captain: {
            id: data.captainId,
            name: data.captainName,
          },
          deliveryAddress: data.deliveryAddress || '',
          deliveryFee,
          delivery_fee: deliveryFee,
          deliveryPrice: deliveryFee,
          fee: deliveryFee,
          subtotal,
          total,
          status: 'Accepted',
          assignedAt: nowIso,
          acceptedAt: nowIso,
          captainSearchSeconds: 1,
          captainSearchDuration: '1 ثانية',
          notes: data.notes || '',
          items: newOrder.items,
          dispatchedBy: 'admin',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `${COLLECTIONS.ORDERS}/${newId}`);
      }
    }

    return newOrder;
  },
};
