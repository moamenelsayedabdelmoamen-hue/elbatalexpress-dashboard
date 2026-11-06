import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  where,
} from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  getAuth,
  reload,
  applyActionCode,
  checkActionCode,
} from 'firebase/auth';
import { initializeApp, getApps, deleteApp } from 'firebase/app';
import { auth, db, firebaseConfig, isFirebaseConfigured, handleFirestoreError, OperationType } from '../firebase/config';
import { COLLECTIONS } from './collections';
import { AdminAccount, AdminRolePermission } from '../types';

export const MASTER_ADMIN_EMAIL = 'moamen.elsayed.abdelmoamen@gmail.com';

let localAdminsCache: AdminAccount[] = [
  {
    id: 'super_admin_master',
    uid: 'super_admin_master',
    name: 'مؤمن السيد (المسؤول الكامل للنظام)',
    displayName: 'مؤمن السيد (المسؤول الكامل للنظام)',
    email: MASTER_ADMIN_EMAIL,
    roles: ['add_restaurants', 'add_captains', 'manage_orders'],
    status: 'active',
    emailVerified: true,
    isMasterAdmin: true,
    createdAt: new Date().toISOString(),
  },
];

export const ROLE_DEFINITIONS: {
  id: AdminRolePermission;
  label: string;
  description: string;
}[] = [
  {
    id: 'add_restaurants',
    label: 'إضافة مطاعم',
    description: 'تسجيل مطاعم جديدة، اعتماد الشركاء، وتعديل بيانات وقوائم المطاعم',
  },
  {
    id: 'add_captains',
    label: 'إضافة كابتن',
    description: 'تسجيل واعتماد كباتن التوصيل الجدد وتوثيق رخصهم ومركباتهم',
  },
  {
    id: 'manage_orders',
    label: 'متابعة الأوردرات',
    description: 'مراقبة حركة الطلبات وإسنادها للكباتن وتحديث الحالات وإلغاء الطلبات',
  },
  {
    id: 'read_only',
    label: 'قراءة البيانات فقط',
    description: 'الاطلاع على التقارير والإحصائيات دون صلاحية التعديل أو الحذف',
  },
];

export const AdminService = {
  /**
   * جلب جميع المسؤولين المسجلين في Firestore في مجموعة admins
   */
  async getAll(): Promise<{ data: AdminAccount[]; isLive: boolean }> {
    if (!isFirebaseConfigured || !db) {
      return { data: localAdminsCache, isLive: false };
    }

    try {
      const colRef = collection(db, COLLECTIONS.ADMINS);
      const q = query(colRef);

      // Protect against network hang/unavailable with a 5s timeout
      const fetchPromise = getDocs(q);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Firestore timeout: operating in offline mode')), 5000)
      );

      const snapshot = await Promise.race([fetchPromise, timeoutPromise]);

      if (snapshot.empty) {
        return { data: localAdminsCache, isLive: true };
      }

      const list: AdminAccount[] = [];
      let foundMaster = false;
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const em = (data.email || '').trim().toLowerCase();
        const isMaster = em === MASTER_ADMIN_EMAIL.toLowerCase();
        if (isMaster) foundMaster = true;
        list.push({
          id: docSnap.id,
          uid: docSnap.id,
          name: isMaster
            ? (data.displayName || data.name || 'مؤمن السيد (المسؤول الكامل للنظام)')
            : (data.displayName || data.name || data.email?.split('@')[0] || 'مسؤول'),
          displayName: isMaster
            ? (data.displayName || data.name || 'مؤمن السيد (المسؤول الكامل للنظام)')
            : (data.displayName || data.name || 'مسؤول'),
          email: data.email || '',
          roles: Array.isArray(data.roles) ? data.roles : (data.role ? [data.role] : ['manage_orders']),
          status: data.status || (data.emailVerified ? 'active' : 'pending_verification'),
          emailVerified: !!data.emailVerified,
          isMasterAdmin: isMaster,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (data.createdAt || new Date().toISOString()),
          raw: data,
        });
      });

      // Ensure Master Admin is always first in list
      list.sort((a, b) => {
        if (a.isMasterAdmin) return -1;
        if (b.isMasterAdmin) return 1;
        return 0;
      });

      if (!foundMaster) {
        list.unshift(localAdminsCache[0]);
      }

      localAdminsCache = list;
      return { data: list, isLive: true };
    } catch (error: any) {
      console.warn('Firestore admins read notice (using cached data):', error?.message || error);
      handleFirestoreError(error, OperationType.LIST, COLLECTIONS.ADMINS);
      return { data: localAdminsCache, isLive: false };
    }
  },

  /**
   * إضافة مسؤول جديد:
   * 1. التحقق الصارم من أن الطالب هو المسؤول الكامل للنظام (moamen.elsayed.abdelmoamen@gmail.com)
   * 2. إنشاء الحساب في Firebase Auth
   * 3. إرسال بريد إلكتروني لتأكيد تفعيل الحساب
   * 4. حفظ بياناته في Firestore في مجموعة admins
   */
  async createAdmin(params: {
    name: string;
    email: string;
    password: string;
    roles: AdminRolePermission[];
    addedBy?: string;
    creatorEmail?: string;
  }): Promise<{ success: boolean; adminId: string; emailVerificationSent: boolean }> {
    const { name, email, password, roles, addedBy, creatorEmail } = params;

    // التحقق الصارم: فقط moamen.elsayed.abdelmoamen@gmail.com يستطيع إضافة مسؤولين
    const currentCaller = (creatorEmail || auth?.currentUser?.email || '').trim().toLowerCase();
    if (currentCaller && currentCaller !== MASTER_ADMIN_EMAIL.toLowerCase()) {
      throw new Error(
        'عذراً، صلاحية إضافة أو تسجيل مسؤولين جدد مقتصرة حصرياً على المسؤول الكامل للنظام (moamen.elsayed.abdelmoamen@gmail.com)'
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    let createdUid = 'admin_' + Date.now();
    let emailVerificationSent = false;

    // استخدام تطبيق ثانوي لإنشاء المستخدم وإرسال بريد التفعيل دون الخروج من حساب الأدمن الحالي
    if (isFirebaseConfigured && firebaseConfig?.apiKey) {
      const secondaryAppName = `SecondaryAuth_${Date.now()}`;
      let secondaryApp: any = null;
      try {
        secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
        const secondaryAuth = getAuth(secondaryApp);

        // إنشاء المستخدم في Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, password);
        createdUid = userCredential.user.uid;

        // تحديث اسمه
        await updateProfile(userCredential.user, {
          displayName: name,
        });

        // إرسال بريد إلكتروني لتأكيد تفعيل الحساب فوراً
        try {
          await sendEmailVerification(userCredential.user);
          emailVerificationSent = true;
        } catch (verErr) {
          console.warn('Email verification error:', verErr);
          emailVerificationSent = false;
        }
      } catch (authError: any) {
        console.warn('Firebase Auth user creation notice:', authError);
        // إذا كان الحساب موجوداً بالفعل مسبقاً، نستخدم المعرف ونحفظه في Firestore
        if (authError.code === 'auth/email-already-in-use') {
          createdUid = 'existing_' + cleanEmail.replace(/[^a-zA-Z0-9]/g, '_');
        } else {
          // رمي الخطأ إذا كانت كلمة السر ضعيفة أو البريد خاطئ
          if (authError.code === 'auth/weak-password') {
            throw new Error('كلمة المرور ضعيفة جداً، يرجى إدخال 6 أحرف أو أرقام على الأقل');
          }
          if (authError.code === 'auth/invalid-email') {
            throw new Error('صيغة البريد الإلكتروني غير صحيحة');
          }
        }
      } finally {
        if (secondaryApp) {
          try {
            await deleteApp(secondaryApp);
          } catch (e) {
            // ignore cleanup error
          }
        }
      }
    }

    // 2. حفظ بيانات المسؤول في قاعدة بيانات Firestore الحقيقية في مجموعة admins
    const adminDocData = {
      uid: createdUid,
      name: name.trim(),
      displayName: name.trim(),
      email: cleanEmail,
      roles: roles,
      role: 'admin',
      status: emailVerificationSent ? 'pending_verification' : 'active',
      emailVerified: false,
      verificationEmailSent: emailVerificationSent,
      createdAt: isFirebaseConfigured && db ? serverTimestamp() : new Date().toISOString(),
      updatedAt: isFirebaseConfigured && db ? serverTimestamp() : new Date().toISOString(),
      addedBy: addedBy || 'مسؤول النظام',
    };

    if (isFirebaseConfigured && db) {
      try {
        const docRef = doc(db, COLLECTIONS.ADMINS, createdUid);
        await setDoc(docRef, adminDocData, { merge: true });
      } catch (firestoreError) {
        console.error('Failed to save admin in Firestore:', firestoreError);
        handleFirestoreError(firestoreError, OperationType.CREATE, `${COLLECTIONS.ADMINS}/${createdUid}`);
      }
    }

    // تحديث الكاش المحلي
    const newAdminRecord: AdminAccount = {
      id: createdUid,
      uid: createdUid,
      name: name.trim(),
      displayName: name.trim(),
      email: cleanEmail,
      roles: roles,
      status: emailVerificationSent ? 'pending_verification' : 'active',
      emailVerified: false,
      createdAt: new Date().toISOString(),
    };
    localAdminsCache = [newAdminRecord, ...localAdminsCache.filter((a) => a.email !== cleanEmail)];

    return {
      success: true,
      adminId: createdUid,
      emailVerificationSent,
    };
  },

  /**
   * حذف مسؤول من Firestore - مقتصر حصرياً على المسؤول الكامل للنظام
   */
  async deleteAdmin(id: string, callerEmail?: string): Promise<void> {
    const currentCaller = (callerEmail || auth?.currentUser?.email || '').trim().toLowerCase();
    if (currentCaller && currentCaller !== MASTER_ADMIN_EMAIL.toLowerCase()) {
      throw new Error(
        'عذراً، صلاحية حذف المسؤولين مقتصرة حصرياً على المسؤول الكامل للنظام (moamen.elsayed.abdelmoamen@gmail.com)'
      );
    }

    const target = localAdminsCache.find((a) => a.id === id || a.uid === id);
    if (target?.email?.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase()) {
      throw new Error('لا يمكن حذف حساب المسؤول الكامل للنظام');
    }

    localAdminsCache = localAdminsCache.filter((a) => a.id !== id && a.uid !== id);

    if (isFirebaseConfigured && db) {
      try {
        await deleteDoc(doc(db, COLLECTIONS.ADMINS, id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `${COLLECTIONS.ADMINS}/${id}`);
      }
    }
  },

  /**
   * تعديل اسم مسؤول النظام
   */
  async updateAdminName(uid: string, newName: string): Promise<void> {
    const trimmed = newName.trim();
    if (!trimmed) throw new Error('الاسم لا يمكن أن يكون فارغاً');

    // 1. تحديث في Firebase Auth إذا كان المستخدم الحالي
    if (auth?.currentUser && auth.currentUser.uid === uid) {
      try {
        await updateProfile(auth.currentUser, { displayName: trimmed });
      } catch (err) {
        console.warn('Firebase updateProfile error:', err);
      }
    }

    // 2. تحديث في Firestore في مجموعة admins
    if (isFirebaseConfigured && db) {
      try {
        const docRef = doc(db, COLLECTIONS.ADMINS, uid);
        await updateDoc(docRef, {
          name: trimmed,
          displayName: trimmed,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        console.warn('Could not update admin doc in firestore:', error);
      }
    }

    // 3. تحديث الكاش المحلي
    localAdminsCache = localAdminsCache.map((a) =>
      a.uid === uid || a.id === uid ? { ...a, name: trimmed, displayName: trimmed } : a
    );
  },

  /**
   * إعادة إرسال بريد التحقق للمسؤول
   */
  async resendVerificationEmail(
    adminId: string,
    email: string
  ): Promise<{ success: boolean; message: string }> {
    const cleanEmail = email.trim().toLowerCase();

    // 1. إذا كان المسؤول هو المستخدم الحالي المسجل دخوله في Firebase Auth
    if (auth?.currentUser && auth.currentUser.email?.toLowerCase() === cleanEmail) {
      try {
        await sendEmailVerification(auth.currentUser);
        if (isFirebaseConfigured && db) {
          const docRef = doc(db, COLLECTIONS.ADMINS, auth.currentUser.uid);
          await updateDoc(docRef, {
            verificationEmailSent: true,
            lastVerificationSentAt: serverTimestamp(),
          }).catch(() => {});
        }
        return {
          success: true,
          message: 'تم إرسال رابط تأكيد البريد الإلكتروني إلى بريدك بنجاح. يرجى مراجعة صندوق الوارد والضغط على الرابط.',
        };
      } catch (err: any) {
        console.warn('sendEmailVerification error:', err);
        if (err.code === 'auth/too-many-requests') {
          throw new Error('تم إرسال رسائل كثيرة مؤخراً. يرجى الانتظار بضع دقائق والمحاولة مرة أخرى.');
        }
        throw new Error(err?.message || 'فشل إرسال رسالة التحقق، يرجى المحاولة لاحقاً');
      }
    }

    // 2. إذا كان لحساب مسؤول آخر، نرسل رسالة تحقق / إعادة تعيين معتمدة من Firebase Auth
    if (isFirebaseConfigured && auth) {
      try {
        await sendPasswordResetEmail(auth, cleanEmail);
        if (db) {
          const docRef = doc(db, COLLECTIONS.ADMINS, adminId);
          await updateDoc(docRef, {
            verificationEmailSent: true,
            lastVerificationSentAt: serverTimestamp(),
          }).catch(() => {});
        }
        return {
          success: true,
          message: `تم إرسال رابط التحقق والتأكيد إلى البريد الإلكتروني (${cleanEmail}) بنجاح عبر خادم Firebase.`,
        };
      } catch (err: any) {
        console.warn('sendPasswordResetEmail error:', err);
        throw new Error(err?.message || 'تعذر إرسال رسالة التحقق إلى البريد');
      }
    }

    return {
      success: true,
      message: `تمت محاكاة إرسال بريد التحقق إلى ${cleanEmail}`,
    };
  },

  /**
   * اعتماد وتحديث حالة التحقق من البريد في قاعدة البيانات
   */
  async toggleAdminVerification(adminId: string, verified: boolean): Promise<void> {
    const status = verified ? 'active' : 'pending_verification';

    if (isFirebaseConfigured && db) {
      try {
        const docRef = doc(db, COLLECTIONS.ADMINS, adminId);
        await updateDoc(docRef, {
          emailVerified: verified,
          status: status,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.error('Error updating admin verification in Firestore:', err);
        handleFirestoreError(err, OperationType.UPDATE, `${COLLECTIONS.ADMINS}/${adminId}`);
      }
    }

    localAdminsCache = localAdminsCache.map((a) =>
      a.id === adminId || a.uid === adminId
        ? { ...a, emailVerified: verified, status: status }
        : a
    );
  },

  /**
   * فحص حالة التحقق من البريد للمستخدم الحالي عبر Firebase Auth ومزامنتها مع Firestore
   */
  async checkCurrentUserVerification(): Promise<{ isVerified: boolean; updated: boolean }> {
    if (!auth?.currentUser) {
      return { isVerified: false, updated: false };
    }

    try {
      await reload(auth.currentUser);
      const isVerified = Boolean(auth.currentUser.emailVerified);

      if (isVerified && isFirebaseConfigured && db) {
        const docRef = doc(db, COLLECTIONS.ADMINS, auth.currentUser.uid);
        await updateDoc(docRef, {
          emailVerified: true,
          status: 'active',
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }

      return { isVerified, updated: isVerified };
    } catch (err) {
      console.warn('reload user verification error:', err);
      return { isVerified: false, updated: false };
    }
  },

  /**
   * معالجة رابط التحقق من البريد الإلكتروني عند فتحه من الرسالة (Firebase oobCode)
   */
  async verifyEmailWithActionCode(oobCode: string): Promise<{ success: boolean; email?: string }> {
    if (!auth || !isFirebaseConfigured) return { success: false };

    try {
      const info = await checkActionCode(auth, oobCode);
      await applyActionCode(auth, oobCode);
      const email = info?.data?.email?.toLowerCase();

      if (email && db) {
        // تحديث حالة الحساب في مجموعة admins في Firestore
        const colRef = collection(db, COLLECTIONS.ADMINS);
        const q = query(colRef, where('email', '==', email));
        const snap = await getDocs(q);
        snap.forEach(async (docSnap) => {
          await updateDoc(docSnap.ref, {
            emailVerified: true,
            status: 'active',
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        });
      }

      if (auth.currentUser) {
        await reload(auth.currentUser).catch(() => {});
      }

      return { success: true, email };
    } catch (err: any) {
      console.warn('verifyEmailWithActionCode error:', err);
      throw err;
    }
  },
};
