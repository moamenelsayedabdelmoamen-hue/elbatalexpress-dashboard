import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  BellRing,
  ShoppingBag,
  AlertTriangle,
  CheckCheck,
  Trash2,
  Volume2,
  VolumeX,
  Radio,
  X,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';
import { AdminNotification } from '../../types';

export const NotificationCenter: React.FC = () => {
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    fcmPermission,
    soundEnabled,
    enableFcmPush,
    toggleSound,
    sendTestNotification,
    markAsRead,
    markAllAsRead,
    clearAll,
  } = useNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'new_order' | 'captain_assignment_failed'>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredList = notifications.filter((n) => {
    if (activeTab === 'all') return true;
    return n.type === activeTab;
  });

  const formatTimeAgo = (iso: string) => {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const handleOpenNotificationOrder = (notif: AdminNotification) => {
    markAsRead(notif.id);
    setIsOpen(false);
    if (notif.restaurantName && notif.restaurantName !== 'نظام البطل إكسبريس') {
      navigate(`/orders?restaurant=${encodeURIComponent(notif.restaurantName)}`);
    } else {
      navigate('/orders');
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`relative p-2.5 rounded-xl border transition-all cursor-pointer ${
          unreadCount > 0
            ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 hover:bg-amber-500/25'
            : 'bg-zinc-900/80 border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800'
        }`}
        title="إشعارات النظام الفورية (Firebase Cloud Messaging)"
      >
        {unreadCount > 0 ? (
          <BellRing className="w-5 h-5 animate-bounce" />
        ) : (
          <Bell className="w-5 h-5" />
        )}

        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center shadow-lg">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="fixed sm:absolute left-3 right-3 sm:right-auto sm:left-0 mt-2.5 sm:w-[410px] bg-[#11141c] border border-zinc-800 rounded-3xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-zinc-800/90 bg-[#0c0f16] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white">مركز الإشعارات الفورية (FCM)</h3>
                <p className="text-[11px] text-zinc-400">
                  تنبيهات الطلبات الجديدة وتعثر تعيين الكباتن
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleSound}
                className={`p-1.5 rounded-lg border text-xs transition-colors ${
                  soundEnabled
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-500'
                }`}
                title={soundEnabled ? 'الصوت مفعل (اضغط للكتم)' : 'الصوت مكتوم (اضغط للتفعيل)'}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={sendTestNotification}
                className="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[10px] font-bold transition-colors"
                title="إرسال إشعار تجريبي للتأكد من عمل التنبيهات"
              >
                تجربة
              </button>
            </div>
          </div>

          {/* FCM Push Permission Banner */}
          <div className="px-4 py-2.5 bg-zinc-900/70 border-b border-zinc-800/80 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <Radio
                className={`w-3.5 h-3.5 ${
                  fcmPermission === 'granted' ? 'text-emerald-400 animate-pulse' : 'text-amber-400'
                }`}
              />
              <span className="text-[11px] font-bold text-zinc-300">
                {fcmPermission === 'granted'
                  ? 'إشعارات Firebase Cloud Messaging مفعلة ومتصلة'
                  : 'فعّل إشعارات المتصفح لاستقبال تنبيهات FCM بالخلفية'}
              </span>
            </div>

            {fcmPermission !== 'granted' && fcmPermission !== 'unsupported' && (
              <button
                type="button"
                onClick={enableFcmPush}
                className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-[11px] shrink-0 transition-colors cursor-pointer"
              >
                تفعيل FCM
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="px-3 pt-2.5 pb-2 border-b border-zinc-800/80 flex items-center justify-between gap-1 text-[11px]">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                  activeTab === 'all'
                    ? 'bg-amber-500 text-zinc-950'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                الكل ({notifications.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('new_order')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                  activeTab === 'new_order'
                    ? 'bg-emerald-500 text-zinc-950'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                طلبات جديدة ({notifications.filter((n) => n.type === 'new_order').length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('captain_assignment_failed')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                  activeTab === 'captain_assignment_failed'
                    ? 'bg-rose-500 text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                تعثر كابتن ({notifications.filter((n) => n.type === 'captain_assignment_failed').length})
              </button>
            </div>

            {notifications.length > 0 && (
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllAsRead}
                    className="p-1 text-zinc-400 hover:text-emerald-400"
                    title="تحديد الكل كمقروء"
                  >
                    <CheckCheck className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={clearAll}
                  className="p-1 text-zinc-400 hover:text-rose-400"
                  title="مسح كافة الإشعارات"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-[360px] overflow-y-auto divide-y divide-zinc-800/60">
            {filteredList.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-xs font-bold text-zinc-400">لا توجد تنبيهات في هذا القسم حالياً</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  ستظهر هنا إشعارات الطلبات الجديدة أو تعثر تعيين الكباتن فوراً
                </p>
              </div>
            ) : (
              filteredList.map((notif) => {
                const isFailed = notif.type === 'captain_assignment_failed';
                return (
                  <div
                    key={notif.id}
                    onClick={() => handleOpenNotificationOrder(notif)}
                    className={`p-3.5 transition-colors cursor-pointer flex items-start gap-3 ${
                      !notif.isRead
                        ? isFailed
                          ? 'bg-rose-500/10 hover:bg-rose-500/15'
                          : 'bg-amber-500/5 hover:bg-zinc-900/80'
                        : 'hover:bg-zinc-900/50 opacity-80'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                        isFailed
                          ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                          : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                      }`}
                    >
                      {isFailed ? (
                        <AlertTriangle className="w-4 h-4" />
                      ) : (
                        <ShoppingBag className="w-4 h-4" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-xs font-black truncate ${
                            isFailed ? 'text-rose-300' : 'text-zinc-100'
                          }`}
                        >
                          {notif.title}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                          {formatTimeAgo(notif.createdAt)}
                        </span>
                      </div>

                      <p className="text-[11px] text-zinc-300 mt-1 leading-relaxed">{notif.body}</p>

                      <div className="mt-2 flex items-center justify-between">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            isFailed
                              ? 'bg-rose-500/20 text-rose-300'
                              : 'bg-emerald-500/20 text-emerald-300'
                          }`}
                        >
                          {isFailed ? 'تعثر تعيين كابتن' : 'طلب جديد'}
                        </span>

                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:underline">
                          <span>متابعة الطلب</span>
                          <ArrowLeft className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * In-Dashboard Live Alert Banner displayed at the top of the dashboard
 * whenever a new order arrives or captain assignment fails.
 */
export const InDashboardAlertBanner: React.FC = () => {
  const navigate = useNavigate();
  const { activeBannerAlert, markAsRead, dismissBanner } = useNotifications();

  if (!activeBannerAlert) return null;

  const isFailed = activeBannerAlert.type === 'captain_assignment_failed';

  return (
    <div className="px-4 sm:px-6 lg:px-8 pt-3 max-w-7xl w-full mx-auto">
      <div
        className={`rounded-2xl p-3.5 sm:p-4 border shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
          isFailed
            ? 'bg-gradient-to-r from-rose-950/90 via-[#1a1118] to-[#11141c] border-rose-500/50 text-rose-100'
            : 'bg-gradient-to-r from-emerald-950/90 via-[#101c1a] to-[#11141c] border-emerald-500/50 text-emerald-100'
        }`}
      >
        <div className="flex items-start sm:items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              isFailed
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
            }`}
          >
            {isFailed ? (
              <AlertTriangle className="w-5 h-5 animate-pulse" />
            ) : (
              <Sparkles className="w-5 h-5 animate-pulse" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                  isFailed ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-zinc-950'
                }`}
              >
                {isFailed ? 'تنبيه عاجل • تعثر تعيين كابتن' : 'إشعار فوري • طلب جديد'}
              </span>
              <h4 className="text-xs sm:text-sm font-black text-white">{activeBannerAlert.title}</h4>
            </div>
            <p className="text-xs text-zinc-300 mt-0.5">{activeBannerAlert.body}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              markAsRead(activeBannerAlert.id);
              navigate('/orders');
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-colors cursor-pointer ${
              isFailed
                ? 'bg-rose-500 hover:bg-rose-400 text-white'
                : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950'
            }`}
          >
            {isFailed ? 'تعيين كابتن للطلب الآن' : 'عرض الطلب الجديد'}
          </button>

          <button
            type="button"
            onClick={dismissBanner}
            className="p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700/60 transition-colors cursor-pointer"
            title="إغلاق التنبيه"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
