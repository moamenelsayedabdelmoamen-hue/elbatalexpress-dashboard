import {
  getMessaging,
  isSupported as isMessagingSupported,
  getToken,
  onMessage,
  Messaging,
} from 'firebase/messaging';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { app, db, auth, isFirebaseConfigured, handleFirestoreError, OperationType } from '../firebase/config';
import { COLLECTIONS } from './collections';
import { AdminNotification, AdminNotificationType } from '../types';

const LOCAL_NOTIFICATIONS_KEY = 'elbatal_admin_notifications_v1';

let messagingInstance: Messaging | null = null;

export async function initFirebaseMessaging(): Promise<Messaging | null> {
  if (typeof window === 'undefined' || !isFirebaseConfigured) return null;
  if (messagingInstance) return messagingInstance;

  try {
    const supported = await isMessagingSupported();
    if (!supported) return null;
    messagingInstance = getMessaging(app);
    return messagingInstance;
  } catch (err) {
    console.warn('FCM initialization notice:', err);
    return null;
  }
}

export function loadLocalNotifications(): AdminNotification[] {
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(LOCAL_NOTIFICATIONS_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    }
  } catch {
    // ignore
  }
  return [];
}

export function saveLocalNotifications(list: AdminNotification[]): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_NOTIFICATIONS_KEY, JSON.stringify(list.slice(0, 80)));
    }
  } catch {
    // ignore
  }
}

/**
 * Plays a distinct Web Audio chime for new orders vs captain assignment failure
 */
export function playAlertChime(type: AdminNotificationType): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    if (type === 'captain_assignment_failed') {
      // Urgent double-beep alert tone
      [0, 0.18].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(520, now + offset);
        osc.frequency.exponentialRampToValueAtTime(340, now + offset + 0.14);
        gain.gain.setValueAtTime(0.14, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.15);
      });
    } else {
      // Pleasant two-note ascending chime for new order
      const notes = [587.33, 880]; // D5 -> A5
      notes.forEach((freq, idx) => {
        const offset = idx * 0.13;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + offset);
        gain.gain.setValueAtTime(0.16, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.26);
      });
    }
  } catch {
    // Audio play blocked before user interaction
  }
}

/**
 * Shows a native system/browser notification via ServiceWorker or Notification API
 */
export async function showBrowserNotification(
  title: string,
  body: string,
  url: string = '/orders'
): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(title, {
          body,
          icon: '/logo.png',
          badge: '/logo.png',
          dir: 'rtl',
          lang: 'ar',
          data: { url },
        });
        return;
      }
    }
    const n = new Notification(title, {
      body,
      icon: '/logo.png',
      dir: 'rtl',
      lang: 'ar',
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // Fallback silently if restricted in iframe
  }
}

function parseTimestampIso(val: any): string {
  if (!val) return new Date().toISOString();
  if (typeof val?.toDate === 'function') {
    return val.toDate().toISOString();
  }
  if (typeof val === 'object' && typeof val.seconds === 'number') {
    return new Date(val.seconds * 1000).toISOString();
  }
  return String(val);
}

export const NotificationService = {
  /**
   * Requests Browser Notification permission, registers the FCM Service Worker,
   * retrieves the FCM registration token, and saves it to the admin's Firestore profile.
   */
  async requestPermissionAndRegisterToken(): Promise<{
    permission: NotificationPermission | 'unsupported';
    token: string | null;
  }> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return { permission: 'unsupported', token: null };
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return { permission, token: null };
      }

      const messaging = await initFirebaseMessaging();
      if (!messaging) {
        return { permission, token: null };
      }

      let swRegistration: ServiceWorkerRegistration | undefined;
      if ('serviceWorker' in navigator) {
        try {
          swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        } catch (swErr) {
          console.warn('Service worker registration notice:', swErr);
        }
      }

      let token: string | null = null;
      try {
        const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || undefined;
        token = await getToken(messaging, {
          ...(vapidKey ? { vapidKey } : {}),
          ...(swRegistration ? { serviceWorkerRegistration: swRegistration } : {}),
        });
      } catch (tokenErr) {
        console.info('FCM getToken notice (push active via local/SW):', tokenErr);
      }

      // Persist FCM token in Firestore under the current admin user if available
      const currentUid = auth?.currentUser?.uid;
      if (token && currentUid && isFirebaseConfigured) {
        try {
          await setDoc(
            doc(db, COLLECTIONS.USERS, currentUid),
            {
              fcmToken: token,
              fcmEnabled: true,
              fcmUpdatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } catch {
          // ignore
        }
      }

      return { permission, token };
    } catch (err) {
      console.warn('Failed to request FCM permission:', err);
      return { permission: Notification.permission, token: null };
    }
  },

  /**
   * Subscribes to foreground Firebase Cloud Messaging payloads
   */
  async subscribeForegroundFcm(
    onPayload: (notif: AdminNotification) => void
  ): Promise<() => void> {
    const messaging = await initFirebaseMessaging();
    if (!messaging) return () => {};

    try {
      const unsubscribe = onMessage(messaging, (payload) => {
        const type =
          (payload.data?.type as AdminNotificationType) ||
          (payload.data?.reason ? 'captain_assignment_failed' : 'new_order');

        const notif: AdminNotification = {
          id: `fcm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          type,
          title:
            payload.notification?.title ||
            payload.data?.title ||
            'إشعار فوري - البطل إكسبريس',
          body:
            payload.notification?.body ||
            payload.data?.body ||
            'وصل تحديث جديد في لوحة التحكم',
          orderId: payload.data?.orderId,
          orderNumber: payload.data?.orderNumber,
          restaurantName: payload.data?.restaurantName,
          reason: payload.data?.reason,
          isRead: false,
          createdAt: new Date().toISOString(),
        };

        onPayload(notif);
      });
      return unsubscribe;
    } catch {
      return () => {};
    }
  },

  /**
   * Subscribes to Firestore `notifications` collection in real-time
   */
  subscribeFirestoreNotifications(
    onUpdate: (notifications: AdminNotification[]) => void
  ): () => void {
    if (!isFirebaseConfigured) {
      onUpdate(loadLocalNotifications());
      return () => {};
    }

    try {
      const q = query(
        collection(db, COLLECTIONS.NOTIFICATIONS),
        orderBy('createdAt', 'desc'),
        limit(50)
      );

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const list: AdminNotification[] = [];
          snapshot.forEach((docSnap) => {
            const d = docSnap.data();
            list.push({
              id: docSnap.id,
              type: (d.type as AdminNotificationType) || 'new_order',
              title: d.title || 'إشعار جديد',
              body: d.body || d.message || '',
              orderId: d.orderId || '',
              orderNumber: d.orderNumber || '',
              restaurantName: d.restaurantName || '',
              reason: d.reason || '',
              isRead: Boolean(d.isRead),
              createdAt: parseTimestampIso(d.createdAt),
              userId: d.userId || '',
            });
          });
          saveLocalNotifications(list);
          onUpdate(list);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, COLLECTIONS.NOTIFICATIONS);
          onUpdate(loadLocalNotifications());
        }
      );

      return unsubscribe;
    } catch {
      onUpdate(loadLocalNotifications());
      return () => {};
    }
  },

  /**
   * Creates and dispatches an admin notification (in Firestore + Browser FCM/SW Notification)
   */
  async createNotification(data: {
    id?: string;
    type: AdminNotificationType;
    title: string;
    body: string;
    orderId?: string;
    orderNumber?: string;
    restaurantName?: string;
    reason?: string;
  }): Promise<AdminNotification> {
    const notifId = data.id || `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const currentUid = auth?.currentUser?.uid || 'admin';

    const newNotif: AdminNotification = {
      id: notifId,
      type: data.type,
      title: data.title,
      body: data.body,
      orderId: data.orderId || '',
      orderNumber: data.orderNumber || '',
      restaurantName: data.restaurantName || '',
      reason: data.reason || '',
      isRead: false,
      createdAt: nowIso,
      userId: currentUid,
    };

    const existingLocal = loadLocalNotifications();
    const updatedLocal = [newNotif, ...existingLocal.filter((n) => n.id !== notifId)];
    saveLocalNotifications(updatedLocal);

    if (isFirebaseConfigured) {
      try {
        await setDoc(
          doc(db, COLLECTIONS.NOTIFICATIONS, notifId),
          {
            type: newNotif.type,
            title: newNotif.title,
            body: newNotif.body,
            orderId: newNotif.orderId,
            orderNumber: newNotif.orderNumber,
            restaurantName: newNotif.restaurantName,
            reason: newNotif.reason,
            isRead: false,
            userId: currentUid,
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `${COLLECTIONS.NOTIFICATIONS}/${notifId}`);
      }
    }

    return newNotif;
  },

  async notifyCaptainAssignmentFailed(params: {
    orderId?: string;
    orderNumber?: string;
    restaurantName?: string;
    reason: string;
  }): Promise<AdminNotification> {
    const title = params.orderNumber
      ? `⚠️ تعثر تعيين كابتن للطلب ${params.orderNumber}`
      : `⚠️ تعثر تعيين كابتن للتاجر ${params.restaurantName || ''}`;
    playAlertChime('captain_assignment_failed');
    showBrowserNotification(title, params.reason, '/orders');
    return this.createNotification({
      type: 'captain_assignment_failed',
      title,
      body: params.reason,
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      restaurantName: params.restaurantName,
      reason: params.reason,
    });
  },

  async markAsRead(id: string): Promise<void> {
    const local = loadLocalNotifications().map((n) =>
      n.id === id ? { ...n, isRead: true } : n
    );
    saveLocalNotifications(local);

    if (isFirebaseConfigured) {
      try {
        await updateDoc(doc(db, COLLECTIONS.NOTIFICATIONS, id), {
          isRead: true,
        });
      } catch {
        // ignore if local-only
      }
    }
  },

  async markAllAsRead(ids: string[]): Promise<void> {
    const local = loadLocalNotifications().map((n) => ({ ...n, isRead: true }));
    saveLocalNotifications(local);

    if (isFirebaseConfigured) {
      await Promise.all(
        ids.slice(0, 25).map(async (id) => {
          try {
            await updateDoc(doc(db, COLLECTIONS.NOTIFICATIONS, id), { isRead: true });
          } catch {
            // ignore
          }
        })
      );
    }
  },

  async clearAll(ids: string[]): Promise<void> {
    saveLocalNotifications([]);
    if (isFirebaseConfigured) {
      await Promise.all(
        ids.slice(0, 25).map(async (id) => {
          try {
            await deleteDoc(doc(db, COLLECTIONS.NOTIFICATIONS, id));
          } catch {
            // ignore
          }
        })
      );
    }
  },
};
