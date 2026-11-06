import React, { useState, useEffect } from 'react';
import {
  Shield,
  UserPlus,
  Mail,
  Lock,
  User,
  CheckSquare,
  Square,
  Eye,
  EyeOff,
  CheckCircle2,
  Trash2,
  RefreshCw,
  Clock,
  Send,
  AlertCircle,
  Users,
  Crown,
  KeyRound,
} from 'lucide-react';
import { AdminService, ROLE_DEFINITIONS, MASTER_ADMIN_EMAIL } from '../services/adminService';
import { AdminAccount, AdminRolePermission } from '../types';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { EmptyState } from '../components/common/EmptyState';

export const AdminsPage: React.FC = () => {
  const { user, isMasterAdmin, resendVerificationEmail, checkVerificationStatus } = useAuth();
  const { success, error: toastError, info } = useToast();

  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [selectedRoles, setSelectedRoles] = useState<AdminRolePermission[]>([
    'manage_orders',
  ]);

  // Last action feedback banner
  const [lastActionStatus, setLastActionStatus] = useState<{
    email: string;
    verifiedSent: boolean;
  } | null>(null);

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      const res = await AdminService.getAll();
      setAdmins(res.data);
    } catch (err) {
      console.error('Failed to load admins:', err);
      toastError('فشل تحميل قائمة المسؤولين');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const toggleRole = (roleId: AdminRolePermission) => {
    if (selectedRoles.includes(roleId)) {
      // Prevent deselecting all roles
      if (selectedRoles.length === 1) {
        toastError('يجب اختيار دور واحد على الأقل للمسؤول');
        return;
      }
      setSelectedRoles(selectedRoles.filter((r) => r !== roleId));
    } else {
      setSelectedRoles([...selectedRoles, roleId]);
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isMasterAdmin) {
      toastError('عذراً، صلاحية إضافة مسؤولين جدد مقتصرة حصرياً على المسؤول الكامل للنظام (moamen.elsayed.abdelmoamen@gmail.com)');
      return;
    }

    if (!name.trim()) {
      toastError('يرجى إدخال اسم المسؤول');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      toastError('يرجى إدخال بريد إلكتروني صحيح');
      return;
    }
    if (!password || password.length < 6) {
      toastError('كلمة المرور يجب ألا تقل عن 6 أحرف أو أرقام');
      return;
    }
    if (selectedRoles.length === 0) {
      toastError('يرجى تحديد دور واحد على الأقل');
      return;
    }

    setSubmitting(true);
    try {
      const result = await AdminService.createAdmin({
        name: name.trim(),
        email: email.trim(),
        password: password,
        roles: selectedRoles,
        addedBy: user?.displayName || user?.email || 'المسؤول الكامل للنظام',
        creatorEmail: user?.email || undefined,
      });

      setLastActionStatus({
        email: email.trim(),
        verifiedSent: result.emailVerificationSent,
      });

      success('تم حفظ المسؤول في Firestore وإرسال بريد تفعيل الحساب بنجاح!');
      
      // Reset form
      setName('');
      setEmail('');
      setPassword('');
      setSelectedRoles(['manage_orders']);

      // Refresh admins list
      await fetchAdmins();
    } catch (err: any) {
      console.error('Error creating admin:', err);
      toastError(err.message || 'حدث خطأ أثناء إضافة المسؤول وحفظ البيانات');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (adminId: string, adminName: string) => {
    if (!isMasterAdmin) {
      toastError('عذراً، صلاحية حذف حسابات المسؤولين مقتصرة حصرياً على المسؤول الكامل للنظام');
      return;
    }

    if (adminId === user?.uid) {
      toastError('لا يمكنك حذف حسابك الحالي');
      return;
    }

    if (!window.confirm(`هل أنت متأكد من حذف المسؤول "${adminName}" من النظام؟`)) {
      return;
    }

    try {
      await AdminService.deleteAdmin(adminId, user?.email || undefined);
      setAdmins((prev) => prev.filter((a) => a.id !== adminId && a.uid !== adminId));
      success('تم حذف المسؤول من قاعدة البيانات بنجاح');
    } catch (err: any) {
      toastError(err?.message || 'فشل حذف المسؤول');
    }
  };

  const handleResendVerification = async (adminId: string, targetEmail: string) => {
    setSendingEmailId(adminId);
    try {
      const res = await AdminService.resendVerificationEmail(adminId, targetEmail);
      success(res.message);
    } catch (err: any) {
      toastError(err?.message || 'فشل إرسال بريد التحقق');
    } finally {
      setSendingEmailId(null);
    }
  };

  const handleToggleVerification = async (adminId: string, currentVerified: boolean) => {
    try {
      const nextVerified = !currentVerified;
      await AdminService.toggleAdminVerification(adminId, nextVerified);
      setAdmins((prev) =>
        prev.map((a) =>
          a.id === adminId || a.uid === adminId
            ? { ...a, emailVerified: nextVerified, status: nextVerified ? 'active' : 'pending_verification' }
            : a
        )
      );
      success(
        nextVerified
          ? 'تم اعتماد وتأكيد البريد الإلكتروني بنجاح في قاعدة البيانات (حساب مفعّل)'
          : 'تم تغيير حالة الحساب إلى بانتظار التحقق من البريد'
      );
    } catch (err: any) {
      toastError('فشل تعديل حالة التحقق من البريد');
    }
  };

  const handleCheckMyVerification = async () => {
    try {
      const isVerified = await checkVerificationStatus();
      if (isVerified) {
        success('تهانينا! تم التحقق من بريدك الإلكتروني بنجاح وتحديث حسابك.');
        await fetchAdmins();
      } else {
        toastError('لم يتم التحقق من الرابط بعد. يرجى فتح البريد الإلكتروني والضغط على رابط التحقق ثم المحاولة مرة أخرى.');
      }
    } catch (err: any) {
      toastError('فشل فحص حالة التحقق');
    }
  };

  return (
    <div className="space-y-8" dir="rtl">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
              <Shield className="w-5 h-5" />
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-white">
              إدارة صلاحيات وحسابات المسؤولين (Admins)
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-zinc-400">
            متابعة مسؤولي النظام وحوكمة الصلاحيات وإضافة مسؤولي التشغيل
          </p>
        </div>

        <button
          onClick={fetchAdmins}
          disabled={loading}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-xs font-bold transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
          <span>تحديث المسؤولين</span>
        </button>
      </div>

      {/* Unverified Email Warning Banner for Current User */}
      {user && user.emailVerified === false && (
        <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-rose-950/70 via-amber-950/40 to-zinc-900 border border-amber-500/40 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0">
              <Mail className="w-6 h-6 animate-pulse" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-white">برجاء تأكيد بريدك الإلكتروني</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                  لم يتم تأكيد الحساب بعد
                </span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                تم إرسال رابط تأكيد وتفعيل الحساب إلى <strong className="text-amber-300 font-mono">{user.email}</strong> من قاعدة البيانات. يرجى فتح البريد الإلكتروني والضغط على الرابط لتأكيد حسابك.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={() => handleResendVerification(user.uid, user.email || '')}
              disabled={sendingEmailId === user.uid}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-black transition-all shadow-md shadow-amber-500/20 cursor-pointer disabled:opacity-50"
            >
              {sendingEmailId === user.uid ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5 -rotate-45" />
              )}
              <span>إعادة إرسال بريد التحقق</span>
            </button>

            <button
              onClick={handleCheckMyVerification}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs font-bold transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>تحققت بالفعل (تحديث الحالة)</span>
            </button>
          </div>
        </div>
      )}

      {/* Master Super Admin System Policy Banner */}
      <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-amber-500/15 via-[#161a26] to-[#0e111a] border border-amber-500/30 shadow-lg shadow-amber-500/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-950 flex items-center justify-center shrink-0 shadow-md shadow-amber-500/20">
            <Crown className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black text-amber-400">المسؤول الكامل للنظام:</span>
              <span className="text-xs font-mono font-bold text-white bg-black/60 px-2.5 py-0.5 rounded-lg border border-amber-500/40" dir="ltr">
                {MASTER_ADMIN_EMAIL}
              </span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              يمتلك الصلاحية الحصرية لإضافة أو حذف مسؤولي النظام. ولا يمكن لأي مسؤول فرعي آخر إضافة أو تسجيل مسؤولين من حسابه.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isMasterAdmin ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-black shadow-xs">
              <Crown className="w-3.5 h-3.5" />
              <span>أنت المسؤول الكامل للنظام (كامل الصلاحيات)</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700/80 text-zinc-300 text-xs font-bold">
              <Shield className="w-3.5 h-3.5 text-zinc-400" />
              <span>أنت مسجل كمسؤول فرعي (مشاهدة فقط)</span>
            </span>
          )}
        </div>
      </div>

      {/* Success Notification Banner when an admin is created */}
      {lastActionStatus && (
        <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-bold text-emerald-200">
              تم تسجيل المسؤول الجديد بنجاح في قاعدة بيانات Firestore (`admins`)
            </p>
            <p className="text-xs text-emerald-300/80">
              تم إرسال رسالة بريد إلكتروني تلقائية إلى <strong className="text-white font-mono">{lastActionStatus.email}</strong> تحتوي على رابط التحقق وتفعيل الحساب.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Form Card: Add Admin (Only for Master Super Admin) */}
        {!isMasterAdmin ? (
          <div className="lg:col-span-5 bg-gradient-to-b from-[#121622] to-[#0e111a] border border-amber-500/20 rounded-3xl p-6 shadow-xl space-y-5">
            <div className="flex items-center gap-3 pb-4 border-b border-zinc-800">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">إضافة مسؤول جديد</h3>
                <p className="text-xs text-amber-400 font-semibold">صلاحية مقيدة بالمسؤول الكامل</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800/90 space-y-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1.5 text-xs text-zinc-300 leading-relaxed">
                  <p className="font-bold text-white text-sm">
                    حسابك الحالي لا يمتلك صلاحية إضافة مسؤولين
                  </p>
                  <p>
                    وفقاً لتعليمات وسياسة الأمان المشددة لمنظومة البطل إكسبريس، فإن صلاحية إضافة أو تسجيل أو حذف المسؤولين محصورة بشكل كامل وتلقائي بالمسؤول الكامل للنظام:
                  </p>
                  <div className="p-2.5 rounded-xl bg-black/60 border border-amber-500/30 font-mono text-amber-300 font-bold text-xs text-left" dir="ltr">
                    {MASTER_ADMIN_EMAIL}
                  </div>
                  <p className="text-zinc-400 text-[11px] pt-1">
                    لا يمكن لأي مسؤول فرعي إضافة أو تسجيل مسؤول آخر لحماية النظام ومنع منح صلاحيات غير معتمدة.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 space-y-2">
              <h4 className="text-xs font-bold text-zinc-300">نطاق صلاحيات حسابك الحالي:</h4>
              <ul className="text-xs text-zinc-400 space-y-2">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>الاطلاع على قائمة المسؤولين المسجلين في النظام</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>إدارة المهام والشفتات والطلبات حسب الأدوار المخصصة لك</span>
                </li>
                <li className="flex items-center gap-2 text-rose-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  <span>إضافة أو تسجيل مسؤولين جدد (مقيد حصرياً للمسؤول الكامل)</span>
                </li>
                <li className="flex items-center gap-2 text-rose-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  <span>حذف أو تعطيل حسابات المسؤولين (مقيد حصرياً للمسؤول الكامل)</span>
                </li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-5 bg-gradient-to-b from-[#121622] to-[#0e111a] border border-amber-500/30 rounded-3xl p-6 shadow-xl">
            <div className="flex items-center gap-3 pb-4 mb-6 border-b border-zinc-800">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">إضافة مسؤول جديد</h3>
                <p className="text-xs text-amber-400/90 font-medium">متاح لك بصفتك المسؤول الكامل للنظام</p>
              </div>
            </div>

            <form onSubmit={handleCreateAdmin} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                  اسم المسؤول الكامل <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="مثال: أحمد محمد مصطفى"
                    className="w-full bg-zinc-900/90 border border-zinc-700/80 rounded-xl pl-4 pr-10 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-hidden focus:border-amber-400 transition-colors"
                    required
                  />
                  <User className="w-4 h-4 text-zinc-400 absolute right-3.5 top-3 pointer-events-none" />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                  البريد الإلكتروني <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@elbatalexpress.com"
                    dir="ltr"
                    className="w-full bg-zinc-900/90 border border-zinc-700/80 rounded-xl pl-4 pr-10 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 text-left focus:outline-hidden focus:border-amber-400 transition-colors font-mono"
                    required
                  />
                  <Mail className="w-4 h-4 text-zinc-400 absolute right-3.5 top-3 pointer-events-none" />
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">
                  سيتم إرسال بريد التأكيد والتفعيل لهذا العنوان مباشرة فور الحفظ.
                </p>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                  كلمة السر <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    dir="ltr"
                    className="w-full bg-zinc-900/90 border border-zinc-700/80 rounded-xl pl-10 pr-10 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 text-left focus:outline-hidden focus:border-amber-400 transition-colors font-mono"
                    required
                  />
                  <Lock className="w-4 h-4 text-zinc-400 absolute right-3.5 top-3 pointer-events-none" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-2.5 text-zinc-400 hover:text-zinc-200 p-0.5"
                    aria-label="إظهار أو إخفاء كلمة المرور"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">
                  لا تقل عن 6 خانات لحماية الحساب.
                </p>
              </div>

              {/* Roles Selection (Checkboxes with Checkmarks) */}
              <div className="pt-2">
                <label className="block text-xs font-bold text-zinc-200 mb-2">
                  دور وصلاحيات المسؤول (يمكن اختيار أكثر من دور): <span className="text-rose-400">*</span>
                </label>

                <div className="space-y-2.5">
                  {ROLE_DEFINITIONS.map((role) => {
                    const isChecked = selectedRoles.includes(role.id);
                    return (
                      <div
                        key={role.id}
                        onClick={() => toggleRole(role.id)}
                        className={`p-3 rounded-xl border cursor-pointer select-none transition-all flex items-start gap-3 ${
                          isChecked
                            ? 'bg-amber-500/10 border-amber-500/40 text-amber-200 shadow-xs'
                            : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:bg-zinc-800/40 hover:border-zinc-700'
                        }`}
                      >
                        <div className="mt-0.5 shrink-0">
                          {isChecked ? (
                            <div className="w-5 h-5 rounded-md bg-amber-500 flex items-center justify-center text-zinc-950 font-bold shadow-xs">
                              <CheckCircle2 className="w-4 h-4" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded-md border-2 border-zinc-600 bg-zinc-800/50" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-bold ${isChecked ? 'text-amber-300' : 'text-zinc-200'}`}>
                              {role.label}
                            </span>
                            {isChecked && (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-400/20 text-amber-300">
                                مفعّل ✓
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                            {role.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-zinc-950 font-black text-sm shadow-lg shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>جاري حفظ المسؤول وإرسال بريد التفعيل...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 -rotate-45" />
                      <span>حفظ البيانات وإضافة مسؤول</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Admins List Table / Cards */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-400" />
              <h3 className="text-base font-bold text-white">المسؤولين المسجلين في النظام (`admins`)</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-amber-400 font-mono font-bold">
                {admins.length}
              </span>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-24 bg-zinc-900/60 border border-zinc-800 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : admins.length === 0 ? (
            <EmptyState
              icon={Shield}
              title="لا يوجد مسؤولين مسجلين"
              description="قم بإضافة أول مسؤول للنظام باستخدام النموذج الجانبي"
            />
          ) : (
            <div className="space-y-3">
              {admins.map((admin) => {
                const isCurrent = admin.uid === user?.uid || admin.email === user?.email;
                const isMaster = admin.isMasterAdmin || admin.email?.trim().toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase();

                return (
                  <div
                    key={admin.id || admin.uid}
                    className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                      isMaster
                        ? 'bg-gradient-to-r from-amber-500/10 via-[#10131d] to-[#10131d] border-amber-500/40 shadow-sm'
                        : 'bg-[#10131d] border-zinc-800 hover:border-zinc-700/80'
                    }`}
                  >
                    <div className="flex items-start sm:items-center gap-3.5">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${
                          isMaster
                            ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-950 border border-amber-300 shadow-md shadow-amber-500/20'
                            : 'bg-zinc-800 border border-zinc-700 text-amber-400'
                        }`}
                      >
                        {isMaster ? <Crown className="w-5 h-5" /> : admin.name?.charAt(0) || 'A'}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-white">{admin.name}</h4>
                          {isMaster && (
                            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-black border border-amber-500/40 flex items-center gap-1 shadow-xs">
                              <Crown className="w-3 h-3 text-amber-400" />
                              <span>المسؤول الكامل للنظام</span>
                            </span>
                          )}
                          {!isMaster && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-bold border border-zinc-700">
                              مسؤول فرعي
                            </span>
                          )}
                          {isCurrent && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                              أنت (الحساب الحالي)
                            </span>
                          )}
                          {admin.emailVerified ? (
                            <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shadow-xs">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span>تم التحقق من البريد الإلكتروني</span>
                            </span>
                          ) : (
                            <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1 shadow-xs">
                              <AlertCircle className="w-3 h-3 text-amber-400" />
                              <span>لم يتم تأكيد البريد الإلكتروني</span>
                            </span>
                          )}
                        </div>

                        <p className="text-xs font-mono text-zinc-400" dir="ltr">
                          {admin.email}
                        </p>

                        {/* Badges for roles */}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {admin.roles && admin.roles.length > 0 ? (
                            admin.roles.map((r) => {
                              const match = ROLE_DEFINITIONS.find((d) => d.id === r);
                              return (
                                <span
                                  key={r}
                                  className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-800/90 text-amber-300 font-semibold border border-zinc-700/60"
                                >
                                  ✓ {match ? match.label : r}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400">
                              صلاحية عامة (Admin)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:self-center justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-zinc-800">
                      {/* زر إعادة إرسال بريد التحقق إذا لم يكن مؤكداً */}
                      {!admin.emailVerified && (
                        <button
                          onClick={() => handleResendVerification(admin.id || admin.uid || '', admin.email)}
                          disabled={sendingEmailId === (admin.id || admin.uid)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all cursor-pointer disabled:opacity-50 shadow-xs"
                          title="إعادة إرسال رسالة بريد إلكتروني للتحقق من الحساب"
                        >
                          {sendingEmailId === (admin.id || admin.uid) ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5 -rotate-45" />
                          )}
                          <span>إعادة إرسال بريد التحقق</span>
                        </button>
                      )}

                      {/* زر فحص وتحديث الحالة للمستخدم الحالي إذا كان حسابه غير مؤكد */}
                      {isCurrent && !admin.emailVerified && (
                        <button
                          onClick={handleCheckMyVerification}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border border-blue-500/30 text-xs font-bold transition-all cursor-pointer"
                          title="فحص حالة التأكيد بعد فتح الرسالة في البريد"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>تحققت بالفعل</span>
                        </button>
                      )}

                      {/* للمسؤول الكامل للنظام: إمكانية اعتماد أو تعديل حالة التحقق يدوياً */}
                      {isMasterAdmin && (
                        <button
                          onClick={() => handleToggleVerification(admin.id || admin.uid || '', !!admin.emailVerified)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                            admin.emailVerified
                              ? 'bg-zinc-800/80 text-zinc-400 border-zinc-700 hover:text-amber-300'
                              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30 shadow-xs'
                          }`}
                          title={admin.emailVerified ? 'إلغاء التحقق في قاعدة البيانات' : 'اعتماد وتفعيل البريد مباشرة في قاعدة البيانات'}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{admin.emailVerified ? 'إلغاء التأكيد' : 'تأكيد البريد يدوياً'}</span>
                        </button>
                      )}

                      {/* حذف المسؤول للمسؤول الكامل فقط */}
                      {isMasterAdmin && !isCurrent && !isMaster && (
                        <button
                          onClick={() => handleDelete(admin.id || admin.uid || '', admin.name)}
                          className="p-2 rounded-xl text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-colors cursor-pointer"
                          title="حذف المسؤول"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
