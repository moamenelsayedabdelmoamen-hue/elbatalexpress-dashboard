import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Copy,
  Clock,
  Calendar,
  AlertCircle,
  Save,
  PauseCircle,
  PlayCircle,
  Sparkles,
  Moon,
} from 'lucide-react';
import {
  Captain,
  CaptainSchedule,
  DayOfWeek,
  DaySchedule,
  ShiftTimeSlot,
} from '../../types';
import {
  DAYS_OF_WEEK,
  DAY_NAMES_AR,
  calculateShiftDurationHours,
  validateShiftOverlap,
  createDefaultWeeklySchedule,
  formatTimeStringArabic,
} from '../../utils/shiftUtils';
import { ShiftService } from '../../services/shiftService';
import { useToast } from '../../contexts/ToastContext';

interface ScheduleEditorModalProps {
  isOpen: boolean;
  captain: Captain | null;
  initialSchedule?: CaptainSchedule | null;
  onClose: () => void;
  onSaved: (schedule: CaptainSchedule) => void;
}

export const ScheduleEditorModal: React.FC<ScheduleEditorModalProps> = ({
  isOpen,
  captain,
  initialSchedule,
  onClose,
  onSaved,
}) => {
  const { success, error: toastError } = useToast();

  if (!isOpen || !captain) return null;

  // Initialize schedule form state
  const [scheduleState, setScheduleState] = useState<CaptainSchedule>(() => {
    if (initialSchedule) {
      return JSON.parse(JSON.stringify(initialSchedule));
    }
    return createDefaultWeeklySchedule(captain.id, captain.name, captain.phone);
  });

  const [activeDayTab, setActiveDayTab] = useState<DayOfWeek>('saturday');
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const calculateTotalWeeklyHours = (weekly: Record<DayOfWeek, DaySchedule>): number => {
    return (Object.values(weekly) as DaySchedule[]).reduce(
      (acc, d) => acc + (d.isDayOff ? 0 : (d.totalHours || 0)),
      0
    );
  };

  // Toggle pause/active
  const handleTogglePause = () => {
    setScheduleState((prev) => ({
      ...prev,
      isPaused: !prev.isPaused,
    }));
  };

  // Toggle Day Off for active day
  const handleToggleDayOff = (day: DayOfWeek) => {
    setScheduleState((prev) => {
      const currentDay = prev.weeklySchedule[day];
      const newIsDayOff = !currentDay.isDayOff;
      const updatedShifts = newIsDayOff ? [] : currentDay.shifts.length ? currentDay.shifts : [
        {
          id: `shift_${day}_${Date.now()}`,
          name: 'وردية أساسية',
          startTime: '10:00',
          endTime: '22:00',
          durationHours: 12,
          isOvernight: false,
        },
      ];

      const totalHours = newIsDayOff
        ? 0
        : updatedShifts.reduce((acc, s) => acc + s.durationHours, 0);

      const newWeeklySchedule = {
        ...prev.weeklySchedule,
        [day]: {
          ...currentDay,
          isDayOff: newIsDayOff,
          shifts: updatedShifts,
          totalHours,
        },
      };

      const newTotalWeekly = calculateTotalWeeklyHours(newWeeklySchedule);

      return {
        ...prev,
        weeklySchedule: newWeeklySchedule,
        totalWeeklyHours: newTotalWeekly,
      };
    });
    setValidationError(null);
  };

  // Add shift to active day
  const handleAddShift = (day: DayOfWeek) => {
    setScheduleState((prev) => {
      const currentDay = prev.weeklySchedule[day];
      const shiftNum = (currentDay.shifts?.length || 0) + 1;
      const newShift: ShiftTimeSlot = {
        id: `shift_${day}_${Date.now()}`,
        name: `وردية ${shiftNum}`,
        startTime: '14:00',
        endTime: '22:00',
        durationHours: 8,
        isOvernight: false,
      };

      const updatedShifts = [...(currentDay.shifts || []), newShift];
      const overlapErr = validateShiftOverlap(updatedShifts);
      if (overlapErr) {
        setValidationError(overlapErr);
      }

      const totalHours = updatedShifts.reduce((acc, s) => acc + s.durationHours, 0);

      const newWeeklySchedule = {
        ...prev.weeklySchedule,
        [day]: {
          ...currentDay,
          isDayOff: false,
          shifts: updatedShifts,
          totalHours,
        },
      };

      return {
        ...prev,
        weeklySchedule: newWeeklySchedule,
        totalWeeklyHours: calculateTotalWeeklyHours(newWeeklySchedule),
      };
    });
  };

  // Remove shift from day
  const handleRemoveShift = (day: DayOfWeek, shiftId: string) => {
    setScheduleState((prev) => {
      const currentDay = prev.weeklySchedule[day];
      const updatedShifts = currentDay.shifts.filter((s) => s.id !== shiftId);
      const totalHours = updatedShifts.reduce((acc, s) => acc + s.durationHours, 0);

      const newWeeklySchedule = {
        ...prev.weeklySchedule,
        [day]: {
          ...currentDay,
          shifts: updatedShifts,
          totalHours,
        },
      };

      return {
        ...prev,
        weeklySchedule: newWeeklySchedule,
        totalWeeklyHours: calculateTotalWeeklyHours(newWeeklySchedule),
      };
    });
    setValidationError(null);
  };

  // Update shift parameters
  const handleUpdateShift = (
    day: DayOfWeek,
    shiftId: string,
    updates: Partial<ShiftTimeSlot>
  ) => {
    setScheduleState((prev) => {
      const currentDay = prev.weeklySchedule[day];
      const updatedShifts = currentDay.shifts.map((s) => {
        if (s.id !== shiftId) return s;
        const merged = { ...s, ...updates };

        // Recalculate duration and overnight flag if times changed
        if (updates.startTime || updates.endTime) {
          const { durationHours, isOvernight } = calculateShiftDurationHours(
            merged.startTime,
            merged.endTime
          );
          merged.durationHours = durationHours;
          merged.isOvernight = isOvernight;
        }

        return merged;
      });

      const overlapErr = validateShiftOverlap(updatedShifts);
      setValidationError(overlapErr);

      const totalHours = updatedShifts.reduce((acc, s) => acc + s.durationHours, 0);

      const newWeeklySchedule = {
        ...prev.weeklySchedule,
        [day]: {
          ...currentDay,
          shifts: updatedShifts,
          totalHours,
        },
      };

      return {
        ...prev,
        weeklySchedule: newWeeklySchedule,
        totalWeeklyHours: calculateTotalWeeklyHours(newWeeklySchedule),
      };
    });
  };

  // Copy active day shifts to all other working days
  const handleCopyDayToAllDays = (sourceDay: DayOfWeek) => {
    const sourceData = scheduleState.weeklySchedule[sourceDay];
    if (sourceData.isDayOff || !sourceData.shifts?.length) {
      toastError('لا يمكن نسخ يوم إجازة أو يوم بدون شفتات لباقي الأسبوع');
      return;
    }

    setScheduleState((prev) => {
      const newWeeklySchedule: Record<DayOfWeek, DaySchedule> = { ...prev.weeklySchedule };

      DAYS_OF_WEEK.forEach(({ key }) => {
        if (key !== sourceDay && key !== 'friday') {
          // Clone shifts with new unique IDs
          const clonedShifts: ShiftTimeSlot[] = sourceData.shifts.map((s, idx) => ({
            ...s,
            id: `shift_${key}_${Date.now()}_${idx}`,
          }));

          newWeeklySchedule[key] = {
            day: key,
            dayNameAr: DAY_NAMES_AR[key],
            isDayOff: false,
            shifts: clonedShifts,
            totalHours: sourceData.totalHours,
          };
        }
      });

      const totalWeekly = calculateTotalWeeklyHours(newWeeklySchedule);

      return {
        ...prev,
        weeklySchedule: newWeeklySchedule,
        totalWeeklyHours: totalWeekly,
      };
    });

    success(`تم نسخ شفتات يوم (${DAY_NAMES_AR[sourceDay]}) إلى باقي أيام العمل بنجاح!`);
  };

  // Save changes
  const handleSave = async () => {
    // Check all days for overlaps
    for (const { key, nameAr } of DAYS_OF_WEEK) {
      const day = scheduleState.weeklySchedule[key];
      if (!day.isDayOff && day.shifts?.length > 1) {
        const overlap = validateShiftOverlap(day.shifts);
        if (overlap) {
          toastError(`خطأ في يوم ${nameAr}: ${overlap}`);
          setActiveDayTab(key);
          setValidationError(overlap);
          return;
        }
      }
    }

    setSaving(true);
    try {
      await ShiftService.saveSchedule(scheduleState);
      success(`تم حفظ وتحديث جدول شفتات الكابتن ${captain.name} بنجاح`);
      onSaved(scheduleState);
      onClose();
    } catch (err: any) {
      console.error('Failed to save schedule:', err);
      toastError(err?.message ? `فشل الحفظ: ${err.message}` : 'فشل حفظ جدول الشفتات في Firebase');
    } finally {
      setSaving(false);
    }
  };

  const currentDayData = scheduleState.weeklySchedule[activeDayTab];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="w-full max-w-4xl bg-[#0d1017] border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center font-bold">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-lg text-white">
                  جدول شفتات وساعات عمل الكابتن
                </h3>
                {scheduleState.isPaused ? (
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400 border border-zinc-700">
                    متوقف مؤقتاً
                  </span>
                ) : (
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    جدول نشط
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                الكابتن:{' '}
                <span className="font-bold text-amber-400">{captain.name}</span>
                {captain.phone && <span className="font-mono"> • {captain.phone}</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleTogglePause}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                scheduleState.isPaused
                  ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/30'
                  : 'bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 border-zinc-700'
              }`}
              title={scheduleState.isPaused ? 'استئناف تشغيل الجدول' : 'إيقاف الجدول مؤقتاً'}
            >
              {scheduleState.isPaused ? (
                <>
                  <PlayCircle className="w-4 h-4 text-emerald-400" />
                  <span>استئناف الجدول</span>
                </>
              ) : (
                <>
                  <PauseCircle className="w-4 h-4 text-amber-400" />
                  <span>إيقاف مؤقت للجدول</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Schedule Summary Bar */}
        <div className="p-4 bg-zinc-950/60 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <span className="text-zinc-400">إجمالي ساعات العمل الأسبوعية:</span>
              <span className="font-black text-amber-400 text-sm">
                {scheduleState.totalWeeklyHours} ساعة
              </span>
            </div>
            <span className="text-zinc-700">|</span>
            <div className="text-zinc-400">
              المنطقة الزمنية المعتمدة:{' '}
              <span className="font-bold text-zinc-200">Africa/Cairo (توقيت القاهرة)</span>
            </div>
          </div>

          {currentDayData && !currentDayData.isDayOff && (
            <button
              type="button"
              onClick={() => handleCopyDayToAllDays(activeDayTab)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold transition-all text-[11px] cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>نسخ شفتات ({DAY_NAMES_AR[activeDayTab]}) لباقي أيام الأسبوع</span>
            </button>
          )}
        </div>

        {/* Days of Week Tab Navigation */}
        <div className="flex items-center overflow-x-auto border-b border-zinc-800/80 bg-[#10141e] px-4 pt-2 gap-2 scrollbar-none">
          {DAYS_OF_WEEK.map(({ key, nameAr }) => {
            const dayData = scheduleState.weeklySchedule[key];
            const isActive = activeDayTab === key;
            const isOff = dayData.isDayOff;

            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setActiveDayTab(key);
                  setValidationError(null);
                }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-t-2xl text-xs font-black transition-all cursor-pointer border-t border-r border-l ${
                  isActive
                    ? 'bg-[#0d1017] text-amber-400 border-zinc-700 -mb-[1px]'
                    : 'text-zinc-400 hover:text-zinc-200 border-transparent hover:bg-zinc-800/40'
                }`}
              >
                <span>{nameAr}</span>
                {isOff ? (
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-500 font-normal">
                    إجازة
                  </span>
                ) : (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                      isActive
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {dayData.totalHours}س
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Modal Body: Active Day Shift Management */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 bg-[#0d1017]">
          {/* Day Status Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
            <div>
              <h4 className="text-sm font-black text-white flex items-center gap-2">
                <span>يوم {DAY_NAMES_AR[activeDayTab]}</span>
                {currentDayData.isDayOff ? (
                  <span className="text-xs px-2.5 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold">
                    إجازة أسبوعية رسمية
                  </span>
                ) : (
                  <span className="text-xs px-2.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                    يوم عمل ({currentDayData.totalHours} ساعة)
                  </span>
                )}
              </h4>
              <p className="text-xs text-zinc-400 mt-1">
                {currentDayData.isDayOff
                  ? 'الكابتن لا يستقبل طلبات طوال هذا اليوم ولن يظهر متاحاً في النظام'
                  : `يمكن تحديد وردية واحدة أو عدة شفتات خلال اليوم (مثلاً شفت صباحي وآخر مسائي)`}
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleToggleDayOff(activeDayTab)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                currentDayData.isDayOff
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                  : 'bg-rose-500/15 text-rose-300 border-rose-500/30 hover:bg-rose-500/25'
              }`}
            >
              {currentDayData.isDayOff ? 'تحويل إلى يوم عمل' : 'تحديد كيوم إجازة'}
            </button>
          </div>

          {/* Overlap error alert */}
          {validationError && (
            <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Shifts List for Active Day */}
          {!currentDayData.isDayOff && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-400" />
                  قائمة شفتات يوم {DAY_NAMES_AR[activeDayTab]} (
                  {currentDayData.shifts?.length || 0})
                </h5>

                <button
                  type="button"
                  onClick={() => handleAddShift(activeDayTab)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs transition-all shadow-md shadow-amber-500/20 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة شفت إضافي</span>
                </button>
              </div>

              {(!currentDayData.shifts || currentDayData.shifts.length === 0) ? (
                <div className="p-8 text-center rounded-2xl bg-zinc-900/30 border border-zinc-800/80 space-y-2">
                  <Clock className="w-8 h-8 text-zinc-600 mx-auto" />
                  <p className="text-xs text-zinc-400 font-bold">
                    لا توجد شفتات مضافة لهذا اليوم بعد
                  </p>
                  <button
                    type="button"
                    onClick={() => handleAddShift(activeDayTab)}
                    className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:underline font-bold mt-2 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة شفت الآن</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {currentDayData.shifts.map((shift, index) => {
                    return (
                      <div
                        key={shift.id}
                        className="p-4 sm:p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 transition-all space-y-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-black">
                              {index + 1}
                            </span>
                            <input
                              type="text"
                              value={shift.name || ''}
                              onChange={(e) =>
                                handleUpdateShift(activeDayTab, shift.id, {
                                  name: e.target.value,
                                })
                              }
                              placeholder="اسم الشفت (مثال: شفت صباحي)"
                              className="bg-transparent border-b border-zinc-700 text-xs sm:text-sm font-bold text-zinc-200 focus:outline-none focus:border-amber-400 px-1 py-0.5"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            {shift.isOvernight && (
                              <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-bold">
                                <Moon className="w-3 h-3 text-indigo-400" />
                                <span>شفت ليلي (عابر لمنتصف الليل)</span>
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveShift(activeDayTab, shift.id)}
                              className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                              title="حذف هذا الشفت"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Times Picker Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                          <div>
                            <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                              وقت بداية الشفت
                            </label>
                            <input
                              type="time"
                              value={shift.startTime}
                              onChange={(e) =>
                                handleUpdateShift(activeDayTab, shift.id, {
                                  startTime: e.target.value,
                                })
                              }
                              className="w-full bg-[#0a0c12] border border-zinc-700 rounded-xl px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-amber-400"
                            />
                            <span className="text-[10px] text-zinc-500 block mt-1">
                              يعادل: {formatTimeStringArabic(shift.startTime)}
                            </span>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                              وقت نهاية الشفت
                            </label>
                            <input
                              type="time"
                              value={shift.endTime}
                              onChange={(e) =>
                                handleUpdateShift(activeDayTab, shift.id, {
                                  endTime: e.target.value,
                                })
                              }
                              className="w-full bg-[#0a0c12] border border-zinc-700 rounded-xl px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-amber-400"
                            />
                            <span className="text-[10px] text-zinc-500 block mt-1">
                              يعادل: {formatTimeStringArabic(shift.endTime)}
                            </span>
                          </div>

                          <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex flex-col justify-center">
                            <span className="text-[11px] text-zinc-400 block mb-0.5">
                              عدد ساعات الشفت
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-base font-black text-amber-400 font-mono">
                                {shift.durationHours}
                              </span>
                              <span className="text-xs text-zinc-300">ساعة عمل</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* General Notes for Captain Schedule */}
          <div className="border-t border-zinc-800/80 pt-4">
            <label className="block text-xs font-bold text-zinc-300 mb-1.5">
              ملاحظات إدارية خاصة بجدول الكابتن (اختياري)
            </label>
            <textarea
              value={scheduleState.notes || ''}
              onChange={(e) =>
                setScheduleState((prev) => ({ ...prev, notes: e.target.value }))
              }
              placeholder="مثال: يفضل شفتات المساء، متاح في العطلات الرسمية، يغطي منطقة معينة..."
              rows={2}
              className="w-full bg-[#0a0c12] border border-zinc-800 rounded-xl p-3 text-xs text-zinc-100 focus:outline-none focus:border-amber-400 placeholder-zinc-600"
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-400 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              يتم تطبيق الشفتات وحساب ساعات العمل تلقائياً وفق توقيت القاهرة (Africa/Cairo).
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-bold text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs shadow-lg shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'جاري الحفظ...' : 'حفظ جدول الشفتات'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
