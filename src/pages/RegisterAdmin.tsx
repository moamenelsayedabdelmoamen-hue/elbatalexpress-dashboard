import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Shield,
  UserRound,
  UserPlus,
  Crown,
  Lock,
  AlertCircle,
} from 'lucide-react';
import { AdminService, ROLE_DEFINITIONS, MASTER_ADMIN_EMAIL } from '../services/adminService';
import { AdminRolePermission } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

export const RegisterAdminPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isMasterAdmin } = useAuth();
  const { success, error: toastError } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [roles, setRoles] = useState<AdminRolePermission[]>(['manage_orders']);
  const [submitting, setSubmitting] = useState(false);

  const toggleRole = (role: AdminRolePermission) => {
    setRoles((current) => {
      if (current.includes(role)) {
        if (current.length === 1) {
          toastError('يجب اختيار دور واحد على الأقل للمسؤول');
          return current;
        }
        return current.filter((item) => item !== role);
      }
      return [...current, role];
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isMasterAdmin) {
      toastError('عذراً، صلاحية إضافة مسؤولين جدد مقتصرة حصرياً على المسؤول الكامل للنظام (moamen.elsayed.abdelmoamen@gmail.com)');
      return;
    }

    if (!name.trim()) {
      toastError('يرجى إدخال اسم المسؤول');
      return;
    }
    if (password.length < 6) {
      toastError('كلمة المرور يجب ألا تقل عن 6 أحرف أو أرقام');
      return;
    }
    if (password !== confirmPassword) {
      toastError('كلمتا المرور غير متطابقتين');
      return;
    }
    if (!roles.length) {
      toastError('يرجى تحديد دور واحد على الأقل');
      return;
    }

    setSubmitting(true);
    try {
      const result = await AdminService.createAdmin({
        name: name.trim(),
        email: email.trim(),
        password,
        roles,
        addedBy: user?.displayName || user?.email || 'المسؤول الكامل للنظام',
        creatorEmail: user?.email || undefined,
      });
      success(
        result.emailVerificationSent
          ? 'تم إنشاء المسؤول وإرسال رسالة تأكيد البريد الإلكتروني.'
          : 'تم تسجيل المسؤول الجديد بنجاح.'
      );
      navigate('/admins');
    } catch (err: any) {
      console.error('Error registering admin:', err);
      toastError(err?.message || 'حدث خطأ أثناء تسجيل المسؤول الجديد');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isMasterAdmin) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 pt-4" dir="rtl">
        <Link
          to="/admins"
          className="inline-flex items-center gap-2 text-sm font-bold text-zinc-400 transition-colors hover:text-amber-400"
        >
          <ArrowRight className="h-4 w-4" />
          العودة إلى قائمة المسؤولين
        </Link>

        <div className="overflow-hidden rounded-3xl border border-amber-500/30 bg-gradient-to-b from-[#121622] to-[#0e111a] p-8 shadow-2xl space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/10">
            <Lock className="w-8 h-8" />
          </div>

          <div className="text-center space-y-2">
            <h2 className="text-xl font-black text-white">
              صلاحية مقيدة: إضافة مسؤول جديد
            </h2>
            <p className="text-sm text-zinc-300 max-w-md mx-auto leading-relaxed">
              وفقاً لقواعد الحوكمة المركزية لمنظومة البطل إكسبريس، لا يمكن لأي مسؤول فرعي إضافة أو تسجيل حسابات مسؤولين آخرين من حسابه.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-900/90 border border-amber-500/20 text-center space-y-2">
            <span className="text-xs font-bold text-amber-400 flex items-center justify-center gap-1.5">
              <Crown className="w-4 h-4" />
              المسؤول الكامل للنظام والمخول الوحيد بإضافة المسؤولين:
            </span>
            <div className="p-2.5 rounded-xl bg-black/60 border border-amber-500/30 font-mono text-white font-bold text-sm" dir="ltr">
              {MASTER_ADMIN_EMAIL}
            </div>
          </div>

          <div className="pt-2 flex justify-center">
            <Link
              to="/admins"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-sm transition-colors shadow-lg shadow-amber-500/10"
            >
              <span>الاطلاع على قائمة مسؤولي النظام</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6" dir="rtl">
      <Link
        to="/admins"
        className="inline-flex items-center gap-2 text-sm font-bold text-zinc-400 transition-colors hover:text-amber-400"
      >
        <ArrowRight className="h-4 w-4" />
        العودة إلى قائمة المسؤولين
      </Link>

      <section className="overflow-hidden rounded-3xl border border-zinc-800/90 bg-gradient-to-b from-[#121622] to-[#0e111a] shadow-xl">
        <div className="border-b border-zinc-800 p-6 sm:p-8">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <UserPlus className="h-6 w-6" />
            </div>
            <div>
              <p className="mb-1 text-xs font-bold text-amber-400">إدارة الحسابات (المسؤول الكامل)</p>
              <h2 className="text-xl font-black text-white sm:text-2xl">تسجيل مسؤول جديد</h2>
              <p className="mt-1 text-sm text-zinc-400">أدخل بيانات الحساب وحدد الصلاحيات المطلوبة.</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 p-6 sm:p-8">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="admin-name" className="mb-2 block text-sm font-bold text-zinc-300">
                الاسم الكامل <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute right-3.5 top-3.5 h-4 w-4 text-zinc-500" />
                <input
                  id="admin-name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="مثال: أحمد محمد"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900/90 py-3 pl-4 pr-10 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="admin-email" className="mb-2 block text-sm font-bold text-zinc-300">
                البريد الإلكتروني <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute right-3.5 top-3.5 h-4 w-4 text-zinc-500" />
                <input
                  id="admin-email"
                  type="email"
                  autoComplete="email"
                  dir="ltr"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="admin@example.com"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900/90 py-3 pl-4 pr-10 text-left text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="admin-password" className="mb-2 block text-sm font-bold text-zinc-300">
                كلمة المرور <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute right-3.5 top-3.5 h-4 w-4 text-zinc-500" />
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  dir="ltr"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="6 أحرف أو أرقام على الأقل"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900/90 py-3 pl-11 pr-10 text-left text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none"
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute left-3 top-3 rounded p-0.5 text-zinc-400 hover:text-zinc-200"
                  aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="admin-confirm-password" className="mb-2 block text-sm font-bold text-zinc-300">
                تأكيد كلمة المرور <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute right-3.5 top-3.5 h-4 w-4 text-zinc-500" />
                <input
                  id="admin-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  dir="ltr"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="أعد إدخال كلمة المرور"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900/90 py-3 pl-4 pr-10 text-left text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none"
                  required
                />
              </div>
            </div>
          </div>

          <fieldset>
            <legend className="mb-3 text-sm font-bold text-zinc-200">
              الصلاحيات <span className="text-rose-400">*</span>
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {ROLE_DEFINITIONS.map((role) => {
                const selected = roles.includes(role.id);
                return (
                  <label
                    key={role.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${
                      selected
                        ? 'border-amber-500/40 bg-amber-500/10'
                        : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleRole(role.id)}
                      className="mt-1 h-4 w-4 accent-amber-500"
                    />
                    <span>
                      <span className={`flex items-center gap-2 text-sm font-bold ${selected ? 'text-amber-300' : 'text-zinc-200'}`}>
                        {selected && <CheckCircle2 className="h-4 w-4" />}
                        {role.label}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-zinc-400">{role.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="flex flex-col-reverse gap-3 border-t border-zinc-800 pt-5 sm:flex-row sm:justify-end">
            <Link
              to="/admins"
              className="rounded-xl border border-zinc-700 px-5 py-3 text-center text-sm font-bold text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              إلغاء
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-3 text-sm font-black text-zinc-950 shadow-lg shadow-amber-500/10 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-950 border-t-transparent" />
                  جاري إنشاء الحساب...
                </>
              ) : (
                <>
                  <Shield className="h-4 w-4" />
                  تسجيل المسؤول
                </>
              )}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
