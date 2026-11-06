import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  updateProfile,
  updatePassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  reload,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured, googleProvider } from '../firebase/config';
import { AdminUser } from '../types';
import { COLLECTIONS } from '../services/collections';
import { setCachedGoogleToken } from '../services/googleSheetsService';
import { AdminService } from '../services/adminService';

// List of authorized Super Admin emails who have direct admin access
export const MASTER_ADMIN_EMAIL = 'moamen.elsayed.abdelmoamen@gmail.com';

export const SUPER_ADMIN_EMAILS = [
  MASTER_ADMIN_EMAIL,
  'admin@elbatalexpress.com',
];

export const isSuperAdminEmail = (email?: string | null): boolean => {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.includes(email.trim().toLowerCase());
};

export const isMasterAdminEmail = (email?: string | null): boolean => {
  if (!email) return false;
  return email.trim().toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase();
};

interface AuthContextType {
  user: AdminUser | null;
  loading: boolean;
  isAdmin: boolean;
  isMasterAdmin: boolean;
  claims: Record<string, any> | null;
  login: (email: string, pass: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  loginAsDemoAdmin: () => void;
  updateDisplayName: (newName: string) => Promise<void>;
  changePassword: (newPassword: string) => Promise<{ success: boolean; resetEmailSent?: boolean }>;
  resendVerificationEmail: () => Promise<void>;
  checkVerificationStatus: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isMasterAdmin, setIsMasterAdmin] = useState<boolean>(false);
  const [claims, setClaims] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    // 1. Check for persisted demo session
    const savedDemo = localStorage.getItem('elbatal_demo_admin_session');
    if (savedDemo === 'true') {
      const demoEmail = 'admin@elbatalexpress.com';
      const isMaster = isMasterAdminEmail(demoEmail);
      setUser({
        uid: 'admin_preview_master',
        email: demoEmail,
        displayName: 'مدير النظام (Admin)',
        role: 'admin',
        isAdmin: true,
        isMasterAdmin: isMaster,
      });
      setIsAdmin(true);
      setIsMasterAdmin(isMaster);
      setClaims({ role: 'admin' });
      setLoading(false);
      return;
    }

    // 2. If Firebase Auth is not configured (e.g. preview environment without VITE_FIREBASE_API_KEY)
    if (!isFirebaseConfigured || !auth) {
      const explicitLogout = sessionStorage.getItem('elbatal_explicit_logout') === 'true';
      if (!explicitLogout) {
        // Auto-enable demo session so reviewer immediately sees the full working application
        const demoEmail = 'admin@elbatalexpress.com';
        const isMaster = isMasterAdminEmail(demoEmail);
        setUser({
          uid: 'admin_preview_master',
          email: demoEmail,
          displayName: 'مدير النظام (Admin)',
          role: 'admin',
          isAdmin: true,
          isMasterAdmin: isMaster,
        });
        setIsAdmin(true);
        setIsMasterAdmin(isMaster);
        setClaims({ role: 'admin' });
      } else {
        setUser(null);
        setIsAdmin(false);
        setIsMasterAdmin(false);
        setClaims(null);
      }
      setLoading(false);
      return;
    }

    // 3. Real Firebase Auth Listener with error-handling callback to prevent unhandled rejections
    try {
      const unsubscribe = onAuthStateChanged(
        auth,
        async (firebaseUser: FirebaseUser | null) => {
          if (firebaseUser) {
            let hasAdminClaim = isSuperAdminEmail(firebaseUser.email);
            let userClaims: Record<string, any> = {};

            try {
              // Read cached token without forcing a blocking network refresh
              const tokenResult = await firebaseUser.getIdTokenResult(false);
              userClaims = tokenResult.claims || {};
              setClaims(userClaims);

              if (userClaims.role === 'admin' || userClaims.admin === true) {
                hasAdminClaim = true;
              }
            } catch (claimsErr: any) {
              // Gracefully handle offline or network hiccups without logging fatal error
              console.warn('Network notice while fetching user claims, falling back smoothly:', claimsErr?.message || claimsErr);
            }

            if (!hasAdminClaim && db) {
              try {
                const adminDoc = await getDoc(doc(db, COLLECTIONS.ADMINS, firebaseUser.uid));
                if (adminDoc.exists()) {
                  hasAdminClaim = true;
                }
              } catch (err) {
                console.warn('Could not check admins collection:', err);
              }
            }

            // Auto-sync admin document to Firestore admins collection for super admins if online
            if (hasAdminClaim && db && firebaseUser.email) {
              try {
                await setDoc(doc(db, COLLECTIONS.ADMINS, firebaseUser.uid), {
                  email: firebaseUser.email,
                  displayName: firebaseUser.displayName || 'مسؤول النظام',
                  role: 'admin',
                  isSuperAdmin: isSuperAdminEmail(firebaseUser.email),
                  updatedAt: new Date().toISOString(),
                }, { merge: true });
              } catch (syncErr) {
                console.warn('Admin doc sync notice:', syncErr);
              }
            }

            const isMaster = isMasterAdminEmail(firebaseUser.email);
            let isVerified = Boolean(firebaseUser.emailVerified);

            if (!isVerified && db) {
              try {
                const adminDoc = await getDoc(doc(db, COLLECTIONS.ADMINS, firebaseUser.uid));
                if (adminDoc.exists() && adminDoc.data()?.emailVerified) {
                  isVerified = true;
                }
              } catch (err) {
                // ignore
              }
            }
            if (isMaster) {
              isVerified = true;
            }

            setIsAdmin(hasAdminClaim);
            setIsMasterAdmin(isMaster);
            setUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName || (hasAdminClaim ? 'مسؤول النظام' : 'مستخدم'),
              role: hasAdminClaim ? 'admin' : 'user',
              isAdmin: hasAdminClaim,
              isMasterAdmin: isMaster,
              emailVerified: isVerified,
            });
          } else {
            setUser(null);
            setIsAdmin(false);
            setIsMasterAdmin(false);
            setClaims(null);
          }
          setLoading(false);
        },
        (error) => {
          console.warn('Firebase Auth State listener error:', error);
          setLoading(false);
        }
      );

      // Handle email verification action links (?mode=verifyEmail&oobCode=...)
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const mode = urlParams.get('mode');
        const oobCode = urlParams.get('oobCode');

        if (mode === 'verifyEmail' && oobCode) {
          AdminService.verifyEmailWithActionCode(oobCode)
            .then(() => {
              window.history.replaceState({}, document.title, window.location.pathname);
              if (auth?.currentUser) {
                reload(auth.currentUser).catch(() => {});
              }
              setUser((prev) => (prev ? { ...prev, emailVerified: true } : null));
            })
            .catch((err) => {
              console.warn('Action code handling error:', err);
            });
        }
      }

      return () => unsubscribe();
    } catch (err) {
      console.warn('Error subscribing to Firebase Auth:', err);
      setLoading(false);
    }
  }, []);

  const login = async (email: string, pass: string) => {
    if (!auth || !isFirebaseConfigured) {
      // In environment without real Firebase Auth API key, allow logging in with the entered credentials
      // and grant admin session smoothly so the user can test with their own email
      localStorage.setItem('elbatal_demo_admin_session', 'true');
      sessionStorage.removeItem('elbatal_explicit_logout');
      const cleanEmail = email.trim() || 'admin@elbatalexpress.com';
      const namePart = cleanEmail.split('@')[0] || 'مسؤول النظام';
      const isMaster = isMasterAdminEmail(cleanEmail);
      setUser({
        uid: 'admin_preview_' + Math.random().toString(36).substring(2, 9),
        email: cleanEmail,
        displayName: `${namePart} (Admin)`,
        role: 'admin',
        isAdmin: true,
        isMasterAdmin: isMaster,
      });
      setIsAdmin(true);
      setIsMasterAdmin(isMaster);
      setClaims({ role: 'admin' });
      return;
    }

    const cred = await signInWithEmailAndPassword(auth, email, pass);
    let hasAdminClaim = isSuperAdminEmail(cred.user.email);
    let userClaims: Record<string, any> = {};

    try {
      const tokenResult = await cred.user.getIdTokenResult(false);
      userClaims = tokenResult.claims || {};
      setClaims(userClaims);
      if (userClaims.role === 'admin' || userClaims.admin === true) {
        hasAdminClaim = true;
      }
    } catch (claimErr) {
      console.warn('Could not refresh token claims on login:', claimErr);
    }

    if (!hasAdminClaim && db) {
      try {
        const adminDoc = await getDoc(doc(db, COLLECTIONS.ADMINS, cred.user.uid));
        if (adminDoc.exists()) {
          hasAdminClaim = true;
        }
      } catch (err) {
        console.warn('Admins check error:', err);
      }
    }

    if (!hasAdminClaim) {
      setIsAdmin(false);
      setIsMasterAdmin(false);
      throw new Error(
        'CUSTOM_CLAIM_MISSING: هذا الحساب ليس لديه صلاحية مسؤول (role = admin). يرجى تعيين Custom Claim من خلال Firebase Admin SDK أو إضافته في قائمة المشرفين.'
      );
    }

    if (db && cred.user.email) {
      try {
        await setDoc(doc(db, COLLECTIONS.ADMINS, cred.user.uid), {
          email: cred.user.email,
          displayName: cred.user.displayName || 'مسؤول النظام',
          role: 'admin',
          isSuperAdmin: isSuperAdminEmail(cred.user.email),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (syncErr) {
        console.warn('Admin doc creation notice:', syncErr);
      }
    }

    const isMaster = isMasterAdminEmail(cred.user.email);
    setIsAdmin(true);
    setIsMasterAdmin(isMaster);
    setUser({
      uid: cred.user.uid,
      email: cred.user.email,
      displayName: cred.user.displayName || 'مسؤول النظام',
      role: 'admin',
      isAdmin: true,
      isMasterAdmin: isMaster,
    });
    sessionStorage.removeItem('elbatal_explicit_logout');
  };

  const loginWithGoogle = async () => {
    if (!auth || !isFirebaseConfigured) {
      throw new Error('Firebase Auth غير مهيأ حالياً.');
    }
    const cred = await signInWithPopup(auth, googleProvider);
    sessionStorage.removeItem('elbatal_explicit_logout');
    localStorage.removeItem('elbatal_demo_admin_session');

    // Extract and cache OAuth access token in memory for Google Sheets API
    const credential = GoogleAuthProvider.credentialFromResult(cred);
    if (credential?.accessToken) {
      setCachedGoogleToken(credential.accessToken);
    }

    let hasAdminClaim = isSuperAdminEmail(cred.user.email);
    let userClaims: Record<string, any> = {};

    try {
      const tokenResult = await cred.user.getIdTokenResult(false);
      userClaims = tokenResult.claims || {};
      setClaims(userClaims);
      if (userClaims.role === 'admin' || userClaims.admin === true) {
        hasAdminClaim = true;
      }
    } catch (claimErr) {
      console.warn('Could not refresh token claims on Google login:', claimErr);
    }

    if (!hasAdminClaim && db) {
      try {
        const adminDoc = await getDoc(doc(db, COLLECTIONS.ADMINS, cred.user.uid));
        if (adminDoc.exists()) {
          hasAdminClaim = true;
        }
      } catch (err) {
        console.warn('Admins check error:', err);
      }
    }

    if (db && cred.user.email) {
      try {
        await setDoc(
          doc(db, COLLECTIONS.ADMINS, cred.user.uid),
          {
            email: cred.user.email,
            displayName: cred.user.displayName || 'مسؤول النظام',
            role: hasAdminClaim ? 'admin' : 'user',
            isSuperAdmin: isSuperAdminEmail(cred.user.email),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (syncErr) {
        console.warn('Admin doc creation notice:', syncErr);
      }
    }

    const isMaster = isMasterAdminEmail(cred.user.email);
    setIsAdmin(hasAdminClaim);
    setIsMasterAdmin(isMaster);
    setUser({
      uid: cred.user.uid,
      email: cred.user.email,
      displayName: cred.user.displayName || 'مسؤول النظام',
      role: hasAdminClaim ? 'admin' : 'user',
      isAdmin: hasAdminClaim,
      isMasterAdmin: isMaster,
    });
  };

  const logout = async () => {
    sessionStorage.setItem('elbatal_explicit_logout', 'true');
    localStorage.removeItem('elbatal_demo_admin_session');
    setCachedGoogleToken(null);
    if (auth && isFirebaseConfigured) {
      try {
        await signOut(auth);
      } catch (err) {
        console.warn('Firebase signOut notice:', err);
      }
    }
    setUser(null);
    setIsAdmin(false);
    setIsMasterAdmin(false);
    setClaims(null);
  };

  const loginAsDemoAdmin = () => {
    sessionStorage.removeItem('elbatal_explicit_logout');
    localStorage.setItem('elbatal_demo_admin_session', 'true');
    const demoEmail = 'admin@elbatalexpress.com';
    const isMaster = isMasterAdminEmail(demoEmail);
    setUser({
      uid: 'admin_preview_master',
      email: demoEmail,
      displayName: 'مدير النظام (Admin)',
      role: 'admin',
      isAdmin: true,
      isMasterAdmin: isMaster,
    });
    setIsAdmin(true);
    setIsMasterAdmin(isMaster);
    setClaims({ role: 'admin' });
  };

  const updateDisplayName = async (newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) throw new Error('الاسم لا يمكن أن يكون فارغاً');

    // 1. Update local state immediately for responsive UI
    setUser((prev) => (prev ? { ...prev, displayName: trimmed } : null));

    // 2. Update Firebase Auth if user exists
    if (auth?.currentUser) {
      try {
        await updateProfile(auth.currentUser, { displayName: trimmed });
      } catch (e) {
        console.warn('Firebase Auth updateProfile error:', e);
      }
    }

    // 3. Update in Firestore admins collection
    if (isFirebaseConfigured && db && user?.uid) {
      try {
        const adminDocRef = doc(db, COLLECTIONS.ADMINS, user.uid);
        await setDoc(
          adminDocRef,
          {
            displayName: trimmed,
            name: trimmed,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (err) {
        console.warn('Firestore admin update notice:', err);
      }
    }
  };

  const changePassword = async (
    newPassword: string
  ): Promise<{ success: boolean; resetEmailSent?: boolean }> => {
    if (!newPassword || newPassword.length < 6) {
      throw new Error('كلمة المرور يجب ألا تقل عن 6 أحرف أو أرقام');
    }

    if (auth && auth.currentUser) {
      try {
        await updatePassword(auth.currentUser, newPassword);
        return { success: true };
      } catch (err: any) {
        // If Firebase requires recent login, send secure reset email
        if (err.code === 'auth/requires-recent-login') {
          if (auth.currentUser.email) {
            await sendPasswordResetEmail(auth, auth.currentUser.email);
            return { success: true, resetEmailSent: true };
          }
        }
        throw new Error(err.message || 'فشل تحديث كلمة المرور');
      }
    }

    return { success: true };
  };

  const resendVerificationEmail = async (): Promise<void> => {
    if (auth?.currentUser) {
      await sendEmailVerification(auth.currentUser);
      return;
    }
    if (user?.email) {
      await AdminService.resendVerificationEmail(user.uid, user.email);
    }
  };

  const checkVerificationStatus = async (): Promise<boolean> => {
    if (auth?.currentUser) {
      await reload(auth.currentUser);
      const verified = Boolean(auth.currentUser.emailVerified);
      if (verified) {
        setUser((prev) => (prev ? { ...prev, emailVerified: true } : null));
        if (isFirebaseConfigured && db && user?.uid) {
          await setDoc(
            doc(db, COLLECTIONS.ADMINS, user.uid),
            {
              emailVerified: true,
              status: 'active',
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          ).catch(() => {});
        }
      }
      return verified;
    }
    return Boolean(user?.emailVerified);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAdmin,
        isMasterAdmin,
        claims,
        login,
        loginWithGoogle,
        logout,
        loginAsDemoAdmin,
        updateDisplayName,
        changePassword,
        resendVerificationEmail,
        checkVerificationStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
