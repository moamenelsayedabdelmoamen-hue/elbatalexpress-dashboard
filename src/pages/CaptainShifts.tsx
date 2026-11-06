import React, { useState, useEffect, useMemo } from 'react';
import {
  CalendarClock,
  Search,
  Clock,
  Bike,
  Plus,
  RefreshCw,
  Phone,
  CheckCircle2,
  AlertOctagon,
  PauseCircle,
  PlayCircle,
  HelpCircle,
  Sparkles,
  Edit2,
  Eye,
  Calendar,
  Filter,
} from 'lucide-react';
import { Captain, CaptainSchedule, CaptainShiftStatusInfo } from '../types';
import { CaptainService } from '../services/captainService';
import { ShiftService } from '../services/shiftService';
import { ShiftStatusBadge } from '../components/shifts/ShiftStatusBadge';
import { ScheduleEditorModal } from '../components/shifts/ScheduleEditorModal';
import { CaptainScheduleDetailsModal } from '../components/shifts/CaptainScheduleDetailsModal';
import { computeCaptainShiftStatus, getCairoDateTime } from '../utils/shiftUtils';
import { useToast } from '../contexts/ToastContext';

export const CaptainShiftsPage: React.FC = () => {
  const { success, error: toastError } = useToast();

  const [captains, setCaptains] = useState<Captain[]>([]);
  const [schedulesMap, setSchedulesMap] = useState<Map<string, CaptainSchedule>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'off_shift' | 'starting_soon' | 'paused' | 'unscheduled'>('all');

  // Modals state
  const [editingCaptain, setEditingCaptain] = useState<Captain | null>(null);
  const [viewingCaptain, setViewingCaptain] = useState<Captain | null>(null);

  // Current Cairo time ticker
  const [currentTimeStr, setCurrentTimeStr] = useState(() => getCairoDateTime().formattedTime);

  // Load captains and subscribe to schedules real-time
  const loadData = async () => {
    try {
      const res = await CaptainService.getAll();
      setCaptains(res.data);
    } catch (err) {
      console.error('Failed to load captains:', err);
      toastError('فشل تحميل قائمة الكباتن');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();

    // Subscribe to Firestore schedules in real-time
    const unsubscribe = ShiftService.subscribeAllSchedules(
      (freshMap) => {
        setSchedulesMap(freshMap);
      },
      (err) => {
        console.error('Realtime schedule listener error:', err);
      }
    );

    // Cairo time ticker update every 30 seconds
    const interval = setInterval(() => {
      setCurrentTimeStr(getCairoDateTime().formattedTime);
    }, 30000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    const freshMap = await ShiftService.getAllSchedules();
    setSchedulesMap(freshMap);
    setCurrentTimeStr(getCairoDateTime().formattedTime);
    success('تم تحديث بيانات ومواعيد الشفتات');
  };

  // Compute status for all captains
  const captainsWithStatus = useMemo(() => {
    return captains.map((captain) => {
      const schedule = schedulesMap.get(captain.id) || null;
      const statusInfo = computeCaptainShiftStatus(schedule);
      return {
        captain,
        schedule,
        statusInfo,
      };
    });
  }, [captains, schedulesMap, currentTimeStr]);

  // Filtered captains
  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return captainsWithStatus.filter(({ captain, statusInfo }) => {
      const matchesSearch =
        !q ||
        captain.name.toLowerCase().includes(q) ||
        captain.phone.includes(q) ||
        (captain.vehicleType && captain.vehicleType.toLowerCase().includes(q));

      const matchesStatus =
        statusFilter === 'all' ? true : statusInfo.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [captainsWithStatus, searchQuery, statusFilter]);

  // Summary counts
  const stats = useMemo(() => {
    let activeCount = 0;
    let offShiftCount = 0;
    let startingSoonCount = 0;
    let pausedCount = 0;
    let unscheduledCount = 0;
    let totalWeeklyHours = 0;

    captainsWithStatus.forEach(({ statusInfo, schedule }) => {
      if (statusInfo.status === 'active') activeCount++;
      else if (statusInfo.status === 'off_shift') offShiftCount++;
      else if (statusInfo.status === 'starting_soon') startingSoonCount++;
      else if (statusInfo.status === 'paused') pausedCount++;
      else if (statusInfo.status === 'unscheduled') unscheduledCount++;

      if (schedule && !schedule.isPaused) {
        totalWeeklyHours += schedule.totalWeeklyHours || 0;
      }
    });

    return {
      activeCount,
      offShiftCount,
      startingSoonCount,
      pausedCount,
      unscheduledCount,
      totalWeeklyHours,
    };
  }, [captainsWithStatus]);

  // Quick toggle pause/resume
  const handleTogglePause = async (captain: Captain, currentIsPaused: boolean) => {
    try {
      await ShiftService.togglePause(captain.id, !currentIsPaused);
      success(
        !currentIsPaused
          ? `تم إيقاف جدول الكابتن ${captain.name} مؤقتاً`
          : `تم استئناف جدول الكابتن ${captain.name} بنجاح`
      );
    } catch (err) {
      toastError('فشل تغيير حالة الجدول');
    }
  };

  // Quick create default schedule
  const handleQuickCreateDefault = async (captain: Captain) => {
    try {
      await ShiftService.initializeDefaultSchedule(captain.id, captain.name, captain.phone);
      success(`تم تعيين جدول عمل افتراضي للكابتن ${captain.name}`);
    } catch (err) {
      toastError('فشل إنشاء الجدول الافتراضي');
    }
  };

  const cairoInfo = getCairoDateTime();

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-[#141824] to-[#12141c] border border-zinc-800/90 rounded-3xl p-6 shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
              نظام إدارة الشفتات الميدانية
            </span>
            <span className="text-xs text-zinc-500">•</span>
            <span className="text-xs font-mono font-bold text-zinc-300 bg-zinc-900/80 px-2.5 py-0.5 rounded-lg border border-zinc-700/60">
              توقيت مصر: {currentTimeStr} (Africa/Cairo)
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2.5">
            <CalendarClock className="w-7 h-7 text-amber-400" />
            إدارة شفتات وساعات عمل الكباتن
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            جدولة مواعيد العمل الأسبوعية، متابعة حالة التواجد اللحظية، والتحكم التلقائي الصارم في استقبال وإسناد الطلبات
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-200 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 text-amber-400 ${refreshing ? 'animate-spin' : ''}`} />
            <span>تحديث المواعيد</span>
          </button>
        </div>
      </div>

      {/* 5 Stats Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* Active Now */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'active' ? 'all' : 'active')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'active'
              ? 'bg-emerald-500/20 border-emerald-500/50 ring-2 ring-emerald-500/30'
              : 'bg-[#11141c] border-zinc-800/90 hover:border-emerald-500/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-400">يعمل الآن</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          <div className="mt-2 text-2xl font-black text-white font-mono">
            {stats.activeCount}
          </div>
          <span className="text-[11px] text-zinc-400 block mt-0.5">
            مستعدون لاستقبال الطلبات
          </span>
        </div>

        {/* Off Shift */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'off_shift' ? 'all' : 'off_shift')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'off_shift'
              ? 'bg-rose-500/20 border-rose-500/50 ring-2 ring-rose-500/30'
              : 'bg-[#11141c] border-zinc-800/90 hover:border-rose-500/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-400">خارج ساعات العمل</span>
            <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-white font-mono">
            {stats.offShiftCount}
          </div>
          <span className="text-[11px] text-zinc-400 block mt-0.5">
            لا يستقبلون طلبات حالياً
          </span>
        </div>

        {/* Starting Soon */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'starting_soon' ? 'all' : 'starting_soon')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'starting_soon'
              ? 'bg-amber-500/20 border-amber-500/50 ring-2 ring-amber-500/30'
              : 'bg-[#11141c] border-zinc-800/90 hover:border-amber-500/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-400">يبدأ قريباً</span>
            <Clock className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-white font-mono">
            {stats.startingSoonCount}
          </div>
          <span className="text-[11px] text-zinc-400 block mt-0.5">
            شفت يبدأ خلال 60 دقيقة
          </span>
        </div>

        {/* Paused */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'paused' ? 'all' : 'paused')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'paused'
              ? 'bg-zinc-800 border-zinc-600 ring-2 ring-zinc-500/30'
              : 'bg-[#11141c] border-zinc-800/90 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400">الجدول متوقف</span>
            <PauseCircle className="w-3.5 h-3.5 text-zinc-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-white font-mono">
            {stats.pausedCount}
          </div>
          <span className="text-[11px] text-zinc-400 block mt-0.5">
            متوقف مؤقتاً بقرار الإدارة
          </span>
        </div>

        {/* Total Weekly Hours */}
        <div className="p-4 rounded-2xl bg-[#11141c] border border-zinc-800/90">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400">إجمالي الساعات</span>
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-amber-400 font-mono">
            {stats.totalWeeklyHours}
          </div>
          <span className="text-[11px] text-zinc-400 block mt-0.5">
            ساعة أسبوعية مجدولة
          </span>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-[#11141c] border border-zinc-800/90 rounded-3xl p-5 sm:p-6 shadow-xl space-y-5">
        {/* Search & Filter Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-zinc-400 absolute right-3.5 top-3.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث بالاسم، رقم هاتف الكابتن، نوع المركبة..."
              className="w-full bg-[#0a0c12] border border-zinc-700/80 text-zinc-100 placeholder-zinc-500 rounded-xl py-2.5 pr-10 pl-4 text-xs sm:text-sm focus:outline-none focus:border-amber-400 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <span className="text-xs text-zinc-500 font-bold shrink-0">تصفية:</span>
            {[
              { key: 'all', label: 'الكل' },
              { key: 'active', label: 'يعمل الآن 🟢' },
              { key: 'off_shift', label: 'خارج الشفت 🔴' },
              { key: 'starting_soon', label: 'يبدأ قريباً 🟠' },
              { key: 'paused', label: 'متوقف مؤقتاً ⚪' },
              { key: 'unscheduled', label: 'غير مجدول' },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  statusFilter === key
                    ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20'
                    : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 border border-zinc-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Table Content */}
        {loading ? (
          <div className="py-16 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
            <p className="text-xs text-zinc-400 font-bold">جاري تحميل الكباتن وجداول الشفتات...</p>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="py-16 text-center space-y-3 rounded-2xl bg-zinc-900/30 border border-zinc-800/80">
            <Bike className="w-10 h-10 text-zinc-600 mx-auto" />
            <h4 className="text-sm font-black text-zinc-200">لا توجد نتائج مطابقة</h4>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              لم نعثر على أي كابتن يطابق معايير البحث أو التصفية المحددة.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-zinc-800/80">
            <table className="w-full text-right text-xs">
              <thead className="bg-[#090b10] border-b border-zinc-800 text-zinc-400 uppercase font-bold text-[11px]">
                <tr>
                  <th className="py-3.5 px-4">الكابتن</th>
                  <th className="py-3.5 px-4">حالة الشفت والعمل</th>
                  <th className="py-3.5 px-4">مواعيد اليوم / الشفت القادم</th>
                  <th className="py-3.5 px-4 text-center">ساعات اليوم</th>
                  <th className="py-3.5 px-4 text-center">ساعات الأسبوع</th>
                  <th className="py-3.5 px-4 text-center">حالة الجدول</th>
                  <th className="py-3.5 px-4 text-left">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80 bg-[#0d1017]">
                {filteredList.map(({ captain, schedule, statusInfo }) => {
                  return (
                    <tr
                      key={captain.id}
                      className="hover:bg-zinc-900/50 transition-colors group"
                    >
                      {/* Captain Info */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-zinc-800/80 border border-zinc-700/80 flex items-center justify-center text-amber-400 font-bold shrink-0">
                            <Bike className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-extrabold text-sm text-white group-hover:text-amber-400 transition-colors">
                              {captain.name}
                            </div>
                            <div className="text-[11px] text-zinc-400 flex items-center gap-2 mt-0.5">
                              <span className="font-mono" dir="ltr">{captain.phone}</span>
                              {captain.vehicleType && (
                                <span className="text-zinc-500">• {captain.vehicleType}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Shift Status Badge */}
                      <td className="py-3.5 px-4">
                        <ShiftStatusBadge status={statusInfo.status} />
                        {statusInfo.currentShift && (
                          <span className="text-[10px] text-zinc-400 block mt-1">
                            حتى {statusInfo.currentShiftEnd}
                          </span>
                        )}
                      </td>

                      {/* Timing details */}
                      <td className="py-3.5 px-4 text-zinc-300">
                        {statusInfo.currentShift ? (
                          <div className="text-[11px]">
                            <span className="font-bold text-emerald-400">
                              {statusInfo.currentShift.name || 'وردية حالية'}:
                            </span>{' '}
                            <span className="font-mono">
                              {statusInfo.currentShift.startTime} - {statusInfo.currentShift.endTime}
                            </span>
                          </div>
                        ) : statusInfo.nextShift ? (
                          <div className="text-[11px]">
                            <span className="text-zinc-400">يبدأ:</span>{' '}
                            <span className="font-bold text-amber-300">
                              {statusInfo.nextShift.dayNameAr} ({statusInfo.nextShift.startTimeFormatted})
                            </span>
                          </div>
                        ) : statusInfo.isDayOffToday ? (
                          <span className="text-[11px] text-zinc-500 font-bold">
                            اليوم إجازة رسمية
                          </span>
                        ) : (
                          <span className="text-[11px] text-zinc-500">
                            لا توجد شفتات قادمة
                          </span>
                        )}
                      </td>

                      {/* Today Hours */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="font-mono font-extrabold text-sm text-zinc-100">
                          {statusInfo.todayWorkingHours}
                        </span>
                        <span className="text-[10px] text-zinc-500 mr-1">س</span>
                      </td>

                      {/* Weekly Hours */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="font-mono font-extrabold text-sm text-amber-400">
                          {statusInfo.weeklyWorkingHours}
                        </span>
                        <span className="text-[10px] text-zinc-500 mr-1">س/أسبوع</span>
                      </td>

                      {/* Schedule Pause/Play Toggle */}
                      <td className="py-3.5 px-4 text-center">
                        {schedule ? (
                          <button
                            type="button"
                            onClick={() => handleTogglePause(captain, schedule.isPaused)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                              schedule.isPaused
                                ? 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-emerald-500/10 hover:text-emerald-300 hover:border-emerald-500/30'
                                : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-zinc-800 hover:text-zinc-400'
                            }`}
                            title={schedule.isPaused ? 'اضغط لتشغيل الجدول' : 'اضغط لإيقاف الجدول مؤقتاً'}
                          >
                            {schedule.isPaused ? (
                              <>
                                <PlayCircle className="w-3.5 h-3.5 text-zinc-400" />
                                <span>متوقف (استئناف)</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span>يعمل بالجدول</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleQuickCreateDefault(captain)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 transition-all cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            <span>تفعيل سريع</span>
                          </button>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-left">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setViewingCaptain(captain)}
                            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
                            title="عرض تفاصيل وتقويم شفتات الكابتن"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setEditingCaptain(captain)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold transition-all cursor-pointer"
                            title="تعديل جدول شفتات وساعات العمل"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>تعديل المواعيد</span>
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

      {/* Schedule Editor Modal */}
      {editingCaptain && (
        <ScheduleEditorModal
          isOpen={Boolean(editingCaptain)}
          captain={editingCaptain}
          initialSchedule={schedulesMap.get(editingCaptain.id) || null}
          onClose={() => setEditingCaptain(null)}
          onSaved={(savedSchedule) => {
            setSchedulesMap((prev) => {
              const next = new Map(prev);
              next.set(savedSchedule.captainId, savedSchedule);
              return next;
            });
          }}
        />
      )}

      {/* Schedule Details View Modal */}
      {viewingCaptain && (
        <CaptainScheduleDetailsModal
          isOpen={Boolean(viewingCaptain)}
          captain={viewingCaptain}
          schedule={schedulesMap.get(viewingCaptain.id) || null}
          statusInfo={computeCaptainShiftStatus(schedulesMap.get(viewingCaptain.id) || null)}
          onClose={() => setViewingCaptain(null)}
          onEdit={() => {
            const capt = viewingCaptain;
            setViewingCaptain(null);
            setEditingCaptain(capt);
          }}
          onTogglePause={() => {
            const sched = schedulesMap.get(viewingCaptain.id);
            if (sched) {
              handleTogglePause(viewingCaptain, sched.isPaused);
            }
          }}
        />
      )}
    </div>
  );
};
