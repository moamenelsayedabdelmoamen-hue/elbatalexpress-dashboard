import React from 'react';
import { ShiftWorkStatus } from '../../types';
import { CheckCircle2, Clock, AlertOctagon, PauseCircle, HelpCircle } from 'lucide-react';

interface ShiftStatusBadgeProps {
  status: ShiftWorkStatus;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  customLabel?: string;
}

export const ShiftStatusBadge: React.FC<ShiftStatusBadgeProps> = ({
  status,
  showIcon = true,
  size = 'md',
  className = '',
  customLabel,
}) => {
  let badgeStyle = '';
  let dotStyle = '';
  let Icon = CheckCircle2;
  let defaultLabel = '';

  switch (status) {
    case 'active':
      badgeStyle = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      dotStyle = 'bg-emerald-400';
      Icon = CheckCircle2;
      defaultLabel = 'يعمل ومستعد لاستقبال الطلبات';
      break;

    case 'starting_soon':
      badgeStyle = 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      dotStyle = 'bg-amber-400';
      Icon = Clock;
      defaultLabel = 'يبدأ العمل قريباً';
      break;

    case 'off_shift':
      badgeStyle = 'bg-rose-500/15 text-rose-400 border-rose-500/30';
      dotStyle = 'bg-rose-400';
      Icon = AlertOctagon;
      defaultLabel = 'خارج ساعات العمل';
      break;

    case 'paused':
      badgeStyle = 'bg-zinc-800 text-zinc-400 border-zinc-700';
      dotStyle = 'bg-zinc-400';
      Icon = PauseCircle;
      defaultLabel = 'الجدول متوقف مؤقتاً';
      break;

    case 'unscheduled':
    default:
      badgeStyle = 'bg-zinc-800 text-zinc-400 border-zinc-700';
      dotStyle = 'bg-zinc-500';
      Icon = HelpCircle;
      defaultLabel = 'غير مجدول';
      break;
  }

  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
    lg: 'text-sm px-3.5 py-1.5 gap-2 font-bold',
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
    lg: 'w-4 h-4',
  };

  return (
    <span
      className={`inline-flex items-center font-bold rounded-xl border select-none transition-all ${sizeClasses[size]} ${badgeStyle} ${className}`}
    >
      {status === 'active' && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
      )}
      {status !== 'active' && showIcon && (
        <Icon className={`${iconSizes[size]} shrink-0`} />
      )}
      <span>{customLabel || defaultLabel}</span>
    </span>
  );
};
