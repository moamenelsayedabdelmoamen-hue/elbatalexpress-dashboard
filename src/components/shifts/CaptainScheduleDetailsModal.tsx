import React from 'react';
import {
  X,
  Calendar,
  Clock,
  Phone,
  Bike,
  Edit2,
  PauseCircle,
  PlayCircle,
  Moon,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import {
  Captain,
  CaptainSchedule,
  CaptainShiftStatusInfo,
} from '../../types';
import { ShiftStatusBadge } from './ShiftStatusBadge';
import {
  DAYS_OF_WEEK,
  formatTimeStringArabic,
  getCairoDateTime,
} from '../../utils/shiftUtils';

interface CaptainScheduleDetailsModalProps {
  isOpen: boolean;
  captain: Captain | null;
  schedule: CaptainSchedule | null;
  statusInfo: CaptainShiftStatusInfo;
  onClose: () => void;
  onEdit: () => void;
  onTogglePause: () => void;
}

export const CaptainScheduleDetailsModal: React.FC<CaptainScheduleDetailsModalProps> = ({
  isOpen,
  captain,
  schedule,
  statusInfo,
  onClose,
  onEdit,
  onTogglePause,
}) => {
  if (!isOpen || !captain) return null;

  const cairo = getCairoDateTime();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="w-full max-w-3xl bg-[#0d1017] border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center font-bold">
              <Bike className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-lg text-white">{captain.name}</h3>
                <ShiftStatusBadge status={statusInfo.status} size="sm" />
              </div>
              <p className="text-xs text-zinc-400 flex items-center gap-2 mt-0.5">
                <span>{captain.vehicleType || 'دراجة نارية'}</span>
                {captain.phone && <span className="font-mono">• {captain.phone}</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>تعديل المواعيد</span>
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

        {/* Status & Summary Cards Grid */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 bg-[#0d1017]">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
              <span className="text-[11px] text-zinc-500 block mb-1">
                ساعات العمل اليوم ({cairo.dayOfWeek ? 'اليوم' : ''})
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-black text-amber-400 font-mono">
                  {statusInfo.todayWorkingHours}
                </span>
                <span className="text-xs text-zinc-400">ساعة</span>
              </div>
              <span className="text-[10px] text-zinc-500 block mt-1">
                {statusInfo.isDayOffToday ? 'اليوم إجازة رسمية' : 'مجدول للعمل'}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
              <span className="text-[11px] text-zinc-500 block mb-1">
                إجمالي الساعات الأسبوعية
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-black text-emerald-400 font-mono">
                  {statusInfo.weeklyWorkingHours}
                </span>
                <span className="text-xs text-zinc-400">ساعة / أسبوع</span>
              </div>
              <span className="text-[10px] text-zinc-500 block mt-1">
                من السبت إلى الجمعة
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
              <span className="text-[11px] text-zinc-500 block mb-1">
                توقيت القاهرة المعتمد
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-black text-white font-mono" dir="ltr">
                  {statusInfo.currentTimeInCairo}
                </span>
              </div>
              <span className="text-[10px] text-zinc-500 block mt-1">
                Africa/Cairo Time
              </span>
            </div>
          </div>

          {/* Current / Next shift announcement banner */}
          <div className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <div className="font-bold text-zinc-200">
                الحالة التشغيلية الحالية: {statusInfo.statusLabelAr}
              </div>
              {statusInfo.message && (
                <p className="text-zinc-400 leading-relaxed">{statusInfo.message}</p>
              )}
              {statusInfo.nextShift && (
                <p className="text-amber-400/90 font-medium pt-1">
                  الشفت القادم:{' '}
                  <span className="font-bold">
                    {statusInfo.nextShift.dayNameAr} (الساعة {statusInfo.nextShift.startTimeFormatted})
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Weekly Days Schedule Table */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-400" />
              تفاصيل جدول الأسبوع الكامل (من السبت إلى الجمعة)
            </h4>

            {!schedule ? (
              <div className="p-8 text-center rounded-2xl bg-zinc-900/30 border border-zinc-800">
                <p className="text-xs text-zinc-400">
                  لا يوجد جدول شفتات محفوظ لهذا الكابتن بعد.
                </p>
                <button
                  type="button"
                  onClick={onEdit}
                  className="mt-3 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs"
                >
                  إنشاء جدول عمل للكابتن
                </button>
              </div>
            ) : (
              <div className="border border-zinc-800/90 rounded-2xl overflow-hidden divide-y divide-zinc-800/80">
                {DAYS_OF_WEEK.map(({ key, nameAr }) => {
                  const dayData = schedule.weeklySchedule?.[key];
                  const isToday = cairo.dayOfWeek === key;
                  const isOff = dayData?.isDayOff;

                  return (
                    <div
                      key={key}
                      className={`p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                        isToday
                          ? 'bg-amber-500/10 border-r-4 border-r-amber-500'
                          : 'bg-[#10131c] hover:bg-zinc-900/60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-extrabold text-sm text-zinc-100 min-w-[70px]">
                          {nameAr}
                        </span>
                        {isToday && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-bold">
                            اليوم الحالي
                          </span>
                        )}
                        {isOff ? (
                          <span className="text-xs font-bold text-zinc-500 bg-zinc-800/70 px-2.5 py-0.5 rounded-lg">
                            إجازة رسمية
                          </span>
                        ) : (
                          <span className="text-xs font-mono font-bold text-emerald-400">
                            {dayData?.totalHours || 0} ساعة
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {isOff ? (
                          <span className="text-xs text-zinc-500">لا توجد ورديات</span>
                        ) : !dayData?.shifts?.length ? (
                          <span className="text-xs text-zinc-500">غير محدد</span>
                        ) : (
                          dayData.shifts.map((shift) => (
                            <div
                              key={shift.id}
                              className="flex items-center gap-2 px-3 py-1 rounded-xl bg-zinc-900 border border-zinc-700/80 text-xs text-zinc-200"
                            >
                              <span className="text-amber-400 font-bold">
                                {shift.name || 'وردية'}:
                              </span>
                              <span className="font-mono">
                                {formatTimeStringArabic(shift.startTime)} إلى{' '}
                                {formatTimeStringArabic(shift.endTime)}
                              </span>
                              {shift.isOvernight && (
                                <Moon
                                  className="w-3.5 h-3.5 text-indigo-400"
                                  title="شفت ليلي"
                                />
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onTogglePause}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
              schedule?.isPaused
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
            }`}
          >
            {schedule?.isPaused ? (
              <>
                <PlayCircle className="w-4 h-4 text-emerald-400" />
                <span>استئناف تشغيل الجدول</span>
              </>
            ) : (
              <>
                <PauseCircle className="w-4 h-4 text-amber-400" />
                <span>إيقاف الجدول مؤقتاً</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
