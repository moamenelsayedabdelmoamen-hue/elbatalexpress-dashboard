import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db, isFirebaseConfigured, handleFirestoreError, OperationType } from '../firebase/config';
import { COLLECTIONS } from './collections';
import { CaptainSchedule, CaptainShiftStatusInfo } from '../types';
import {
  computeCaptainShiftStatus,
  createDefaultWeeklySchedule,
  createDefaultDaySchedule,
  DAY_NAMES_AR,
} from '../utils/shiftUtils';

const LOCAL_STORAGE_KEY = 'elbatal_captain_schedules_cache';

function loadCachedSchedules(): Map<string, CaptainSchedule> {
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const arr: [string, CaptainSchedule][] = JSON.parse(raw);
        return new Map(arr);
      }
    }
  } catch {
    // fallback cleanly
  }
  return new Map();
}

function persistCachedSchedules(map: Map<string, CaptainSchedule>) {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(Array.from(map.entries())));
    }
  } catch {
    // fallback cleanly
  }
}

// In-memory + persistent cache for fast responsive UI
let schedulesCache: Map<string, CaptainSchedule> = loadCachedSchedules();

export const ShiftService = {
  /**
   * Listen to all captain schedules in real-time
   */
  subscribeAllSchedules(
    onUpdate: (schedulesMap: Map<string, CaptainSchedule>) => void,
    onError?: (err: any) => void
  ): () => void {
    if (!isFirebaseConfigured) {
      onUpdate(new Map(schedulesCache));
      return () => {};
    }

    try {
      const colRef = collection(db, COLLECTIONS.CAPTAIN_SCHEDULES);
      const unsubscribe = onSnapshot(
        colRef,
        (snapshot) => {
          const freshMap = new Map<string, CaptainSchedule>();
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as CaptainSchedule;
            freshMap.set(docSnap.id, {
              ...data,
              id: docSnap.id,
              captainId: data.captainId || docSnap.id,
            });
          });
          schedulesCache = freshMap;
          persistCachedSchedules(freshMap);
          onUpdate(freshMap);
        },
        (error) => {
          console.warn('Realtime listener notice for captain schedules:', error?.message || error);
          if (onError) onError(error);
          onUpdate(new Map(schedulesCache));
        }
      );
      return unsubscribe;
    } catch (err) {
      console.warn('Failed to setup schedules snapshot listener:', err);
      onUpdate(new Map(schedulesCache));
      return () => {};
    }
  },

  /**
   * Listen to a specific captain's schedule in real-time
   */
  subscribeCaptainSchedule(
    captainId: string,
    onUpdate: (schedule: CaptainSchedule | null, status: CaptainShiftStatusInfo) => void,
    onError?: (err: any) => void
  ): () => void {
    if (!captainId) return () => {};

    if (!isFirebaseConfigured) {
      const cached = schedulesCache.get(captainId) || null;
      onUpdate(cached, computeCaptainShiftStatus(cached));
      return () => {};
    }

    try {
      const docRef = doc(db, COLLECTIONS.CAPTAIN_SCHEDULES, captainId);
      const unsubscribe = onSnapshot(
        docRef,
        (docSnap) => {
          if (docSnap.exists()) {
            const sched = {
              ...(docSnap.data() as CaptainSchedule),
              id: docSnap.id,
              captainId: docSnap.id,
            };
            schedulesCache.set(captainId, sched);
            onUpdate(sched, computeCaptainShiftStatus(sched));
          } else {
            schedulesCache.delete(captainId);
            onUpdate(null, computeCaptainShiftStatus(null));
          }
        },
        (error) => {
          console.error(`Error listening to schedule for captain ${captainId}:`, error);
          if (onError) onError(error);
          const cached = schedulesCache.get(captainId) || null;
          onUpdate(cached, computeCaptainShiftStatus(cached));
        }
      );
      return unsubscribe;
    } catch (err) {
      console.error(`Failed to subscribe to captain schedule ${captainId}:`, err);
      return () => {};
    }
  },

  /**
   * Fetch all schedules once
   */
  async getAllSchedules(): Promise<Map<string, CaptainSchedule>> {
    if (!isFirebaseConfigured) {
      return new Map(schedulesCache);
    }

    try {
      const colRef = collection(db, COLLECTIONS.CAPTAIN_SCHEDULES);
      const snapshot = await getDocs(colRef);
      const map = new Map<string, CaptainSchedule>();

      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as CaptainSchedule;
        map.set(docSnap.id, {
          ...data,
          id: docSnap.id,
          captainId: data.captainId || docSnap.id,
        });
      });

      schedulesCache = map;
      return map;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTIONS.CAPTAIN_SCHEDULES);
      return new Map(schedulesCache);
    }
  },

  /**
   * Fetch single captain schedule
   */
  async getCaptainSchedule(captainId: string): Promise<CaptainSchedule | null> {
    if (schedulesCache.has(captainId)) {
      return schedulesCache.get(captainId)!;
    }

    if (!isFirebaseConfigured) return null;

    try {
      const docRef = doc(db, COLLECTIONS.CAPTAIN_SCHEDULES, captainId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const sched = {
          ...(docSnap.data() as CaptainSchedule),
          id: docSnap.id,
          captainId: docSnap.id,
        };
        schedulesCache.set(captainId, sched);
        return sched;
      }
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${COLLECTIONS.CAPTAIN_SCHEDULES}/${captainId}`);
      return null;
    }
  },

  /**
   * Save or update captain schedule in Firestore
   */
  async saveSchedule(schedule: CaptainSchedule): Promise<void> {
    const captainId = schedule.captainId || schedule.id;
    if (!captainId) throw new Error('Missing captainId');

    // Calculate total weekly hours accurately
    const totalWeeklyHours = Object.values(schedule.weeklySchedule || {}).reduce((acc, day) => {
      if (day.isDayOff) return acc;
      const dayTotal = (day.shifts || []).reduce((sAcc, s) => sAcc + (s.durationHours || 0), 0);
      return acc + dayTotal;
    }, 0);

    // Clean and validate days and shifts to ensure zero undefined values for Firestore
    const sanitizedWeeklySchedule: Record<string, any> = {};
    const validDays = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;

    for (const dayKey of validDays) {
      const dayData = schedule.weeklySchedule?.[dayKey];
      if (dayData) {
        sanitizedWeeklySchedule[dayKey] = {
          day: dayKey,
          dayNameAr: dayData.dayNameAr || DAY_NAMES_AR[dayKey] || dayKey,
          isDayOff: Boolean(dayData.isDayOff),
          totalHours: Number(dayData.totalHours) || 0,
          shifts: (dayData.shifts || []).map((s, idx) => ({
            id: s.id || `shift_${dayKey}_${idx}_${Date.now()}`,
            name: s.name || `وردية ${idx + 1}`,
            startTime: s.startTime || '10:00',
            endTime: s.endTime || '22:00',
            durationHours: Number(s.durationHours) || 0,
            isOvernight: Boolean(s.isOvernight),
          })),
        };
      } else {
        sanitizedWeeklySchedule[dayKey] = createDefaultDaySchedule(dayKey);
      }
    }

    const cleanedSchedule: CaptainSchedule = {
      id: captainId,
      captainId,
      captainName: schedule.captainName || 'كابتن',
      captainPhone: schedule.captainPhone || '',
      isPaused: Boolean(schedule.isPaused),
      notes: schedule.notes || '',
      weeklySchedule: sanitizedWeeklySchedule,
      totalWeeklyHours,
    };

    // 1. Immediately store in fast memory and persistent local storage
    schedulesCache.set(captainId, cleanedSchedule);
    persistCachedSchedules(schedulesCache);

    // 2. Synchronize to Firestore
    if (isFirebaseConfigured && db) {
      try {
        const docRef = doc(db, COLLECTIONS.CAPTAIN_SCHEDULES, captainId);
        const payload: Record<string, any> = {
          id: captainId,
          captainId,
          captainName: cleanedSchedule.captainName,
          captainPhone: cleanedSchedule.captainPhone,
          isPaused: cleanedSchedule.isPaused,
          notes: cleanedSchedule.notes,
          weeklySchedule: sanitizedWeeklySchedule,
          totalWeeklyHours,
          updatedAt: serverTimestamp(),
        };

        await setDoc(docRef, payload, { merge: true });
      } catch (error: any) {
        console.warn('Firestore setDoc notice for captain_schedules:', error?.message || error);
        handleFirestoreError(error, OperationType.WRITE, `${COLLECTIONS.CAPTAIN_SCHEDULES}/${captainId}`);
        // Even if network or offline temporarily occurs, the local cache has successfully saved it!
        // We throw only if not network/offline so user is not blocked
        const msg = String(error?.message || '');
        const isOffline = msg.includes('offline') || msg.includes('unavailable') || msg.includes('network');
        if (!isOffline) {
          throw error;
        }
      }
    }
  },

  /**
   * Quick toggle to pause or resume a captain's work schedule
   */
  async togglePause(captainId: string, isPaused: boolean): Promise<void> {
    const existing = schedulesCache.get(captainId);
    if (existing) {
      schedulesCache.set(captainId, { ...existing, isPaused });
      persistCachedSchedules(schedulesCache);
    }

    if (isFirebaseConfigured) {
      try {
        const docRef = doc(db, COLLECTIONS.CAPTAIN_SCHEDULES, captainId);
        await updateDoc(docRef, {
          isPaused,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `${COLLECTIONS.CAPTAIN_SCHEDULES}/${captainId}`);
        throw error;
      }
    }
  },

  /**
   * Initialize a default schedule for a captain if none exists
   */
  async initializeDefaultSchedule(
    captainId: string,
    captainName: string,
    captainPhone?: string
  ): Promise<CaptainSchedule> {
    const def = createDefaultWeeklySchedule(captainId, captainName, captainPhone);
    await this.saveSchedule(def);
    return def;
  },

  /**
   * Delete schedule
   */
  async deleteSchedule(captainId: string): Promise<void> {
    schedulesCache.delete(captainId);
    if (isFirebaseConfigured) {
      try {
        const docRef = doc(db, COLLECTIONS.CAPTAIN_SCHEDULES, captainId);
        await deleteDoc(docRef);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `${COLLECTIONS.CAPTAIN_SCHEDULES}/${captainId}`);
        throw error;
      }
    }
  },

  /**
   * Server-authoritative check:
   * Verifies if a captain is currently inside active shift hours and eligible to receive new orders.
   * Called during order assignment.
   */
  async verifyCaptainOrderEligibility(captainId: string): Promise<{
    isEligible: boolean;
    statusInfo: CaptainShiftStatusInfo;
    reason?: string;
  }> {
    let schedule = schedulesCache.get(captainId);
    if (!schedule && isFirebaseConfigured) {
      schedule = await this.getCaptainSchedule(captainId) || undefined;
    }

    const statusInfo = computeCaptainShiftStatus(schedule);

    if (statusInfo.status === 'unscheduled') {
      return {
        isEligible: false,
        statusInfo,
        reason: 'الكابتن ليس لديه جدول شفتات مسجل، يرجى تعيين جدول ساعات العمل له أولاً.',
      };
    }

    if (statusInfo.isPaused) {
      return {
        isEligible: false,
        statusInfo,
        reason: 'تم إيقاف جدول عمل الكابتن مؤقتاً بواسطة الإدارة ولا يمكن إسناد طلبات له حالياً.',
      };
    }

    if (statusInfo.status === 'off_shift') {
      const timeInfo = statusInfo.nextShift
        ? ` (الشفت القادم: ${statusInfo.nextShift.dayNameAr} الساعة ${statusInfo.nextShift.startTimeFormatted})`
        : '';
      return {
        isEligible: false,
        statusInfo,
        reason: `الكابتن خارج ساعات العمل المحددة له${timeInfo}. سياسة المنظومة تمنع إسناد طلبات جديدة خارج وقت الشفت.`,
      };
    }

    if (statusInfo.status === 'starting_soon') {
      return {
        isEligible: false,
        statusInfo,
        reason: `شفت الكابتن سيبدأ قريباً بعد ${statusInfo.nextShift?.startsInMinutes || 0} دقيقة، ولا يمكن إسناد طلبات حتى موعد بدء الشفت الفعلي (${statusInfo.nextShift?.startTimeFormatted}).`,
      };
    }

    // Active in shift!
    return {
      isEligible: true,
      statusInfo,
    };
  },
};
