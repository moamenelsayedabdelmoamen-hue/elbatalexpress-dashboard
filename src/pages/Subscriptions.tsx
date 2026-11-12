import React, { useEffect, useState, useMemo } from 'react';
import {
  CreditCard,
  Search,
  Plus,
  RefreshCw,
  Calendar,
  CheckCircle,
  PauseCircle,
  Zap,
  Edit2,
  Users,
  X,
  Building2,
} from 'lucide-react';
import { Subscription, SubscriptionStatus, Restaurant } from '../types';
import { SubscriptionService, OFFICIAL_PACKAGES } from '../services/subscriptionService';
import { RestaurantService } from '../services/restaurantService';
import { StatusBadge } from '../components/common/StatusBadge';
import { ConfirmationModal } from '../components/common/ConfirmationModal';
import { EmptyState } from '../components/common/EmptyState';
import { FirebaseImage } from '../components/common/FirebaseImage';
import { ExportButton } from '../components/common/ExportButton';
import { exportSubscriptions } from '../utils/exportUtils';
import { useToast } from '../contexts/ToastContext';

export const SubscriptionsPage: React.FC = () => {
  const { success, error: toastError } = useToast();

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [merchants, setMerchants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [renewingSub, setRenewingSub] = useState<Subscription | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const todayYMD = new Date().toISOString().split('T')[0];
  const defaultEndYMD = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  }, []);

  // Form state for Add / Edit
  const [formData, setFormData] = useState({
    restaurantId: '',
    restaurantName: '',
    captainsCount: 2,
    price: 400,
    plan: '2 كابتن - 400 جنيه',
    startDate: todayYMD,
    endDate: defaultEndYMD,
    status: 'Active' as SubscriptionStatus,
  });

  const fetchSubscriptions = async () => {
    setLoading(true);
    try {
      const [subRes, restRes] = await Promise.all([
        SubscriptionService.getAll(),
        RestaurantService.getAll(),
      ]);
      setSubscriptions(subRes.data);
      setMerchants(restRes.data);
    } catch (err) {
      console.error('Failed to load subscriptions:', err);
      toastError('فشل تحميل بيانات اشتراكات التجار من قاعدة البيانات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const filteredSubscriptions = useMemo(() => {
    return subscriptions.filter((sub) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        sub.restaurantName.toLowerCase().includes(q) ||
        sub.plan.toLowerCase().includes(q) ||
        (sub.merchantPhone && sub.merchantPhone.includes(searchQuery)) ||
        (sub.merchantEmail && sub.merchantEmail.toLowerCase().includes(q));

      const matchesStatus = statusFilter === 'all' ? true : sub.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [subscriptions, searchQuery, statusFilter]);

  const handleSelectPackage = (pkg: { captainsCount: number; price: number; label: string }) => {
    setFormData((prev) => ({
      ...prev,
      captainsCount: pkg.captainsCount,
      price: pkg.price,
      plan: pkg.label,
    }));
  };

  const handleStartDateChange = (newStart: string) => {
    let nextEnd = formData.endDate;
    try {
      const d = new Date(newStart);
      if (!isNaN(d.getTime())) {
        d.setDate(d.getDate() + 30);
        nextEnd = d.toISOString().split('T')[0];
      }
    } catch {
      // ignore
    }
    setFormData((prev) => ({
      ...prev,
      startDate: newStart,
      endDate: nextEnd,
    }));
  };

  const handleOpenAddModal = () => {
    setFormData({
      restaurantId: '',
      restaurantName: '',
      captainsCount: 2,
      price: 400,
      plan: '2 كابتن - 400 جنيه',
      startDate: todayYMD,
      endDate: defaultEndYMD,
      status: 'Active',
    });
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (sub: Subscription) => {
    setEditingSub(sub);
    setFormData({
      restaurantId: sub.restaurantId,
      restaurantName: sub.restaurantName,
      captainsCount: sub.captainsCount || 2,
      price: sub.price || 400,
      plan: sub.plan || '2 كابتن - 400 جنيه',
      startDate: sub.startDate || todayYMD,
      endDate: sub.endDate || defaultEndYMD,
      status: sub.status || 'Active',
    });
  };

  const handleCreateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.restaurantName) {
      toastError('يرجى اختيار التاجر المسجل');
      return;
    }

    setActionLoading(true);
    try {
      await SubscriptionService.create({
        restaurantId: formData.restaurantId || `rest_${Date.now()}`,
        restaurantName: formData.restaurantName,
        plan: formData.plan,
        captainsCount: formData.captainsCount,
        price: Number(formData.price),
        startDate: formData.startDate,
        endDate: formData.endDate,
        status: formData.status,
      });

      await fetchSubscriptions();
      success(`تم حفظ وتفعيل اشتراك "${formData.plan}" للتاجر "${formData.restaurantName}"`);
      setIsAddModalOpen(false);
    } catch (err) {
      toastError('فشل حفظ الاشتراك في قاعدة البيانات');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveEditSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSub) return;

    setActionLoading(true);
    try {
      await SubscriptionService.updateSubscription(editingSub.id, {
        restaurantId: formData.restaurantId || editingSub.restaurantId,
        restaurantName: formData.restaurantName || editingSub.restaurantName,
        captainsCount: formData.captainsCount,
        price: Number(formData.price),
        plan: formData.plan,
        startDate: formData.startDate,
        endDate: formData.endDate,
        status: formData.status,
      });

      setSubscriptions((prev) =>
        prev.map((s) =>
          s.id === editingSub.id
            ? {
                ...s,
                captainsCount: formData.captainsCount,
                price: Number(formData.price),
                plan: formData.plan,
                startDate: formData.startDate,
                endDate: formData.endDate,
                status: formData.status,
              }
            : s
        )
      );

      success(`تم تحديث بيانات اشتراك التاجر "${editingSub.restaurantName}" بنجاح`);
      setEditingSub(null);
    } catch (err) {
      toastError('فشل تحديث بيانات الاشتراك');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRenewSubscription = async () => {
    if (!renewingSub) return;
    setActionLoading(true);
    try {
      const formattedEndDate = await SubscriptionService.renew(renewingSub.id, 30);

      setSubscriptions((prev) =>
        prev.map((s) =>
          s.id === renewingSub.id
            ? { ...s, status: 'Active', endDate: formattedEndDate }
            : s
        )
      );

      success(`تم تجديد اشتراك التاجر "${renewingSub.restaurantName}" لمدة 30 يوماً إضافية`);
      setRenewingSub(null);
    } catch (err) {
      toastError('فشل تجديد الاشتراك');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleSuspension = async (sub: Subscription) => {
    const newStatus: SubscriptionStatus = sub.status === 'Active' ? 'Suspended' : 'Active';
    try {
      await SubscriptionService.updateStatus(sub.id, newStatus, sub.restaurantId);
      setSubscriptions((prev) =>
        prev.map((s) => (s.id === sub.id ? { ...s, status: newStatus } : s))
      );
      success(
        newStatus === 'Active'
          ? `تم تفعيل اشتراك التاجر "${sub.restaurantName}"`
          : `تم إيقاف اشتراك التاجر "${sub.restaurantName}" مؤقتاً`
      );
    } catch (err) {
      toastError('فشل تغيير حالة الاشتراك');
    }
  };

  const formatArabicDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const getRemainingDaysInfo = (endDateStr?: string) => {
    if (!endDateStr) return null;
    try {
      const end = new Date(endDateStr);
      const now = new Date();
      end.setHours(23, 59, 59, 999);
      const diffMs = end.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        return { text: `منتهي منذ ${Math.abs(diffDays)} يوم`, isExpired: true, isSoon: false };
      }
      if (diffDays <= 5) {
        return { text: `متبقي ${diffDays} أيام`, isExpired: false, isSoon: true };
      }
      return { text: `متبقي ${diffDays} يوم`, isExpired: false, isSoon: false };
    } catch {
      return null;
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white">إدارة اشتراكات التجار</h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
            متابعة التجار المسجلين في قاعدة البيانات وحالة الاشتراك وميعاد الاشتراك وميعاد الانتهاء
          </p>
        </div>

        <div className="flex items-center gap-3">
          <ExportButton
            onExportExcel={() => exportSubscriptions(filteredSubscriptions, 'xlsx')}
            onExportCsv={() => exportSubscriptions(filteredSubscriptions, 'csv')}
            label="تصدير الاشتراكات"
            count={filteredSubscriptions.length}
          />

          <button
            onClick={fetchSubscriptions}
            className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
            title="تحديث من قاعدة البيانات"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs sm:text-sm shadow-md shadow-amber-500/10 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>تسجيل / تعديل اشتراك تاجر</span>
          </button>
        </div>
      </div>

      {/* Current Official Package Plans Banner: 2/400, 4/800, 6/1200, 8/1600 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {OFFICIAL_PACKAGES.map((pkg, index) => {
          const isPopular = pkg.captainsCount === 4 || pkg.captainsCount === 6;
          const activeCountForPlan = subscriptions.filter(
            (s) => s.captainsCount === pkg.captainsCount || s.price === pkg.price
          ).length;

          return (
            <div
              key={pkg.captainsCount}
              className={`p-5 rounded-2xl border transition-all flex flex-col justify-between relative overflow-hidden ${
                index === 2
                  ? 'bg-gradient-to-br from-[#161c28] to-[#10131b] border-amber-500/40 shadow-lg'
                  : 'bg-[#11141c] border-zinc-800 hover:border-amber-500/30'
              }`}
            >
              {isPopular && index === 2 && (
                <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-amber-500 text-zinc-950 font-black text-[10px]">
                  الأكثر طلباً
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs font-extrabold text-amber-400">
                    <Users className="w-3.5 h-3.5" />
                    <span>{pkg.captainsCount} كابتن</span>
                  </span>
                  <span className="text-[11px] font-bold text-zinc-500">باقة شهرية</span>
                </div>

                <div className="text-2xl sm:text-3xl font-black text-white font-['Outfit',sans-serif] mb-1">
                  {pkg.price.toLocaleString('en-US')}{' '}
                  <span className="text-xs font-bold text-amber-400 font-['Cairo']">جنيه</span>
                </div>

                <p className="text-xs text-zinc-400 mt-1">
                  تخصيص حتى {pkg.captainsCount} كابتن توصيل لخدمة طلبات التاجر طوال فترة الاشتراك
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-[11px]">
                <span className="text-zinc-400">التجار المشتركون بالباقة:</span>
                <span className="font-black text-amber-400 font-['Outfit',sans-serif]">
                  {activeCountForPlan} تاجر
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters and Search Bar */}
      <div className="bg-[#11141c] border border-zinc-800/90 rounded-2xl p-4 flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute right-3.5 top-3.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="البحث باسم التاجر أو الباقة أو الهاتف..."
            className="w-full bg-[#0a0c12] border border-zinc-800 text-zinc-100 placeholder-zinc-500 rounded-xl py-2.5 pr-10 pl-4 text-xs sm:text-sm focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        <div className="flex flex-wrap items-center rounded-xl bg-[#0a0c12] border border-zinc-800 p-1 text-xs">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
              statusFilter === 'all' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            الكل ({subscriptions.length})
          </button>
          <button
            onClick={() => setStatusFilter('Active')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
              statusFilter === 'Active' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            ساري ({subscriptions.filter((s) => s.status === 'Active').length})
          </button>
          <button
            onClick={() => setStatusFilter('Pending')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
              statusFilter === 'Pending' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            معلق ({subscriptions.filter((s) => s.status === 'Pending').length})
          </button>
          <button
            onClick={() => setStatusFilter('Expired')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
              statusFilter === 'Expired' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            منتهي ({subscriptions.filter((s) => s.status === 'Expired').length})
          </button>
          <button
            onClick={() => setStatusFilter('Suspended')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
              statusFilter === 'Suspended' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            موقوف ({subscriptions.filter((s) => s.status === 'Suspended').length})
          </button>
        </div>
      </div>

      {/* Subscriptions Table */}
      <div className="bg-[#11141c] border border-zinc-800/90 rounded-3xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-3 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-xs font-semibold">
              جاري جلب بيانات التجار المسجلين والاشتراكات من قاعدة البيانات...
            </p>
          </div>
        ) : filteredSubscriptions.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="لم يتم العثور على اشتراكات"
              description="لا توجد بيانات تطابق البحث أو لم يتم تسجيل أي تاجر بعد."
              icon={CreditCard}
              actionText="تسجيل اشتراك جديد"
              onAction={handleOpenAddModal}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-xs font-bold text-zinc-400 bg-zinc-950/40">
                  <th className="py-4 px-4">اسم التاجر المسجل</th>
                  <th className="py-4 px-4">الباقة الحالية (الكباتن)</th>
                  <th className="py-4 px-4">قيمة الاشتراك</th>
                  <th className="py-4 px-4">حالة الاشتراك</th>
                  <th className="py-4 px-4">ميعاد الاشتراك</th>
                  <th className="py-4 px-4">ميعاد انتهاء الاشتراك</th>
                  <th className="py-4 px-4 text-left">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredSubscriptions.map((sub) => {
                  const remainingInfo = getRemainingDaysInfo(sub.endDate);
                  const storageFallbacks = [
                    `restaurants/${sub.restaurantId}`,
                    `merchants/${sub.restaurantId}`,
                    `logos/${sub.restaurantId}`,
                  ];

                  return (
                    <tr key={sub.id} className="hover:bg-zinc-900/40 transition-colors">
                      {/* اسم التاجر المسجل */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <FirebaseImage
                            src={sub.merchantLogo}
                            fallbackStoragePaths={storageFallbacks}
                            alt={sub.restaurantName}
                            className="w-10 h-10 rounded-2xl border border-amber-500/30"
                            fallbackContent={
                              <div className="w-full h-full bg-amber-500/10 text-amber-400 flex items-center justify-center font-black text-sm">
                                {sub.restaurantName ? sub.restaurantName.charAt(0) : <Building2 className="w-4 h-4" />}
                              </div>
                            }
                          />
                          <div>
                            <p className="font-extrabold text-zinc-100 text-sm">{sub.restaurantName}</p>
                            {sub.merchantPhone && sub.merchantPhone !== '—' && (
                              <span className="text-[11px] text-zinc-500 font-mono block" dir="ltr">
                                {sub.merchantPhone}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* الباقة الحالية */}
                      <td className="py-4 px-4">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-extrabold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Zap className="w-3.5 h-3.5" />
                          <span>{sub.captainsCount || 2} كابتن</span>
                        </span>
                      </td>

                      {/* قيمة الاشتراك */}
                      <td className="py-4 px-4 font-mono font-black text-white text-xs font-['Outfit',sans-serif]">
                        {sub.price} جنيه
                      </td>

                      {/* حالة الاشتراك */}
                      <td className="py-4 px-4">
                        <StatusBadge status={sub.status} type="subscription" />
                      </td>

                      {/* ميعاد الاشتراك */}
                      <td className="py-4 px-4">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-zinc-200">
                            {formatArabicDate(sub.startDate)}
                          </span>
                          <span className="text-[11px] font-mono text-zinc-500">{sub.startDate}</span>
                        </div>
                      </td>

                      {/* ميعاد انتهاء الاشتراك */}
                      <td className="py-4 px-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-bold text-zinc-100">
                            {formatArabicDate(sub.endDate)}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono text-zinc-500">{sub.endDate}</span>
                            {remainingInfo && (
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                                  remainingInfo.isExpired
                                    ? 'bg-rose-500/15 text-rose-400'
                                    : remainingInfo.isSoon
                                    ? 'bg-amber-500/15 text-amber-400'
                                    : 'bg-emerald-500/10 text-emerald-400'
                                }`}
                              >
                                {remainingInfo.text}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* الإجراءات */}
                      <td className="py-4 px-4 text-left">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEditModal(sub)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 text-xs font-bold transition-colors"
                            title="تعديل الباقة ومواعيد الاشتراك"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                            <span>تعديل</span>
                          </button>

                          <button
                            onClick={() => setRenewingSub(sub)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-bold transition-colors"
                            title="تجديد الاشتراك 30 يوم"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>تجديد (+30 يوم)</span>
                          </button>

                          <button
                            onClick={() => handleToggleSuspension(sub)}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                              sub.status === 'Active'
                                ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/20'
                                : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20'
                            }`}
                          >
                            {sub.status === 'Active' ? (
                              <>
                                <PauseCircle className="w-3.5 h-3.5" />
                                <span>إيقاف</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle className="w-3.5 h-3.5" />
                                <span>تفعيل</span>
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Subscription Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[#11141c] border border-zinc-800 rounded-3xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute top-5 left-5 text-zinc-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black text-white mb-4">تسجيل اشتراك لتاجر</h3>

            <form onSubmit={handleCreateSubscription} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-zinc-300 mb-1.5">اختر التاجر المسجل *</label>
                {merchants.length > 0 ? (
                  <select
                    value={formData.restaurantId}
                    onChange={(e) => {
                      const selected = merchants.find((r) => r.id === e.target.value);
                      setFormData({
                        ...formData,
                        restaurantId: e.target.value,
                        restaurantName: selected?.name || '',
                      });
                    }}
                    className="w-full bg-[#0a0c12] border border-zinc-800 rounded-xl px-3.5 py-2.5 text-zinc-100 focus:outline-none focus:border-amber-500"
                    required
                  >
                    <option value="">-- اختر من قائمة التجار المسجلين --</option>
                    {merchants.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="اسم التاجر"
                    value={formData.restaurantName}
                    onChange={(e) => setFormData({ ...formData, restaurantName: e.target.value })}
                    className="w-full bg-[#0a0c12] border border-zinc-800 rounded-xl px-3.5 py-2.5 text-zinc-100 focus:outline-none focus:border-amber-500"
                    required
                  />
                )}
              </div>

              <div>
                <label className="block font-bold text-zinc-300 mb-1.5">اختر الباقة الشهرية</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {OFFICIAL_PACKAGES.map((pkg) => {
                    const isSelected = formData.captainsCount === pkg.captainsCount;
                    return (
                      <button
                        type="button"
                        key={pkg.captainsCount}
                        onClick={() => handleSelectPackage(pkg)}
                        className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500 text-zinc-950 border-amber-500 font-black shadow-md'
                            : 'bg-[#0a0c12] text-zinc-200 border-zinc-800 hover:border-zinc-700 font-bold'
                        }`}
                      >
                        <div className="text-xs">{pkg.captainsCount} كابتن</div>
                        <div className={`text-sm font-black mt-0.5 ${isSelected ? 'text-zinc-950' : 'text-amber-400'}`}>
                          {pkg.price} جنيه
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-300 mb-1.5">ميعاد الاشتراك</label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => handleStartDateChange(e.target.value)}
                    className="w-full bg-[#0a0c12] border border-zinc-800 rounded-xl px-3 py-2.5 text-zinc-100 font-mono focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-zinc-300 mb-1.5">ميعاد انتهاء الاشتراك</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full bg-[#0a0c12] border border-zinc-800 rounded-xl px-3 py-2.5 text-zinc-100 font-mono focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-zinc-300 mb-1.5">حالة الاشتراك</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as SubscriptionStatus })}
                  className="w-full bg-[#0a0c12] border border-zinc-800 rounded-xl px-3.5 py-2.5 text-zinc-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="Active">ساري (Active)</option>
                  <option value="Pending">معلق (Pending)</option>
                  <option value="Expired">منتهي (Expired)</option>
                  <option value="Suspended">موقوف (Suspended)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800/80">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-zinc-400 hover:text-white"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold transition-colors disabled:opacity-50"
                >
                  {actionLoading ? 'جاري الحفظ...' : 'تفعيل وحفظ الاشتراك'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Subscription Modal */}
      {editingSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[#11141c] border border-zinc-800 rounded-3xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setEditingSub(null)}
              className="absolute top-5 left-5 text-zinc-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black text-white mb-1">تعديل اشتراك التاجر</h3>
            <p className="text-xs text-amber-400 font-bold mb-4">{editingSub.restaurantName}</p>

            <form onSubmit={handleSaveEditSubscription} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-zinc-300 mb-1.5">اختر الباقة الشهرية</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {OFFICIAL_PACKAGES.map((pkg) => {
                    const isSelected = formData.captainsCount === pkg.captainsCount;
                    return (
                      <button
                        type="button"
                        key={pkg.captainsCount}
                        onClick={() => handleSelectPackage(pkg)}
                        className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500 text-zinc-950 border-amber-500 font-black shadow-md'
                            : 'bg-[#0a0c12] text-zinc-200 border-zinc-800 hover:border-zinc-700 font-bold'
                        }`}
                      >
                        <div className="text-xs">{pkg.captainsCount} كابتن</div>
                        <div className={`text-sm font-black mt-0.5 ${isSelected ? 'text-zinc-950' : 'text-amber-400'}`}>
                          {pkg.price} جنيه
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-300 mb-1.5">ميعاد الاشتراك</label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full bg-[#0a0c12] border border-zinc-800 rounded-xl px-3 py-2.5 text-zinc-100 font-mono focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-zinc-300 mb-1.5">ميعاد انتهاء الاشتراك</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full bg-[#0a0c12] border border-zinc-800 rounded-xl px-3 py-2.5 text-zinc-100 font-mono focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-zinc-300 mb-1.5">حالة الاشتراك</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as SubscriptionStatus })}
                  className="w-full bg-[#0a0c12] border border-zinc-800 rounded-xl px-3.5 py-2.5 text-zinc-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="Active">ساري (Active)</option>
                  <option value="Pending">معلق (Pending)</option>
                  <option value="Expired">منتهي (Expired)</option>
                  <option value="Suspended">موقوف (Suspended)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800/80">
                <button
                  type="button"
                  onClick={() => setEditingSub(null)}
                  className="px-4 py-2 text-zinc-400 hover:text-white"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold transition-colors disabled:opacity-50"
                >
                  {actionLoading ? 'جاري الحفظ...' : 'حفظ التعديلات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Renew Subscription Confirmation */}
      <ConfirmationModal
        isOpen={Boolean(renewingSub)}
        title="تأكيد تجديد اشتراك التاجر"
        message={`هل تريد تجديد اشتراك التاجر "${renewingSub?.restaurantName}" لمدة شهر إضافي (30 يوماً)؟ ستصبح حالة الاشتراك "ساري".`}
        confirmText="تأكيد التجديد"
        cancelText="إلغاء"
        isLoading={actionLoading}
        onConfirm={handleRenewSubscription}
        onClose={() => setRenewingSub(null)}
      />
    </div>
  );
};
