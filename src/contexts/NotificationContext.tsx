import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, auth, isFirebaseConfigured } from '../firebase/config';
import { COLLECTIONS } from '../services/collections';
import {
  NotificationService,
  loadLocalNotifications,
  playAlertChime,
  showBrowserNotification,
} from '../services/notificationService';
import { AdminNotification } from '../types';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';

interface NotificationContextValue {
  notifications: AdminNotification[];
  unreadCount: number;
  fcmPermission: NotificationPermission | 'unsupported';
  fcmToken: string | null;
  soundEnabled: boolean;
  activeBannerAlert: AdminNotification | null;
  enableFcmPush: () => Promise<void>;
  toggleSound: () => void;
  notifyNewOrder: (order: {
    id: string;
    orderNumber: string;
    restaurantName: string;
    deliveryFee?: number;
  }) => Promise<void>;
  notifyCaptainAssignmentFailed: (params: {
    orderId: string;
    orderNumber: string;
    restaurantName: string;
    reason: string;
  }) => Promise<void>;
  sendTestNotification: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  clearAll: () => Promise<void>;
  dismissBanner: () => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

const SOUND_PREF_KEY = 'elbatal_fcm_sound_enabled';

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { info, error: toastError, success } = useToast();
  const { user, loading: authLoading } = useAuth();

  const [notifications, setNotifications] = useState<AdminNotification[]>(() =>
    loadLocalNotifications()
  );
  const [fcmPermission, setFcmPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
  });
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(SOUND_PREF_KEY);
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [activeBannerAlert, setActiveBannerAlert] = useState<AdminNotification | null>(null);

  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // Track already-seen order IDs so we only alert on genuinely newly arriving orders
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const isInitialOrdersSnapshotRef = useRef<boolean>(true);
  // Track orders we already alerted for unassigned delay
  const alertedStalledOrderIdsRef = useRef<Set<string>>(new Set());

  const handleIncomingNotification = useCallback(
    (notif: AdminNotification, showToastAndSound = true) => {
      setNotifications((prev) => {
        const exists = prev.some((n) => n.id === notif.id);
        if (exists) return prev;
        return [notif, ...prev].slice(0, 80);
      });

      setActiveBannerAlert(notif);

      if (showToastAndSound) {
        if (soundEnabledRef.current) {
          playAlertChime(notif.type);
        }
        showBrowserNotification(notif.title, notif.body, '/orders');

        if (notif.type === 'captain_assignment_failed') {
          toastError(`${notif.title}: ${notif.body}`);
        } else {
          info(`${notif.title}: ${notif.body}`);
        }
      }
    },
    [info, toastError]
  );

  // 1. Subscribe to Firestore notifications collection & Foreground FCM only when Auth is ready
  useEffect(() => {
    if (authLoading || !user) return;

    const unsubFirestore = auth?.currentUser
      ? NotificationService.subscribeFirestoreNotifications((list) => {
          setNotifications(list);
        })
      : () => {};

    let unsubFcm: (() => void) | undefined;
    NotificationService.subscribeForegroundFcm((fcmNotif) => {
      handleIncomingNotification(fcmNotif, true);
    }).then((unsub) => {
      unsubFcm = unsub;
    });

    // If permission was already granted previously, silently initialize token
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      NotificationService.requestPermissionAndRegisterToken().then((res) => {
        setFcmPermission(res.permission);
        if (res.token) setFcmToken(res.token);
      });
    }

    return () => {
      unsubFirestore();
      if (unsubFcm) unsubFcm();
    };
  }, [authLoading, user, handleIncomingNotification]);

  const notifyNewOrder = useCallback(
    async (order: {
      id: string;
      orderNumber: string;
      restaurantName: string;
      deliveryFee?: number;
    }) => {
      const feeText = order.deliveryFee ? ` (رسوم التوصيل: ${order.deliveryFee} ج.م)` : '';
      const notif = await NotificationService.createNotification({
        id: `new_order_${order.id}`,
        type: 'new_order',
        title: `وصول طلب جديد ${order.orderNumber}`,
        body: `طلب جديد وارد من التاجر "${order.restaurantName}"${feeText} بانتظار تعيين كابتن.`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        restaurantName: order.restaurantName,
      });
      handleIncomingNotification(notif, true);
    },
    [handleIncomingNotification]
  );

  const notifyCaptainAssignmentFailed = useCallback(
    async (params: {
      orderId: string;
      orderNumber: string;
      restaurantName: string;
      reason: string;
    }) => {
      const notif = await NotificationService.createNotification({
        id: `assign_fail_${params.orderId}_${Date.now()}`,
        type: 'captain_assignment_failed',
        title: `تعثر تعيين كابتن للطلب ${params.orderNumber}`,
        body: `التاجر: ${params.restaurantName} — السبب: ${params.reason}`,
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        restaurantName: params.restaurantName,
        reason: params.reason,
      });
      handleIncomingNotification(notif, true);
    },
    [handleIncomingNotification]
  );

  // 2. Real-time Firestore Watcher on `orders` for New Orders & Stalled Unassigned Orders
  useEffect(() => {
    if (authLoading || !user || !isFirebaseConfigured || !auth?.currentUser) return;

    try {
      const colRef = collection(db, COLLECTIONS.ORDERS);
      const unsubscribe = onSnapshot(
        colRef,
        (snapshot) => {
          if (isInitialOrdersSnapshotRef.current) {
            snapshot.docs.forEach((d) => knownOrderIdsRef.current.add(d.id));
            isInitialOrdersSnapshotRef.current = false;
            return;
          }

          snapshot.docChanges().forEach((change) => {
            const docId = change.doc.id;
            const data = change.doc.data();
            const orderNumber = String(
              data.orderNumber || data.order_number || data.orderId || docId
            );
            const restaurantName = String(
              data.restaurantName || data.merchantName || data.restaurant?.name || 'تاجر'
            );
            const deliveryFee = Number(data.deliveryFee || data.delivery_fee || 0);

            if (change.type === 'added' && !knownOrderIdsRef.current.has(docId)) {
              knownOrderIdsRef.current.add(docId);
              notifyNewOrder({
                id: docId,
                orderNumber,
                restaurantName,
                deliveryFee,
              });
            }

            // Also check if order was flagged with captainAssignmentError / dispatchFailed in Firestore
            if (
              (change.type === 'added' || change.type === 'modified') &&
              (data.captainAssignmentFailed === true || data.dispatchError) &&
              !alertedStalledOrderIdsRef.current.has(`err_${docId}`)
            ) {
              alertedStalledOrderIdsRef.current.add(`err_${docId}`);
              notifyCaptainAssignmentFailed({
                orderId: docId,
                orderNumber,
                restaurantName,
                reason: String(data.dispatchError || 'لم يتم العثور على كابتن متاح قريب من التاجر'),
              });
            }
          });
        },
        () => {
          // ignore snapshot permission/offline hiccups
        }
      );

      return () => unsubscribe();
    } catch {
      return;
    }
  }, [authLoading, user, notifyNewOrder, notifyCaptainAssignmentFailed]);

  const enableFcmPush = async () => {
    const res = await NotificationService.requestPermissionAndRegisterToken();
    setFcmPermission(res.permission);
    if (res.token) setFcmToken(res.token);

    if (res.permission === 'granted') {
      success('تم تفعيل إشعارات Firebase Cloud Messaging الفورية بنجاح');
    } else if (res.permission === 'denied') {
      toastError('تم حظر إشعارات المتصفح. يرجى السماح بالإشعارات من إعدادات المتصفح.');
    }
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    try {
      localStorage.setItem(SOUND_PREF_KEY, String(next));
    } catch {
      // ignore
    }
  };

  const sendTestNotification = async () => {
    const notif = await NotificationService.createNotification({
      type: 'new_order',
      title: 'تجربة إشعار فوري (FCM)',
      body: 'نظام الإشعارات الفورية للبطل إكسبريس يعمل بنجاح لإعلام المسؤولين بالطلبات الجديدة وتعثر تعيين الكباتن.',
      orderNumber: '#ELB-TEST',
      restaurantName: 'نظام البطل إكسبريس',
    });
    handleIncomingNotification(notif, true);
  };

  const markAsRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    if (activeBannerAlert?.id === id) {
      setActiveBannerAlert(null);
    }
    await NotificationService.markAsRead(id);
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.isRead).map((n) => n.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setActiveBannerAlert(null);
    await NotificationService.markAllAsRead(unreadIds);
  };

  const clearAll = async () => {
    const allIds = notifications.map((n) => n.id);
    setNotifications([]);
    setActiveBannerAlert(null);
    await NotificationService.clearAll(allIds);
  };

  const dismissBanner = () => {
    setActiveBannerAlert(null);
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        fcmPermission,
        fcmToken,
        soundEnabled,
        activeBannerAlert,
        enableFcmPush,
        toggleSound,
        notifyNewOrder,
        notifyCaptainAssignmentFailed,
        sendTestNotification,
        markAsRead,
        markAllAsRead,
        clearAll,
        dismissBanner,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = (): NotificationContextValue => {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return ctx;
};
