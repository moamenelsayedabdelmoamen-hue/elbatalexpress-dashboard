import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bike,
  Search,
  Plus,
  Star,
  RefreshCw,
  Trash2,
  Eye,
  EyeOff,
  X,
  TrendingUp,
  CalendarClock,
  KeyRound,
  Mail,
  Edit2,
  Power,
  ShieldCheck,
  ShieldOff,
  Upload,
  User as UserIcon,
} from 'lucide-react';
import { Captain, CaptainStatus } from '../types';
import { CaptainService } from '../services/captainService';
import { StatusBadge } from '../components/common/StatusBadge';
import { ConfirmationModal } from '../components/common/ConfirmationModal';
import { EmptyState } from '../components/common/EmptyState';
import { FirebaseImage } from '../components/common/FirebaseImage';
import { uploadImageToFirebaseStorage } from '../utils/storageUtils';
import { useToast } from '../contexts/ToastContext';
import { ExportButton } from '../components/common/ExportButton';
import { exportCaptains } from '../utils/exportUtils';

export const CaptainsPage: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();

  const [captains, setCaptains] = useState<Captain[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline' | 'busy'>('all');

  // Track which captain passwords are visible in the table
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [viewingCaptain, setViewingCaptain] = useState<Captain | null>(null);
  const [editingCaptain, setEditingCaptain] = useState<Captain | null>(null);
  const [passwordModalCaptain, setPasswordModalCaptain] = useState<Captain | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [togglingReceptionId, setTogglingReceptionId] = useState<string | null>(null);

  // Add / Edit captain form
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    profileImage: '',
    vehicleType: 'دراجة نارية (موتوسيكل)',
    status: 'online' as CaptainStatus,
    canReceiveOrders: true,
  });

  const fetchCaptains = async () => {
    setLoading(true);
    try {
      const res = await CaptainService.getAll();
      setCaptains(res.data);
    } catch (err) {
      console.error('Failed to load captains:', err);
      toastError('فشل تحميل بيانات الكباتن');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCaptains();
  }, []);

  const filteredCaptains = useMemo(() => {
    return captains.filter((c) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(searchQuery) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.vehicleType && c.vehicleType.toLowerCase().includes(q));

      const matchesStatus = statusFilter === 'all' ? true : c.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [captains, searchQuery, statusFilter]);

  const togglePasswordVisibility = (captainId: string) => {
    setVisiblePasswords((prev) => ({
      ...prev,
      [captainId]: !prev[captainId],
    }));
  };

  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>, captainId?: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(true);
    try {
      const folderId = captainId || `captain_${Date.now()}`;
      const ext = file.name.split('.').pop() || 'jpg';
      const storagePath = `captains/${folderId}/profile_${Date.now()}.${ext}`;
      const downloadUrl = await uploadImageToFirebaseStorage(file, storagePath);
      setFormData((prev) => ({ ...prev, profileImage: downloadUrl }));
      success('تم رفع الصورة الشخصية للكابتن في Firebase Storage بنجاح');
    } catch (err) {
      toastError('فشل رفع الصورة الشخصية للكابتن');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleUpdateStatus = async (captain: Captain, newStatus: CaptainStatus) => {
    const nowIso = new Date().toISOString();
    try {
      await CaptainService.updateStatus(captain.id, newStatus);
      setCaptains((prev) =>
        prev.map((c) =>
          c.id === captain.id
            ? { ...c, status: newStatus, isOnline: newStatus === 'online', statusUpdatedAt: nowIso }
            : c
        )
      );
      success(`تم تحديث حالة الكابتن ${captain.name} إلى ${newStatus}`);
    } catch (err) {
      toastError('فشل تحديث حالة الكابتن');
    }
  };

  const handleToggleOrderReception = async (captain: Captain) => {
    const currentCanReceive = captain.canReceiveOrders !== false;
    const nextCanReceive = !currentCanReceive;
    const nowIso = new Date().toISOString();

    setTogglingReceptionId(captain.id);
    try {
      await CaptainService.toggleOrderReception(captain.id, nextCanReceive);
      const nextStatus: CaptainStatus = nextCanReceive ? 'online' : 'offline';

      setCaptains((prev) =>
        prev.map((c) =>
          c.id === captain.id
            ? {
                ...c,
                canReceiveOrders: nextCanReceive,
                status: nextStatus,
                isOnline: nextCanReceive,
                statusUpdatedAt: nowIso,
              }
            : c
        )
      );

      if (viewingCaptain?.id === captain.id) {
        setViewingCaptain((prev) =>
          prev
            ? {
                ...prev,
                canReceiveOrders: nextCanReceive,
                status: nextStatus,
                isOnline: nextCanReceive,
                statusUpdatedAt: nowIso,
              }
            : null
        );
      }

      success(
        nextCanReceive
          ? `تم تفعيل استقبال الطلبات للكابتن "${captain.name}"`
          : `تم إيقاف استقبال الطلبات للكابتن "${captain.name}"`
      );
    } catch (err) {
      toastError('فشل تغيير إعداد استقبال الطلبات للكابتن');
    } finally {
      setTogglingReceptionId(null);
    }
  };

  const handleOpenPasswordModal = (captain: Captain) => {
    setPasswordModalCaptain(captain);
    setNewPasswordInput(captain.password || '');
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordModalCaptain) return;
    if (!newPasswordInput.trim()) {
      toastError('يرجى إدخال كلمة السر الجديدة');
      return;
    }

    setActionLoading(true);
    try {
      const trimmedPass = newPasswordInput.trim();
      await CaptainService.updatePassword(passwordModalCaptain.id, trimmedPass);
      setCaptains((prev) =>
        prev.map((c) => (c.id === passwordModalCaptain.id ? { ...c, password: trimmedPass } : c))
      );
      if (viewingCaptain?.id === passwordModalCaptain.id) {
        setViewingCaptain((prev) => (prev ? { ...prev, password: trimmedPass } : null));
      }
      success(`تم تحديث كلمة السر للكابتن "${passwordModalCaptain.name}" بنجاح`);
      setPasswordModalCaptain(null);
    } catch (err) {
      toastError('فشل تحديث كلمة السر للكابتن');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenEditCaptain = (captain: Captain) => {
    setEditingCaptain(captain);
    setFormData({
      name: captain.name,
      phone: captain.phone && captain.phone !== '—' ? captain.phone : '',
      email: captain.email && captain.email !== '—' ? captain.email : '',
      password: captain.password || '',
      profileImage: captain.profileImage || captain.photoURL || '',
      vehicleType: captain.vehicleType || 'دراجة نارية (موتوسيكل)',
      status: captain.status || 'online',
      canReceiveOrders: captain.canReceiveOrders !== false,
    });
  };

  const handleSaveEditCaptain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCaptain) return;

    setActionLoading(true);
    const nowIso = new Date().toISOString();
    try {
      await CaptainService.updateCaptain(editingCaptain.id, {
        name: formData.name,
        phone: formData.phone,
        email: formData.email || '—',
        password: formData.password,
        profileImage: formData.profileImage,
        vehicleType: formData.vehicleType,
        status: formData.status,
        canReceiveOrders: formData.canReceiveOrders,
      });

      setCaptains((prev) =>
        prev.map((c) =>
          c.id === editingCaptain.id
            ? {
                ...c,
                name: formData.name,
                phone: formData.phone,
                email: formData.email || '—',
                password: formData.password,
                profileImage: formData.profileImage,
                photoURL: formData.profileImage,
                vehicleType: formData.vehicleType,
                status: formData.status,
                canReceiveOrders: formData.canReceiveOrders,
                statusUpdatedAt: nowIso,
              }
            : c
        )
      );

      success('تم تحديث بيانات الكابتن بنجاح');
      setEditingCaptain(null);
    } catch (err) {
      toastError('فشل تحديث بيانات الكابتن');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddCaptain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.phone.trim()) {
      toastError('يرجى كتابة اسم ورقم هاتف الكابتن');
      return;
    }

    setActionLoading(true);
    try {
      const newCapt = await CaptainService.create({
        name: formData.name,
        phone: formData.phone,
        email: formData.email || '—',
        password: formData.password,
        profileImage: formData.profileImage,
        vehicleType: formData.vehicleType,
        status: formData.status,
        canReceiveOrders: formData.canReceiveOrders,
        ordersCount: 0,
        rating: 5.0,
      });

      setCaptains((prev) => [newCapt, ...prev]);
      success('تم إضافة الكابتن الجديد بنجاح');
      setIsAddModalOpen(false);
      setFormData({
        name: '',
        phone: '',
        email: '',
        password: '',
        profileImage: '',
        vehicleType: 'دراجة نارية (موتوسيكل)',
        status: 'online',
        canReceiveOrders: true,
      });
    } catch (err) {
      toastError('فشل تسجيل الكابتن');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingId) return;
    setActionLoading(true);
    try {
      await CaptainService.delete(deletingId);
      setCaptains((prev) => prev.filter((c) => c.id !== deletingId));
      success('تم حذف الكابتن بنجاح');
      setDeletingId(null);
    } catch (err) {
      toastError('فشل حذف الكابتن');
    } finally {
      setActionLoading(false);
    }
  };

  const formatStatusDate = (captain: Captain) => {
    const dateVal = captain.statusUpdatedAt || captain.updatedAt || captain.createdAt;
    if (!dateVal) return '—';
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleString('ar-EG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '—';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white">إدارة كباتن التوصيل</h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
            متابعة أسطول توصيل El Batal Express، الصور الشخصية، كلمات السر، والتحكم في استقبال الطلبات
          </p>
        </div>

        <div className="flex items-center gap-3">
          <ExportButton
            onExportExcel={() => exportCaptains(filteredCaptains, 'xlsx')}
            onExportCsv={() => exportCaptains(filteredCaptains, 'csv')}
            label="تصدير الكباتن"
            count={filteredCaptains.length}
          />

          <button
            onClick={fetchCaptains}
            className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
            title="تحديث القائمة"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setFormData({
                name: '',
                phone: '',
                email: '',
                password: '',
                profileImage: '',
                vehicleType: 'دراجة نارية (موتوسيكل)',
                status: 'online',
                canReceiveOrders: true,
              });
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs sm:text-sm shadow-md shadow-amber-500/10 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة كابتن جديد</span>
          </button>
        </div>
      </div>

      {/* Summary Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-[#11141c] border border-zinc-800/80">
          <span className="text-xs font-bold text-zinc-400 block mb-1">إجمالي الكباتن</span>
          <span className="text-xl sm:text-2xl font-black text-white font-['Outfit',sans-serif]">
            {captains.length}
          </span>
        </div>
        <div className="p-4 rounded-2xl bg-[#11141c] border border-zinc-800/80">
          <span className="text-xs font-bold text-emerald-400 block mb-1">متاح لاستقبال الطلبات</span>
          <span className="text-xl sm:text-2xl font-black text-emerald-400 font-['Outfit',sans-serif]">
            {captains.filter((c) => c.canReceiveOrders !== false).length}
          </span>
        </div>
        <div className="p-4 rounded-2xl bg-[#11141c] border border-zinc-800/80">
          <span className="text-xs font-bold text-amber-400 block mb-1">في توصيل (Busy)</span>
          <span className="text-xl sm:text-2xl font-black text-amber-400 font-['Outfit',sans-serif]">
            {captains.filter((c) => c.status === 'busy').length}
          </span>
        </div>
        <div className="p-4 rounded-2xl bg-[#11141c] border border-zinc-800/80">
          <span className="text-xs font-bold text-rose-400 block mb-1">موقوف استقبال الطلبات</span>
          <span className="text-xl sm:text-2xl font-black text-rose-400 font-['Outfit',sans-serif]">
            {captains.filter((c) => c.canReceiveOrders === false).length}
          </span>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="bg-[#11141c] border border-zinc-800/90 rounded-2xl p-4 flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute right-3.5 top-3.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="البحث بالاسم أو الهاتف أو البريد الإلكتروني أو المركبة..."
            className="w-full bg-[#0a0c12] border border-zinc-800 text-zinc-100 placeholder-zinc-500 rounded-xl py-2.5 pr-10 pl-4 text-xs sm:text-sm focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        <div className="flex items-center rounded-xl bg-[#0a0c12] border border-zinc-800 p-1 text-xs">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
              statusFilter === 'all' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            الكل ({captains.length})
          </button>
          <button
            onClick={() => setStatusFilter('online')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
              statusFilter === 'online' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            متصل ({captains.filter((c) => c.status === 'online').length})
          </button>
          <button
            onClick={() => setStatusFilter('busy')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
              statusFilter === 'busy' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            في توصيل ({captains.filter((c) => c.status === 'busy').length})
          </button>
          <button
            onClick={() => setStatusFilter('offline')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
              statusFilter === 'offline' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            غير متصل ({captains.filter((c) => c.status === 'offline').length})
          </button>
        </div>
      </div>

      {/* Captains Table */}
      <div className="bg-[#11141c] border border-zinc-800/90 rounded-3xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-3 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-xs font-semibold">جاري جلب بيانات الكباتن وصورهم من Firebase...</p>
          </div>
        ) : filteredCaptains.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="لم يتم العثور على كباتن"
              description="لا توجد نتائج تطابق معايير البحث أو التصفية الحالية."
              icon={Bike}
              actionText="إعادة ضبط البحث"
              onAction={() => {
                setSearchQuery('');
                setStatusFilter('all');
              }}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-xs font-bold text-zinc-400 bg-zinc-950/40">
                  <th className="py-4 px-4">الصورة الشخصية واسم الكابتن</th>
                  <th className="py-4 px-4">رقم الهاتف</th>
                  <th className="py-4 px-4">البريد الإلكتروني</th>
                  <th className="py-4 px-4">المركبة</th>
                  <th className="py-4 px-4">عدد الطلبات</th>
                  <th className="py-4 px-4">التقييم</th>
                  <th className="py-4 px-4">تاريخ الحالة</th>
                  <th className="py-4 px-4">كلمة السر</th>
                  <th className="py-4 px-4">الحالة واستقبال الطلبات</th>
                  <th className="py-4 px-4 text-left">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredCaptains.map((captain) => {
                  const isPassVisible = Boolean(visiblePasswords[captain.id]);
                  const canReceive = captain.canReceiveOrders !== false;
                  const storageFallbacks = [
                    `captains/${captain.id}`,
                    `profile_images/${captain.id}`,
                    `users/${captain.id}`,
                    `drivers/${captain.id}`,
                    `avatars/${captain.id}`,
                  ];

                  return (
                    <tr key={captain.id} className="hover:bg-zinc-900/40 transition-colors">
                      {/* الصورة الشخصية واسم الكابتن */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <FirebaseImage
                            src={captain.profileImage || captain.photoURL}
                            fallbackStoragePaths={storageFallbacks}
                            alt={`صورة الكابتن ${captain.name}`}
                            className="w-11 h-11 rounded-2xl border border-blue-500/30 shadow-xs"
                            onClick={() => setViewingCaptain(captain)}
                            fallbackContent={
                              <div className="w-full h-full bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-sm">
                                <UserIcon className="w-5 h-5" />
                              </div>
                            }
                          />
                          <div>
                            <p className="font-extrabold text-zinc-100 text-sm">{captain.name}</p>
                            <span className="text-[11px] text-zinc-500 font-mono">ID: {captain.id}</span>
                          </div>
                        </div>
                      </td>

                      {/* رقم الهاتف */}
                      <td className="py-4 px-4 text-xs font-mono text-zinc-300" dir="ltr">
                        {captain.phone}
                      </td>

                      {/* البريد الإلكتروني */}
                      <td className="py-4 px-4 text-xs font-mono text-zinc-300" dir="ltr">
                        {captain.email && captain.email !== '—' ? (
                          <div className="inline-flex items-center gap-1.5 text-zinc-200">
                            <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            <span className="truncate max-w-[170px]">{captain.email}</span>
                          </div>
                        ) : (
                          <span className="text-zinc-500">—</span>
                        )}
                      </td>

                      {/* المركبة */}
                      <td className="py-4 px-4 text-xs text-zinc-300">
                        {captain.vehicleType || 'دراجة نارية'}
                      </td>

                      {/* عدد الطلبات */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1.5 text-xs font-black text-white font-['Outfit',sans-serif]">
                          <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                          <span>{captain.ordersCount} طلب</span>
                        </div>
                      </td>

                      {/* التقييم */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1 text-xs font-bold text-amber-400">
                          <Star className="w-3.5 h-3.5 fill-current" />
                          <span>{captain.rating ? captain.rating.toFixed(1) : '5.0'}</span>
                        </div>
                      </td>

                      {/* تاريخ الحالة */}
                      <td className="py-4 px-4 text-xs text-zinc-300 whitespace-nowrap">
                        {formatStatusDate(captain)}
                      </td>

                      {/* كلمة السر الخاصة بالكابتن وإمكانية تعديلها */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="px-2.5 py-1 rounded-lg bg-[#0a0c12] border border-zinc-800 text-xs font-mono text-amber-300 select-all"
                            dir="ltr"
                          >
                            {captain.password
                              ? isPassVisible
                                ? captain.password
                                : '••••••••'
                              : 'غير محددة'}
                          </span>
                          {captain.password && (
                            <button
                              type="button"
                              onClick={() => togglePasswordVisibility(captain.id)}
                              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                              title={isPassVisible ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
                            >
                              {isPassVisible ? (
                                <EyeOff className="w-3.5 h-3.5" />
                              ) : (
                                <Eye className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenPasswordModal(captain)}
                            className="p-1.5 text-amber-400 hover:bg-amber-500/10 border border-amber-500/20 rounded-lg transition-colors"
                            title="تعديل كلمة السر الخاصة بالكابتن"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* الحالة واستقبال الطلبات */}
                      <td className="py-4 px-4">
                        <div className="flex flex-col gap-2 min-w-[175px]">
                          <div className="flex items-center gap-2">
                            <StatusBadge status={captain.status} type="captain" />
                            <select
                              value={captain.status}
                              onChange={(e) => handleUpdateStatus(captain, e.target.value as CaptainStatus)}
                              className="bg-[#0a0c12] border border-zinc-800 text-[11px] font-bold text-zinc-300 rounded-lg px-2 py-1 focus:outline-none focus:border-amber-500"
                            >
                              <option value="online">متصل (Online)</option>
                              <option value="busy">في توصيل (Busy)</option>
                              <option value="offline">غير متصل (Offline)</option>
                            </select>
                          </div>

                          {/* زر تفعيل / إيقاف استقبال الطلبات للكابتن */}
                          <button
                            type="button"
                            disabled={togglingReceptionId === captain.id}
                            onClick={() => handleToggleOrderReception(captain)}
                            className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold border transition-all cursor-pointer disabled:opacity-50 ${
                              canReceive
                                ? 'bg-emerald-500/10 hover:bg-rose-500/15 text-emerald-400 hover:text-rose-300 border-emerald-500/30 hover:border-rose-500/40'
                                : 'bg-rose-500/15 hover:bg-emerald-500/15 text-rose-400 hover:text-emerald-300 border-rose-500/30 hover:border-emerald-500/40'
                            }`}
                            title={
                              canReceive
                                ? 'اضغط لإيقاف استقبال الطلبات لهذا الكابتن'
                                : 'اضغط لتفعيل استقبال الطلبات لهذا الكابتن'
                            }
                          >
                            {canReceive ? (
                              <>
                                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                                <span>يستقبل الطلبات (إيقاف)</span>
                              </>
                            ) : (
                              <>
                                <ShieldOff className="w-3.5 h-3.5 shrink-0" />
                                <span>متوقف عن الطلبات (تفعيل)</span>
                              </>
                            )}
                          </button>
                        </div>
                      </td>

                      {/* الإجراءات */}
                      <td className="py-4 px-4 text-left">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEditCaptain(captain)}
                            className="p-1.5 text-zinc-400 hover:text-amber-400 hover:bg-zinc-800/80 rounded-lg transition-colors"
                            title="تعديل بيانات الكابتن والصورة وكلمة السر"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => navigate('/shifts')}
                            className="p-1.5 text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
                            title="إدارة شفتات وساعات العمل"
                          >
                            <CalendarClock className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => setViewingCaptain(captain)}
                            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 rounded-lg transition-colors"
                            title="عرض التفاصيل"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => setDeletingId(captain.id)}
                            className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800/80 rounded-lg transition-colors"
                            title="حذف الكابتن"
                          >
                            <Trash2 className="w-4 h-4" />
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

      {/* Edit Password Modal */}
      {passwordModalCaptain && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-[#11141c] border border-zinc-800 rounded-3xl p-6 shadow-2xl relative">
            <button
              onClick={() => setPasswordModalCaptain(null)}
              className="absolute top-5 left-5 text-zinc-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">تعديل كلمة السر للكابتن</h3>
                <p className="text-xs text-zinc-400">{passwordModalCaptain.name}</p>
              </div>
            </div>

            <form onSubmit={handleSavePassword} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-zinc-300 mb-1.5">كلمة السر الخاصة بالكابتن</label>
                <input
                  type="text"
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  dir="ltr"
                  placeholder="أدخل كلمة السر الجديدة..."
                  className="w-full bg-[#0a0c12] border border-zinc-800 rounded-xl px-3.5 py-2.5 text-zinc-100 font-mono focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800/80">
                <button
                  type="button"
                  onClick={() => setPasswordModalCaptain(null)}
                  className="px-4 py-2 text-zinc-400 hover:text-white"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold transition-colors disabled:opacity-50"
                >
                  {actionLoading ? 'جاري الحفظ...' : 'حفظ كلمة السر'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Captain Details Modal */}
      {viewingCaptain && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[#11141c] border border-zinc-800 rounded-3xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setViewingCaptain(null)}
              className="absolute top-5 left-5 text-zinc-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-4 mb-6">
              <FirebaseImage
                src={viewingCaptain.profileImage || viewingCaptain.photoURL}
                fallbackStoragePaths={[
                  `captains/${viewingCaptain.id}`,
                  `profile_images/${viewingCaptain.id}`,
                  `users/${viewingCaptain.id}`,
                ]}
                alt={viewingCaptain.name}
                className="w-16 h-16 rounded-2xl border border-blue-500/30"
                fallbackContent={
                  <div className="w-full h-full bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-lg">
                    <UserIcon className="w-7 h-7" />
                  </div>
                }
              />
              <div>
                <h3 className="text-lg font-black text-white">{viewingCaptain.name}</h3>
                <p className="text-xs text-zinc-400 font-mono">ID: {viewingCaptain.id}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs mb-6">
              <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800">
                <span className="text-zinc-500 block mb-1">رقم الهاتف</span>
                <span className="font-bold text-zinc-200 font-mono" dir="ltr">
                  {viewingCaptain.phone}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800">
                <span className="text-zinc-500 block mb-1">نوع المركبة</span>
                <span className="font-bold text-zinc-200">{viewingCaptain.vehicleType || 'دراجة نارية'}</span>
              </div>
              <div className="col-span-2 p-3 rounded-xl bg-zinc-900/80 border border-zinc-800">
                <span className="text-zinc-500 block mb-1">البريد الإلكتروني</span>
                <span className="font-bold text-zinc-200 font-mono" dir="ltr">
                  {viewingCaptain.email || '—'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800">
                <span className="text-zinc-500 block mb-1">الحالة</span>
                <StatusBadge status={viewingCaptain.status} type="captain" />
              </div>
              <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800">
                <span className="text-zinc-500 block mb-1">تاريخ الحالة</span>
                <span className="font-bold text-zinc-200">{formatStatusDate(viewingCaptain)}</span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800">
                <span className="text-zinc-500 block mb-1">عدد الطلبات</span>
                <span className="font-bold text-zinc-200">{viewingCaptain.ordersCount} طلب منجز</span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800">
                <span className="text-zinc-500 block mb-1">التقييم</span>
                <span className="font-bold text-amber-400">
                  {viewingCaptain.rating ? viewingCaptain.rating.toFixed(1) : '5.0'} ★
                </span>
              </div>
              <div className="col-span-2 p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between">
                <div>
                  <span className="text-zinc-500 block mb-1">كلمة السر الخاصة بالكابتن</span>
                  <span className="font-bold text-amber-300 font-mono" dir="ltr">
                    {viewingCaptain.password || 'غير محددة'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const c = viewingCaptain;
                    setViewingCaptain(null);
                    handleOpenPasswordModal(c);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 font-bold text-xs"
                >
                  تعديل كلمة السر
                </button>
              </div>
            </div>

            {/* Order Reception Control inside Modal */}
            <div className="mb-4 p-3.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-zinc-200 block">استقبال الطلبات للكابتن</span>
                <span className="text-[11px] text-zinc-400">
                  {viewingCaptain.canReceiveOrders !== false
                    ? 'الكابتن مفعل حالياً لاستقبال الطلبات'
                    : 'الكابتن متوقف حالياً عن استقبال الطلبات'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleToggleOrderReception(viewingCaptain)}
                className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewingCaptain.canReceiveOrders !== false
                    ? 'bg-rose-500 hover:bg-rose-400 text-white'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950'
                }`}
              >
                <Power className="w-4 h-4" />
                <span>
                  {viewingCaptain.canReceiveOrders !== false ? 'إيقاف استقبال الطلبات' : 'تفعيل استقبال الطلبات'}
                </span>
              </button>
            </div>

            {/* Quick Shift Management in Modal */}
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CalendarClock className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-amber-300">نظام شفتات ومواعيد العمل</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setViewingCaptain(null);
                  navigate('/shifts');
                }}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs transition-all"
              >
                إدارة الشفت
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Captain Modal */}
      {editingCaptain && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[#11141c] border border-zinc-800 rounded-3xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setEditingCaptain(null)}
              className="absolute top-5 left-5 text-zinc-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black text-white mb-4">تعديل بيانات الكابتن</h3>

            <form onSubmit={handleSaveEditCaptain} className="space-y-4 text-xs">
              {/* Personal Photo in Firebase Storage */}
              <div>
                <label className="block font-bold text-zinc-300 mb-1.5">
                  الصورة الشخصية للكابتن (Firebase Storage)
                </label>
                <div className="flex items-center gap-3 mb-2">
                  <FirebaseImage
                    src={formData.profileImage}
                    fallbackStoragePaths={[`captains/${editingCaptain.id}`, `users/${editingCaptain.id}`]}
                    alt={formData.name}
                    className="w-12 h-12 rounded-2xl border border-zinc-700"
                    fallbackContent={
                      <div className="w-full h-full bg-zinc-900 text-zinc-500 flex items-center justify-center">
                        <UserIcon className="w-5 h-5" />
                      </div>
                    }
                  />
                  <label className="flex-1 cursor-pointer flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold transition-colors">
                    <Upload className="w-4 h-4 text-amber-400" />
                    <span>{uploadingPhoto ? 'جاري الرفع...' : 'رفع صورة شخصية للكابتن'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handlePhotoFileChange(e, editingCaptain.id)}
                      className="hidden"
                      disabled={uploadingPhoto}
                    />
                  </label>
                </div>
                <input
                  type="text"
                  value={formData.profileImage}
                  onChange={(e) => setFormData({ ...formData, profileImage: e.target.value })}
                  dir="ltr"
                  placeholder="أو ضع رابط أو مسار الصورة في Firebase Storage..."
                  className="w-full bg-[#0a0c12] border border-zinc-800 rounded-xl px-3.5 py-2 text-zinc-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-300 mb-1.5">اسم الكابتن *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-[#0a0c12] border border-zinc-800 rounded-xl px-3.5 py-2.5 text-zinc-100 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-300 mb-1.5">رقم الهاتف *</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  dir="ltr"
                  className="w-full bg-[#0a0c12] border border-zinc-800 rounded-xl px-3.5 py-2.5 text-zinc-100 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-300 mb-1.5">البريد الإلكتروني</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  dir="ltr"
                  placeholder="captain@example.com"
                  className="w-full bg-[#0a0c12] border border-zinc-800 rounded-xl px-3.5 py-2.5 text-zinc-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-300 mb-1.5">كلمة السر الخاصة بالكابتن</label>
                <input
                  type="text"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  dir="ltr"
                  placeholder="كلمة السر الخاصة بالكابتن..."
                  className="w-full bg-[#0a0c12] border border-zinc-800 rounded-xl px-3.5 py-2.5 text-zinc-100 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-300 mb-1.5">نوع المركبة</label>
                <select
                  value={formData.vehicleType}
                  onChange={(e) => setFormData({ ...formData, vehicleType: e.target.value })}
                  className="w-full bg-[#0a0c12] border border-zinc-800 rounded-xl px-3.5 py-2.5 text-zinc-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="دراجة نارية (موتوسيكل)">دراجة نارية (موتوسيكل)</option>
                  <option value="سكوتر كهربائي">سكوتر كهربائي</option>
                  <option value="سيارة ميني فان">سيارة ميني فان</option>
                  <option value="دراجة هوائية">دراجة هوائية</option>
                </select>
              </div>

              <div className="p-3 rounded-xl bg-[#0a0c12] border border-zinc-800 flex items-center justify-between">
                <span className="font-bold text-zinc-200">السماح للكابتن باستقبال الطلبات</span>
                <input
                  type="checkbox"
                  checked={formData.canReceiveOrders}
                  onChange={(e) => setFormData({ ...formData, canReceiveOrders: e.target.checked })}
                  className="w-4 h-4 accent-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800/80">
                <button
                  type="button"
                  onClick={() => setEditingCaptain(null)}
                  className="px-4 py-2 text-zinc-400 hover:text-white"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || uploadingPhoto}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold transition-colors disabled:opacity-50"
                >
                  {actionLoading ? 'جاري الحفظ...' : 'حفظ التعديلات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add New Captain Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[#11141c] border border-zinc-800 rounded-3xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute top-5 left-5 text-zinc-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black text-white mb-4">تسجيل كابتن جديد في المنظومة</h3>

            <form onSubmit={handleAddCaptain} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-zinc-300 mb-1.5">
                  الصورة الشخصية للكابتن (Firebase Storage)
                </label>
                <div className="flex items-center gap-3 mb-2">
                  <FirebaseImage
                    src={formData.profileImage}
                    alt="صورة الكابتن"
                    className="w-12 h-12 rounded-2xl border border-zinc-700"
                    fallbackContent={
                      <div className="w-full h-full bg-zinc-900 text-zinc-500 flex items-center justify-center">
                        <UserIcon className="w-5 h-5" />
                      </div>
                    }
                  />
                  <label className="flex-1 cursor-pointer flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold transition-colors">
                    <Upload className="w-4 h-4 text-amber-400" />
                    <span>{uploadingPhoto ? 'جاري الرفع...' : 'رفع الصورة الشخصية'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handlePhotoFileChange(e)}
                      className="hidden"
                      disabled={uploadingPhoto}
                    />
                  </label>
                </div>
                <input
                  type="text"
                  value={formData.profileImage}
                  onChange={(e) => setFormData({ ...formData, profileImage: e.target.value })}
                  dir="ltr"
                  placeholder="أو رابط الصورة في Firebase Storage..."
                  className="w-full bg-[#0a0c12] border border-zinc-800 rounded-xl px-3.5 py-2 text-zinc-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-300 mb-1.5">اسم الكابتن الرباعي *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="مثال: أحمد محمد مصطفى"
                  className="w-full bg-[#0a0c12] border border-zinc-800 rounded-xl px-3.5 py-2.5 text-zinc-100 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-300 mb-1.5">رقم الهاتف المحمول *</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  dir="ltr"
                  placeholder="010XXXXXXXX"
                  className="w-full bg-[#0a0c12] border border-zinc-800 rounded-xl px-3.5 py-2.5 text-zinc-100 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-300 mb-1.5">البريد الإلكتروني</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  dir="ltr"
                  placeholder="captain@example.com"
                  className="w-full bg-[#0a0c12] border border-zinc-800 rounded-xl px-3.5 py-2.5 text-zinc-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-300 mb-1.5">كلمة السر الخاصة بالكابتن</label>
                <input
                  type="text"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  dir="ltr"
                  placeholder="أدخل كلمة سر الكابتن..."
                  className="w-full bg-[#0a0c12] border border-zinc-800 rounded-xl px-3.5 py-2.5 text-zinc-100 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-300 mb-1.5">نوع المركبة</label>
                <select
                  value={formData.vehicleType}
                  onChange={(e) => setFormData({ ...formData, vehicleType: e.target.value })}
                  className="w-full bg-[#0a0c12] border border-zinc-800 rounded-xl px-3.5 py-2.5 text-zinc-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="دراجة نارية (موتوسيكل)">دراجة نارية (موتوسيكل)</option>
                  <option value="سكوتر كهربائي">سكوتر كهربائي</option>
                  <option value="سيارة ميني فان">سيارة ميني فان</option>
                  <option value="دراجة هوائية">دراجة هوائية</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-zinc-300 mb-1.5">الحالة الأولية واستقبال الطلبات</label>
                <select
                  value={formData.status}
                  onChange={(e) => {
                    const st = e.target.value as CaptainStatus;
                    setFormData({
                      ...formData,
                      status: st,
                      canReceiveOrders: st !== 'offline',
                    });
                  }}
                  className="w-full bg-[#0a0c12] border border-zinc-800 rounded-xl px-3.5 py-2.5 text-zinc-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="online">متصل ومفعل لاستقبال الطلبات (Online)</option>
                  <option value="offline">غير متصل وموقوف عن الطلبات (Offline)</option>
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
                  disabled={actionLoading || uploadingPhoto}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold transition-colors disabled:opacity-50"
                >
                  {actionLoading ? 'جاري الإضافة...' : 'تسجيل الكابتن'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={Boolean(deletingId)}
        title="تأكيد حذف الكابتن"
        message="هل أنت متأكد من رغبتك في حذف هذا الكابتن من النظام؟"
        confirmText="حذف نهائي"
        cancelText="تراجع"
        isDanger={true}
        isLoading={actionLoading}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeletingId(null)}
      />
    </div>
  );
};
