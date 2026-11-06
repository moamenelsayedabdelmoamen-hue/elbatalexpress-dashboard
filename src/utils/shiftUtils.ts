import {
  DayOfWeek,
  DaySchedule,
  ShiftTimeSlot,
  CaptainSchedule,
  CaptainShiftStatusInfo,
  NextShiftInfo,
  ShiftWorkStatus,
} from '../types';

export const DAYS_OF_WEEK: { key: DayOfWeek; nameAr: string; dayIndex: number }[] = [
  { key: 'saturday', nameAr: 'السبت', dayIndex: 6 },
  { key: 'sunday', nameAr: 'الأحد', dayIndex: 0 },
  { key: 'monday', nameAr: 'الاثنين', dayIndex: 1 },
  { key: 'tuesday', nameAr: 'الثلاثاء', dayIndex: 2 },
  { key: 'wednesday', nameAr: 'الأربعاء', dayIndex: 3 },
  { key: 'thursday', nameAr: 'الخميس', dayIndex: 4 },
  { key: 'friday', nameAr: 'الجمعة', dayIndex: 5 },
];

export const DAY_KEY_MAP: Record<number, DayOfWeek> = {
  6: 'saturday',
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
};

export const DAY_NAMES_AR: Record<DayOfWeek, string> = {
  saturday: 'السبت',
  sunday: 'الأحد',
  monday: 'الاثنين',
  tuesday: 'الثلاثاء',
  wednesday: 'الأربعاء',
  thursday: 'الخميس',
  friday: 'الجمعة',
};

/**
 * Returns current date and time in the Africa/Cairo timezone
 * irrespective of client machine timezone settings.
 */
export function getCairoDateTime(): {
  date: Date;
  dayOfWeek: DayOfWeek;
  hours: number;
  minutes: number;
  currentMinutes: number; // minutes from midnight
  formattedTime: string;
  formattedDate: string;
} {
  const now = new Date();
  
  // Format to Africa/Cairo locale string parts
  const cairoString = now.toLocaleString('en-US', { timeZone: 'Africa/Cairo' });
  const cairoDate = new Date(cairoString);

  const hours = cairoDate.getHours();
  const minutes = cairoDate.getMinutes();
  const dayIndex = cairoDate.getDay(); // 0 is Sunday, 6 is Saturday
  const dayOfWeek = DAY_KEY_MAP[dayIndex] || 'saturday';

  const pad = (n: number) => n.toString().padStart(2, '0');
  const formattedTime = `${pad(hours)}:${pad(minutes)}`;
  const formattedDate = cairoDate.toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return {
    date: cairoDate,
    dayOfWeek,
    hours,
    minutes,
    currentMinutes: hours * 60 + minutes,
    formattedTime,
    formattedDate,
  };
}

/**
 * Parse "HH:mm" into minutes from midnight (0..1439)
 */
export function timeStringToMinutes(timeStr: string): number {
  if (!timeStr || !timeStr.includes(':')) return 0;
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;
  return Math.min(Math.max(h * 60 + m, 0), 1439);
}

/**
 * Convert minutes from midnight into 12-hour Arabic formatted time (e.g. 02:30 م)
 */
export function formatMinutesToArabicTime(totalMinutes: number): string {
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const mins = totalMinutes % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  
  const period = hours24 >= 12 ? 'م' : 'ص';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  
  return `${hours12}:${pad(mins)} ${period}`;
}

/**
 * Format "HH:mm" string into 12-hour Arabic string (e.g. "14:30" -> "2:30 م")
 */
export function formatTimeStringArabic(timeStr: string): string {
  if (!timeStr) return '—';
  return formatMinutesToArabicTime(timeStringToMinutes(timeStr));
}

/**
 * Calculates duration in hours between start and end times,
 * handling overnight shifts (e.g. 22:00 to 04:00 -> 6 hours).
 */
export function calculateShiftDurationHours(startTime: string, endTime: string): {
  durationHours: number;
  isOvernight: boolean;
} {
  const startMins = timeStringToMinutes(startTime);
  const endMins = timeStringToMinutes(endTime);

  let diffMins = endMins - startMins;
  let isOvernight = false;

  if (diffMins <= 0) {
    // Overnight shift: ends next day
    diffMins = 24 * 60 - startMins + endMins;
    isOvernight = true;
  }

  // Rounded to 1 decimal place
  const durationHours = Math.round((diffMins / 60) * 10) / 10;
  return { durationHours, isOvernight };
}

/**
 * Validates that shifts within the same day do not overlap.
 * Returns an error string if overlap is detected, or null if valid.
 */
export function validateShiftOverlap(shifts: ShiftTimeSlot[]): string | null {
  if (shifts.length <= 1) return null;

  // Convert each shift to [start, end] ranges in minutes
  const ranges = shifts.map((s, idx) => {
    const start = timeStringToMinutes(s.startTime);
    let end = timeStringToMinutes(s.endTime);
    if (end <= start) {
      end += 24 * 60; // spans across midnight
    }
    return { idx, start, end, label: s.name || `شفت ${idx + 1}`, startTime: s.startTime, endTime: s.endTime };
  });

  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const a = ranges[i];
      const b = ranges[j];

      const overlaps = Math.max(a.start, b.start) < Math.min(a.end, b.end);
      if (overlaps) {
        return `تعارض بين (${a.label}: ${a.startTime} إلى ${a.endTime}) و (${b.label}: ${b.startTime} إلى ${b.endTime})`;
      }
    }
  }

  return null;
}

/**
 * Creates a blank/default DaySchedule
 */
export function createDefaultDaySchedule(day: DayOfWeek): DaySchedule {
  const isFriday = day === 'friday';
  return {
    day,
    dayNameAr: DAY_NAMES_AR[day],
    isDayOff: isFriday,
    shifts: isFriday
      ? []
      : [
          {
            id: `shift_${day}_1`,
            name: 'وردية أساسية',
            startTime: '10:00',
            endTime: '22:00',
            durationHours: 12,
            isOvernight: false,
          },
        ],
    totalHours: isFriday ? 0 : 12,
  };
}

/**
 * Creates a brand new full weekly schedule for a captain
 */
export function createDefaultWeeklySchedule(captainId: string, captainName: string, captainPhone?: string): CaptainSchedule {
  const weeklySchedule: Record<DayOfWeek, DaySchedule> = {
    saturday: createDefaultDaySchedule('saturday'),
    sunday: createDefaultDaySchedule('sunday'),
    monday: createDefaultDaySchedule('monday'),
    tuesday: createDefaultDaySchedule('tuesday'),
    wednesday: createDefaultDaySchedule('wednesday'),
    thursday: createDefaultDaySchedule('thursday'),
    friday: createDefaultDaySchedule('friday'),
  };

  const totalWeeklyHours = Object.values(weeklySchedule).reduce(
    (acc, d) => acc + (d.isDayOff ? 0 : d.totalHours),
    0
  );

  return {
    id: captainId,
    captainId,
    captainName,
    captainPhone: captainPhone || '',
    isPaused: false,
    notes: '',
    weeklySchedule,
    totalWeeklyHours,
  };
}

/**
 * Returns previous day of week
 */
export function getPreviousDayOfWeek(day: DayOfWeek): DayOfWeek {
  const idx = DAYS_OF_WEEK.findIndex((d) => d.key === day);
  const prevIdx = (idx - 1 + DAYS_OF_WEEK.length) % DAYS_OF_WEEK.length;
  return DAYS_OF_WEEK[prevIdx].key;
}

/**
 * Returns next day of week
 */
export function getNextDayOfWeek(day: DayOfWeek): DayOfWeek {
  const idx = DAYS_OF_WEEK.findIndex((d) => d.key === day);
  const nextIdx = (idx + 1) % DAYS_OF_WEEK.length;
  return DAYS_OF_WEEK[nextIdx].key;
}

/**
 * Comprehensive status calculator for a captain's schedule
 * Calculates whether the captain is active, off-shift, starting soon, or paused/unscheduled.
 */
export function computeCaptainShiftStatus(
  schedule?: CaptainSchedule | null
): CaptainShiftStatusInfo {
  const cairo = getCairoDateTime();
  const currentMins = cairo.currentMinutes;
  const todayKey = cairo.dayOfWeek;
  const prevDayKey = getPreviousDayOfWeek(todayKey);

  // 1. Unscheduled case
  if (!schedule) {
    return {
      status: 'unscheduled',
      statusLabelAr: 'غير مجدول',
      statusBadgeVariant: 'neutral',
      isEligibleForOrders: false,
      currentShift: null,
      nextShift: null,
      currentShiftEnd: null,
      todayWorkingHours: 0,
      weeklyWorkingHours: 0,
      isPaused: false,
      isDayOffToday: false,
      currentTimeInCairo: cairo.formattedTime,
      message: 'لم يتم إنشاء جدول شفتات عمل لهذا الكابتن بعد',
    };
  }

  // Calculate weekly & today hours
  const weeklyHours = Object.values(schedule.weeklySchedule || {}).reduce((acc, d) => {
    if (d.isDayOff) return acc;
    const dayTotal = (d.shifts || []).reduce((shAcc, s) => shAcc + (s.durationHours || 0), 0);
    return acc + dayTotal;
  }, 0);

  const todaySchedule = schedule.weeklySchedule?.[todayKey];
  const todayWorkingHours = todaySchedule && !todaySchedule.isDayOff
    ? (todaySchedule.shifts || []).reduce((acc, s) => acc + (s.durationHours || 0), 0)
    : 0;

  // 2. Paused schedule case
  if (schedule.isPaused) {
    return {
      status: 'paused',
      statusLabelAr: 'جدول العمل متوقف مؤقتاً',
      statusBadgeVariant: 'neutral',
      isEligibleForOrders: false,
      currentShift: null,
      nextShift: null,
      currentShiftEnd: null,
      todayWorkingHours,
      weeklyWorkingHours: weeklyHours,
      isPaused: true,
      isDayOffToday: Boolean(todaySchedule?.isDayOff),
      currentTimeInCairo: cairo.formattedTime,
      message: 'تم إيقاف جدول عمل الكابتن مؤقتاً بقرار الإدارة',
    };
  }

  // 3. Check if an overnight shift from yesterday is still actively running right now
  const prevDaySchedule = schedule.weeklySchedule?.[prevDayKey];
  if (prevDaySchedule && !prevDaySchedule.isDayOff && prevDaySchedule.shifts?.length) {
    for (const shift of prevDaySchedule.shifts) {
      const startMins = timeStringToMinutes(shift.startTime);
      const endMins = timeStringToMinutes(shift.endTime);

      // It is overnight if endMins <= startMins
      if (endMins <= startMins && currentMins < endMins) {
        // Yes! Current time is after midnight and before the overnight shift ended
        return {
          status: 'active',
          statusLabelAr: 'يعمل ومستعد لاستقبال الطلبات',
          statusBadgeVariant: 'success',
          isEligibleForOrders: true,
          currentShift: shift,
          nextShift: null,
          currentShiftEnd: shift.endTime,
          todayWorkingHours,
          weeklyWorkingHours: weeklyHours,
          isPaused: false,
          isDayOffToday: Boolean(todaySchedule?.isDayOff),
          currentTimeInCairo: cairo.formattedTime,
          message: `شفت ليلي مستمر من يوم أمس (${prevDaySchedule.dayNameAr}) حتى ${formatTimeStringArabic(shift.endTime)}`,
        };
      }
    }
  }

  // 4. Check today's shifts
  let activeShift: ShiftTimeSlot | null = null;
  let startingSoonShift: ShiftTimeSlot | null = null;
  let startingSoonMinutes = Infinity;

  if (todaySchedule && !todaySchedule.isDayOff && todaySchedule.shifts?.length) {
    for (const shift of todaySchedule.shifts) {
      const startMins = timeStringToMinutes(shift.startTime);
      let endMins = timeStringToMinutes(shift.endTime);

      if (endMins <= startMins) {
        // Overnight shift starting today
        if (currentMins >= startMins) {
          activeShift = shift;
          break;
        }
      } else {
        // Normal shift within same day
        if (currentMins >= startMins && currentMins < endMins) {
          activeShift = shift;
          break;
        }
      }

      // Check if starting soon (within 60 minutes)
      if (currentMins < startMins) {
        const diff = startMins - currentMins;
        if (diff <= 60 && diff < startingSoonMinutes) {
          startingSoonShift = shift;
          startingSoonMinutes = diff;
        }
      }
    }
  }

  // If currently in active shift
  if (activeShift) {
    return {
      status: 'active',
      statusLabelAr: 'يعمل ومستعد لاستقبال الطلبات',
      statusBadgeVariant: 'success',
      isEligibleForOrders: true,
      currentShift: activeShift,
      nextShift: null,
      currentShiftEnd: activeShift.endTime,
      todayWorkingHours,
      weeklyWorkingHours: weeklyHours,
      isPaused: false,
      isDayOffToday: false,
      currentTimeInCairo: cairo.formattedTime,
      message: `داخل الشفت حتى ${formatTimeStringArabic(activeShift.endTime)}`,
    };
  }

  // If starting soon
  if (startingSoonShift) {
    return {
      status: 'starting_soon',
      statusLabelAr: 'يبدأ قريباً',
      statusBadgeVariant: 'warning',
      isEligibleForOrders: false,
      currentShift: null,
      nextShift: {
        day: todayKey,
        dayNameAr: todaySchedule?.dayNameAr || DAY_NAMES_AR[todayKey],
        shift: startingSoonShift,
        startsInMinutes: startingSoonMinutes,
        startTimeFormatted: formatTimeStringArabic(startingSoonShift.startTime),
        isToday: true,
      },
      currentShiftEnd: null,
      todayWorkingHours,
      weeklyWorkingHours: weeklyHours,
      isPaused: false,
      isDayOffToday: false,
      currentTimeInCairo: cairo.formattedTime,
      message: `سيبدأ الشفت بعد ${startingSoonMinutes} دقيقة (${formatTimeStringArabic(startingSoonShift.startTime)})`,
    };
  }

  // 5. Look ahead for the next scheduled shift across upcoming days
  let nextShiftFound: NextShiftInfo | null = null;

  // Search remaining of today first
  if (todaySchedule && !todaySchedule.isDayOff && todaySchedule.shifts?.length) {
    for (const shift of todaySchedule.shifts) {
      const startMins = timeStringToMinutes(shift.startTime);
      if (startMins > currentMins) {
        nextShiftFound = {
          day: todayKey,
          dayNameAr: todaySchedule.dayNameAr,
          shift,
          startsInMinutes: startMins - currentMins,
          startTimeFormatted: formatTimeStringArabic(shift.startTime),
          isToday: true,
        };
        break;
      }
    }
  }

  // If not today, check upcoming days in order
  if (!nextShiftFound) {
    let checkDay = getNextDayOfWeek(todayKey);
    let daysAhead = 1;

    while (daysAhead <= 7) {
      const daySched = schedule.weeklySchedule?.[checkDay];
      if (daySched && !daySched.isDayOff && daySched.shifts?.length) {
        // First shift of that day
        const firstShift = daySched.shifts[0];
        const startMins = timeStringToMinutes(firstShift.startTime);
        const totalMinutesWait = (daysAhead * 24 * 60) - currentMins + startMins;

        nextShiftFound = {
          day: checkDay,
          dayNameAr: daySched.dayNameAr,
          shift: firstShift,
          startsInMinutes: totalMinutesWait,
          startTimeFormatted: formatTimeStringArabic(firstShift.startTime),
          isToday: false,
        };
        break;
      }
      checkDay = getNextDayOfWeek(checkDay);
      daysAhead++;
    }
  }

  // 6. Off-shift
  const isDayOffToday = Boolean(todaySchedule?.isDayOff);
  const statusMsg = isDayOffToday
    ? 'اليوم إجازة رسمية للكابتن'
    : 'الكابتن حالياً خارج ساعات العمل المحددة';

  return {
    status: 'off_shift',
    statusLabelAr: isDayOffToday ? 'إجازة اليوم' : 'خارج ساعات العمل',
    statusBadgeVariant: 'danger',
    isEligibleForOrders: false,
    currentShift: null,
    nextShift: nextShiftFound,
    currentShiftEnd: null,
    todayWorkingHours,
    weeklyWorkingHours: weeklyHours,
    isPaused: false,
    isDayOffToday,
    currentTimeInCairo: cairo.formattedTime,
    message: statusMsg,
  };
}
