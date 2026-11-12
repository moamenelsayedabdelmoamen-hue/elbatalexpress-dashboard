import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import {
  ShoppingBag,
  Search,
  RefreshCw,
  Eye,
  X,
  Clock,
  UtensilsCrossed,
  Bike,
  Send,
  Calendar,
  History,
  ArrowRight,
  FileSpreadsheet,
  Compass,
  Timer,
  CheckCircle2,
  MapPin,
  PackageCheck,
  Navigation,
} from 'lucide-react';
import { Order, OrderStatus, Captain, Restaurant } from '../types';
import { OrderService, formatDurationArabic } from '../services/orderService';
import { CaptainService } from '../services/captainService';
import { RestaurantService } from '../services/restaurantService';
import { ShiftService } from '../services/shiftService';
import { extractCoordinates, haversineDistanceKm, formatDistanceArabic } from '../utils/geoUtils';
import { StatusBadge } from '../components/common/StatusBadge';
import { EmptyState } from '../components/common/EmptyState';
import { useToast } from '../contexts/ToastContext';
import { useNotifications } from '../contexts/NotificationContext';
import { SendOrderModal } from '../components/orders/SendOrderModal';
import { ExportButton } from '../components/common/ExportButton';
import { exportOrders } from '../utils/exportUtils';

const ORDER_STATUSES: OrderStatus[] = [
  'New',
  'Accepted',
  'Preparing',
  'Ready',
  'Picked Up',
  'Delivered',
  'Cancelled',
];

function parseOrderDateString(createdAt: any): string {
  if (!createdAt) return '';
  try {
    if (typeof createdAt === 'string') {
      const match = createdAt.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        return `${match[1]}-${match[2]}-${match[3]}`;
      }
      const slashMatch = createdAt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (slashMatch) {
        const d = slashMatch[1].padStart(2, '0');
        const m = slashMatch[2].padStart(2, '0');
        const y = slashMatch[3];
        return `${y}-${m}-${d}`;
      }
    }

    let d: Date;
    if (typeof createdAt === 'object' && typeof createdAt.toDate === 'function') {
      d = createdAt.toDate();
    } else if (typeof createdAt === 'number') {
      const ms = createdAt < 10000000000 ? createdAt * 1000 : createdAt;
      d = new Date(ms);
    } else if (typeof createdAt === 'string') {
      d = new Date(createdAt);
    } else if (createdAt instanceof Date) {
      d = createdAt;
    } else {
      return '';
    }
    if (isNaN(d.getTime())) return '';

    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return '';
  }
}

function getTodayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatTimeDisplay(val: any): string {
  if (!val) return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '—';
  }
}

function formatDateTimeDisplay(val: any): string {
  if (!val) return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleString('ar-EG', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '—';
  }
}

export const OrdersPage: React.FC = () => {
  const navigate = useNavigate();
  const { restaurantId } = useParams<{ restaurantId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const restaurantParam = searchParams.get('restaurant') || restaurantId || '';

  const { success, error: toastError } = useToast();
  const { notifyCaptainAssignmentFailed } = useNotifications();

  const [orders, setOrders] = useState<Order[]>([]);
  const [captains, setCaptains] = useState<Captain[]>([]);
  const [merchants, setMerchants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchingOrderId, setSearchingOrderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedRestaurant, setSelectedRestaurant] = useState<string>(restaurantParam || 'all');

  const [dateMode, setDateMode] = useState<'today' | 'history' | 'all'>(
    restaurantParam ? 'all' : 'today'
  );
  const [historyDate, setHistoryDate] = useState<string>(getTodayString());

  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);

  const todayStr = useMemo(() => getTodayString(), []);

  useEffect(() => {
    if (restaurantParam) {
      setSelectedRestaurant(restaurantParam);
      setDateMode('all');
    }
  }, [restaurantParam]);

  useEffect(() => {
    if (restaurantParam && orders.length > 0) {
      const match = orders.find(
        (o) =>
          (o.restaurantId && o.restaurantId.toLowerCase() === restaurantParam.toLowerCase()) ||
          (o.restaurantName && o.restaurantName.toLowerCase() === restaurantParam.toLowerCase())
      );
      if (match && match.restaurantName) {
        setSelectedRestaurant(match.restaurantName);
      }
    }
  }, [restaurantParam, orders]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const [resOrders, resCaptains, resMerchants] = await Promise.all([
        OrderService.getAll(),
        CaptainService.getAll(),
        RestaurantService.getAll(),
      ]);
      setOrders(resOrders.data);
      setCaptains(resCaptains.data);
      setMerchants(resMerchants.data);
    } catch (err) {
      console.error('Failed to load orders, captains, or merchants:', err);
      toastError('فشل تحميل بيانات الطلبات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const dateScopedOrders = useMemo(() => {
    return orders.filter((o) => {
      if (selectedRestaurant !== 'all') {
        const oName = (o.restaurantName || '').trim().toLowerCase();
        const oId = (o.restaurantId || '').trim().toLowerCase();
        const sel = selectedRestaurant.trim().toLowerCase();
        if (oName !== sel && oId !== sel) return false;
      }

      const orderDateStr = parseOrderDateString(o.createdAt);
      if (dateMode === 'today') {
        return orderDateStr === todayStr;
      } else if (dateMode === 'history') {
        return historyDate ? orderDateStr === historyDate : true;
      }
      return true;
    });
  }, [orders, dateMode, historyDate, todayStr, selectedRestaurant]);

  const metrics = useMemo(() => {
    const total = dateScopedOrders.length;
    const inProgress = dateScopedOrders.filter((o) =>
      ['New', 'Accepted', 'Preparing', 'Ready', 'Picked Up'].includes(o.status)
    ).length;
    const delivered = dateScopedOrders.filter((o) => o.status === 'Delivered').length;
    const cancelled = dateScopedOrders.filter((o) => o.status === 'Cancelled').length;
    return { total, inProgress, delivered, cancelled };
  }, [dateScopedOrders]);

  const todayOrdersTotalCount = useMemo(() => {
    return orders.filter((o) => {
      if (selectedRestaurant !== 'all') {
        const oName = (o.restaurantName || '').trim().toLowerCase();
        const oId = (o.restaurantId || '').trim().toLowerCase();
        const sel = selectedRestaurant.trim().toLowerCase();
        if (oName !== sel && oId !== sel) return false;
      }
      return parseOrderDateString(o.createdAt) === todayStr;
    }).length;
  }, [orders, todayStr, selectedRestaurant]);

  const uniqueRestaurants = useMemo(() => {
    const map = new Map<string, string>();
    orders.forEach((o) => {
      if (o.restaurantName) {
        const name = o.restaurantName.trim();
        map.set(name, name);
      }
    });
    return Array.from(map.values()).sort();
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return dateScopedOrders.filter((o) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        o.orderNumber.toLowerCase().includes(q) ||
        (o.restaurantName && o.restaurantName.toLowerCase().includes(q)) ||
        (o.captainName && o.captainName.toLowerCase().includes(q)) ||
        (o.customerName && o.customerName.toLowerCase().includes(q)) ||
        (o.deliveryAddress && o.deliveryAddress.toLowerCase().includes(q));

      const matchesStatus = statusFilter === 'all' ? true : o.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [dateScopedOrders, searchQuery, statusFilter]);

  const handleUpdateStatus = async (orderId: string, newStatus: OrderStatus) => {
    try {
      const stageUpdates = await OrderService.updateStatus(orderId, newStatus);
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, ...stageUpdates } : o))
      );
      if (viewingOrder && viewingOrder.id === orderId) {
        setViewingOrder((prev) => (prev ? { ...prev, ...stageUpdates } : null));
      }
      success(`تم تحديث حالة الطلب إلى "${newStatus}" وتسجيل التوقيت`);
    } catch (err) {
      toastError('فشل تحديث حالة الطلب');
    }
  };

  const handleStampStageTime = async (
    order: Order,
    field: 'acceptedAt' | 'arrivedAtMerchantAt' | 'pickedUpAt' | 'deliveredAt',
    labelAr: string
  ) => {
    try {
      const stampedIso = await OrderService.recordStageTimestamp(order.id, field);
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, [field]: stampedIso } : o))
      );
      if (viewingOrder && viewingOrder.id === order.id) {
        setViewingOrder((prev) => (prev ? { ...prev, [field]: stampedIso } : null));
      }
      success(`تم تسجيل ${labelAr} بنجاح`);
    } catch {
      toastError(`فشل تسجيل ${labelAr}`);
    }
  };

  const handleAssignCaptain = async (
    orderId: string,
    captainId: string,
    extra?: {
      searchDurationSeconds?: number;
      searchDurationText?: string;
      distanceToMerchantKm?: number;
      skipShiftCheck?: boolean;
    }
  ) => {
    if (!captainId) return;
    const captain = captains.find((c) => c.id === captainId);
    const captainName = captain?.name || 'كابتن معتمد';
    const targetOrder = orders.find((o) => o.id === orderId);

    if (captain && captain.canReceiveOrders === false) {
      const reason = `الكابتن "${captainName}" موقوف عن استقبال الطلبات حالياً.`;
      toastError(reason);
      await notifyCaptainAssignmentFailed({
        orderId,
        orderNumber: targetOrder?.orderNumber || orderId,
        restaurantName: targetOrder?.restaurantName || 'تاجر',
        reason,
      });
      return;
    }

    if (!extra?.skipShiftCheck) {
      const eligibility = await ShiftService.verifyCaptainOrderEligibility(captainId);
      if (!eligibility.isEligible) {
        const reason =
          eligibility.reason ||
          'الكابتن المحدد خارج ساعات العمل المحددة له في الشفت، ولا يمكن إسناد طلبات جديدة إليه.';
        toastError(reason);
        await notifyCaptainAssignmentFailed({
          orderId,
          orderNumber: targetOrder?.orderNumber || orderId,
          restaurantName: targetOrder?.restaurantName || 'تاجر',
          reason,
        });
        return;
      }
    }

    try {
      const result = await OrderService.assignCaptain(orderId, captainId, captainName, extra);
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                captainId,
                captainName,
                status: o.status === 'New' ? 'Accepted' : o.status,
                acceptedAt: result.acceptedAt,
                assignedAt: result.acceptedAt,
                captainSearchDuration: result.captainSearchDuration,
                captainSearchSeconds: result.captainSearchSeconds,
                distanceToMerchantKm: result.distanceToMerchantKm,
              }
            : o
        )
      );
      if (viewingOrder && viewingOrder.id === orderId) {
        setViewingOrder((prev) =>
          prev
            ? {
                ...prev,
                captainId,
                captainName,
                status: prev.status === 'New' ? 'Accepted' : prev.status,
                acceptedAt: result.acceptedAt,
                assignedAt: result.acceptedAt,
                captainSearchDuration: result.captainSearchDuration,
                captainSearchSeconds: result.captainSearchSeconds,
                distanceToMerchantKm: result.distanceToMerchantKm,
              }
            : null
        );
      }
      success(`تم تعيين الكابتن "${captainName}" للطلب بنجاح!`);
    } catch (err) {
      toastError('فشل تعيين الكابتن للطلب في قاعدة البيانات');
    }
  };

  /**
   * "ابحث عن كابتن": Searches for the nearest eligible captain to the merchant and assigns the order automatically.
   */
  const handleSearchAndAssignNearestCaptain = async (order: Order) => {
    const searchStartMs = Date.now();
    setSearchingOrderId(order.id);

    try {
      // 1. Find the merchant for this order to get its coordinates
      const merchant = merchants.find(
        (m) =>
          (order.restaurantId && m.id === order.restaurantId) ||
          (order.restaurantName &&
            m.name.trim().toLowerCase() === order.restaurantName.trim().toLowerCase())
      );

      const merchantCoords =
        merchant?.coords ||
        extractCoordinates(merchant?.raw) ||
        extractCoordinates(order.raw?.restaurant) ||
        extractCoordinates(order.raw);

      // 2. Filter captains who have order reception enabled
      const receptionEnabledCaptains = captains.filter((c) => c.canReceiveOrders !== false);

      if (receptionEnabledCaptains.length === 0) {
        const reason = 'لا يوجد أي كابتن مفعل لاستقبال الطلبات حالياً';
        toastError(reason);
        await notifyCaptainAssignmentFailed({
          orderId: order.id,
          orderNumber: order.orderNumber,
          restaurantName: order.restaurantName,
          reason,
        });
        return;
      }

      // 3. Check shift eligibility & online status
      const shiftEligibleCaptains: Captain[] = [];
      for (const cap of receptionEnabledCaptains) {
        const check = await ShiftService.verifyCaptainOrderEligibility(cap.id);
        if (check.isEligible) {
          shiftEligibleCaptains.push(cap);
        }
      }

      // Candidate pool: prefer captains in active shift; otherwise online/available captains
      let candidatePool =
        shiftEligibleCaptains.length > 0
          ? shiftEligibleCaptains
          : receptionEnabledCaptains.filter((c) => c.status === 'online' || c.status === 'available');

      if (candidatePool.length === 0) {
        candidatePool = receptionEnabledCaptains;
      }

      // 4. Rank candidates by distance to merchant (if coordinates available), then online status & lowest load
      const rankedCandidates = candidatePool.map((cap) => {
        const capCoords = cap.coords || extractCoordinates(cap.raw);
        let distanceKm: number | undefined;
        if (merchantCoords && capCoords) {
          distanceKm = haversineDistanceKm(
            merchantCoords.lat,
            merchantCoords.lng,
            capCoords.lat,
            capCoords.lng
          );
        }
        return {
          captain: cap,
          distanceKm,
          isOnline: cap.status === 'online' || cap.status === 'available',
        };
      });

      rankedCandidates.sort((a, b) => {
        // Both have GPS distance to merchant -> nearest first
        if (a.distanceKm !== undefined && b.distanceKm !== undefined) {
          return a.distanceKm - b.distanceKm;
        }
        if (a.distanceKm !== undefined) return -1;
        if (b.distanceKm !== undefined) return 1;
        // Fallback: online first, then fewer orders
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
        return (a.captain.ordersCount || 0) - (b.captain.ordersCount || 0);
      });

      const bestMatch = rankedCandidates[0];
      if (!bestMatch) {
        const reason = 'لم يتم العثور على أي كابتن متاح قريب من التاجر لتعيين الطلب';
        toastError(reason);
        await notifyCaptainAssignmentFailed({
          orderId: order.id,
          orderNumber: order.orderNumber,
          restaurantName: order.restaurantName,
          reason,
        });
        return;
      }

      // 5. Compute how long the system took to find a captain
      const elapsedSearchSecs = Math.max(1, Math.round((Date.now() - searchStartMs) / 1000));
      let totalWaitSeconds = elapsedSearchSecs;
      if (order.createdAt) {
        const createdMs = new Date(order.createdAt).getTime();
        if (!isNaN(createdMs) && Date.now() > createdMs) {
          totalWaitSeconds = Math.max(elapsedSearchSecs, Math.round((Date.now() - createdMs) / 1000));
        }
      }
      const searchDurationText = formatDurationArabic(totalWaitSeconds);

      await handleAssignCaptain(order.id, bestMatch.captain.id, {
        searchDurationSeconds: totalWaitSeconds,
        searchDurationText,
        distanceToMerchantKm: bestMatch.distanceKm,
        skipShiftCheck: shiftEligibleCaptains.length === 0,
      });

      const distMsg =
        bestMatch.distanceKm !== undefined
          ? ` (المسافة للتاجر: ${formatDistanceArabic(bestMatch.distanceKm)})`
          : '';
      success(
        `تم العثور على أقرب كابتن "${bestMatch.captain.name}"${distMsg} وإسناد الطلب له خلال ${searchDurationText}`
      );
    } catch (err) {
      toastError('حدث خطأ أثناء البحث عن أقرب كابتن للتاجر');
    } finally {
      setSearchingOrderId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white">إدارة حركة وتدفق الطلبات</h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
            متابعة الطلبات، البحث الذكي عن أقرب كابتن للتاجر، وتوقيتات الإنشاء والقبول والوصول والاستلام والتسليم
          </p>
        </div>

        <div className="flex items-center gap-3">
          <ExportButton
            onExportExcel={() => exportOrders(filteredOrders, 'xlsx')}
            onExportCsv={() => exportOrders(filteredOrders, 'csv')}
            label="تصدير الطلبات"
            count={filteredOrders.length}
          />

          <button
            onClick={() => navigate('/sheets')}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs sm:text-sm font-bold transition-colors cursor-pointer"
            title="صفحة جداول البيانات والتصدير الشامل"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">جداول البيانات</span>
          </button>

          <button
            onClick={() => setIsSendModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 text-xs sm:text-sm font-bold transition-colors cursor-pointer"
          >
            <Send className="w-4 h-4 -rotate-45 text-zinc-400" />
            <span>إرسال طلب لكابتن</span>
          </button>

          <button
            onClick={fetchOrders}
            className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
            title="تحديث الطلبات"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Merchant Focus Banner when a merchant is selected */}
      {selectedRestaurant !== 'all' && (
        <div className="bg-gradient-to-r from-amber-500/15 via-[#161a25] to-[#11141c] border border-amber-500/30 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center font-bold shrink-0 shadow-inner">
              <UtensilsCrossed className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-amber-400/80">عرض طلبات التاجر:</span>
                <h2 className="text-lg sm:text-xl font-black text-white">{selectedRestaurant}</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-mono font-bold">
                  {filteredOrders.length} طلب مسجل
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                عرض كافة الطلبات المسجلة في قاعدة البيانات للتاجر {selectedRestaurant}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => navigate('/restaurants')}
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>العودة لإدارة التجار</span>
            </button>
            <button
              onClick={() => {
                setSearchParams({});
                setSelectedRestaurant('all');
                setDateMode('today');
              }}
              className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 hover:text-amber-200 border border-amber-500/40 text-xs font-bold transition-all cursor-pointer"
            >
              <span>عرض كافة التجار</span>
            </button>
          </div>
        </div>
      )}

      {/* Date Filter Selection: Today's Orders vs Orders History */}
      <div className="bg-gradient-to-r from-[#121624] via-[#10131d] to-[#0c0f17] border border-zinc-800/90 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDateMode('today')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                dateMode === 'today'
                  ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20'
                  : 'bg-zinc-900/80 text-zinc-300 hover:text-white hover:bg-zinc-800 border border-zinc-800'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>طلبات اليوم</span>
              <span
                className={`text-[11px] px-2 py-0.2 rounded-full font-extrabold ${
                  dateMode === 'today' ? 'bg-zinc-950/20 text-zinc-950' : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {todayOrdersTotalCount}
              </span>
            </button>

            <button
              onClick={() => setDateMode('history')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                dateMode === 'history'
                  ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20'
                  : 'bg-zinc-900/80 text-zinc-300 hover:text-white hover:bg-zinc-800 border border-zinc-800'
              }`}
            >
              <History className="w-4 h-4" />
              <span>سجل الطلبات باليوم</span>
            </button>

            <button
              onClick={() => setDateMode('all')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                dateMode === 'all'
                  ? 'bg-zinc-700 text-white'
                  : 'bg-zinc-900/40 text-zinc-400 hover:text-zinc-200 border border-zinc-800/60'
              }`}
            >
              <span>كافة الطلبات ({orders.length})</span>
            </button>
          </div>

          {dateMode === 'history' && (
            <div className="flex items-center gap-2 animate-fadeIn">
              <label className="text-xs font-bold text-amber-400 flex items-center gap-1.5 shrink-0">
                <Calendar className="w-4 h-4" />
                <span>اختر اليوم:</span>
              </label>
              <input
                type="date"
                value={historyDate}
                onChange={(e) => setHistoryDate(e.target.value)}
                className="bg-zinc-900 border border-amber-500/40 focus:border-amber-400 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:outline-hidden cursor-pointer"
              />
              <button
                type="button"
                onClick={() => setHistoryDate(todayStr)}
                className="text-[11px] px-2 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                title="الرجوع لتاريخ اليوم"
              >
                اليوم
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Orders Quick Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-[#11141c] border border-zinc-800/80">
          <span className="text-xs font-bold text-zinc-400 block mb-1">
            إجمالي الطلبات{' '}
            {selectedRestaurant !== 'all'
              ? `(${selectedRestaurant})`
              : dateMode === 'today'
              ? '(اليوم)'
              : dateMode === 'history'
              ? '(اليوم المختار)'
              : '(الكل)'}
          </span>
          <span className="text-xl sm:text-2xl font-black text-white font-['Outfit',sans-serif]">
            {metrics.total}
          </span>
        </div>
        <div className="p-4 rounded-2xl bg-[#11141c] border border-zinc-800/80">
          <span className="text-xs font-bold text-amber-400 block mb-1">قيد المعالجة والتوصيل</span>
          <span className="text-xl sm:text-2xl font-black text-amber-400 font-['Outfit',sans-serif]">
            {metrics.inProgress}
          </span>
        </div>
        <div className="p-4 rounded-2xl bg-[#11141c] border border-zinc-800/80">
          <span className="text-xs font-bold text-emerald-400 block mb-1">المكتملة (Delivered)</span>
          <span className="text-xl sm:text-2xl font-black text-emerald-400 font-['Outfit',sans-serif]">
            {metrics.delivered}
          </span>
        </div>
        <div className="p-4 rounded-2xl bg-[#11141c] border border-zinc-800/80">
          <span className="text-xs font-bold text-rose-400 block mb-1">الملغاة (Cancelled)</span>
          <span className="text-xl sm:text-2xl font-black text-rose-400 font-['Outfit',sans-serif]">
            {metrics.cancelled}
          </span>
        </div>
      </div>

      {/* Search & Status Filters */}
      <div className="bg-[#11141c] border border-zinc-800/90 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3 justify-between items-stretch md:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-zinc-400 absolute right-3.5 top-3.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="البحث برقم الطلب، التاجر، أو الكابتن..."
              className="w-full bg-[#0a0c12] border border-zinc-800 text-zinc-100 placeholder-zinc-500 rounded-xl py-2.5 pr-10 pl-4 text-xs sm:text-sm focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedRestaurant}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedRestaurant(val);
                if (val !== 'all') {
                  setSearchParams({ restaurant: val });
                  setDateMode('all');
                } else {
                  setSearchParams({});
                }
              }}
              className="bg-[#0a0c12] border border-zinc-800 text-zinc-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
            >
              <option value="all">كل التجار</option>
              {uniqueRestaurants.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 7 lifecycle status tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition-colors ${
              statusFilter === 'all'
                ? 'bg-amber-500 text-zinc-950'
                : 'bg-[#0a0c12] text-zinc-400 hover:text-zinc-200 border border-zinc-800/80'
            }`}
          >
            الكل ({dateScopedOrders.length})
          </button>
          {ORDER_STATUSES.map((st) => {
            const count = dateScopedOrders.filter((o) => o.status === st).length;
            const isSelected = statusFilter === st;
            return (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition-colors ${
                  isSelected
                    ? 'bg-amber-500 text-zinc-950'
                    : 'bg-[#0a0c12] text-zinc-400 hover:text-zinc-200 border border-zinc-800/80'
                }`}
              >
                {st} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-[#11141c] border border-zinc-800/90 rounded-3xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-3 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-xs font-semibold">جاري جلب الطلبات من قاعدة البيانات...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="لم يتم العثور على طلبات"
              description="لا توجد طلبات مسجلة تطابق الفلتر الحالي."
              icon={ShoppingBag}
              actionText="عرض كافة الطلبات"
              onAction={() => {
                setSearchParams({});
                setSelectedRestaurant('all');
                setDateMode('all');
                setSearchQuery('');
                setStatusFilter('all');
              }}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-xs font-bold text-zinc-400 bg-zinc-950/40 whitespace-nowrap">
                  <th className="py-4 px-3.5">رقم الطلب</th>
                  <th className="py-4 px-3.5">التاجر</th>
                  <th className="py-4 px-3.5">الكابتن / ابحث عن كابتن</th>
                  <th className="py-4 px-3.5">رسوم التوصيل</th>
                  <th className="py-4 px-3.5">توقيت إنشاء الطلب</th>
                  <th className="py-4 px-3.5">مدة البحث عن كابتن</th>
                  <th className="py-4 px-3.5">وقت قبول الكابتن</th>
                  <th className="py-4 px-3.5">وقت وصول الكابتن للتاجر</th>
                  <th className="py-4 px-3.5">وقت استلام الطلب من التاجر</th>
                  <th className="py-4 px-3.5">وقت تسليم الطلب للعميل</th>
                  <th className="py-4 px-3.5">الحالة</th>
                  <th className="py-4 px-3.5 text-left">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredOrders.map((order) => {
                  const isSearching = searchingOrderId === order.id;

                  return (
                    <tr key={order.id} className="hover:bg-zinc-900/40 transition-colors">
                      {/* رقم الطلب */}
                      <td className="py-4 px-3.5 font-mono font-bold text-amber-400 text-xs whitespace-nowrap">
                        {order.orderNumber}
                      </td>

                      {/* التاجر */}
                      <td className="py-4 px-3.5 font-bold text-zinc-200 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <UtensilsCrossed className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                          <span>{order.restaurantName}</span>
                        </div>
                      </td>

                      {/* الكابتن + خاصية ابحث عن كابتن */}
                      <td className="py-4 px-3.5 text-xs text-zinc-300">
                        <div className="flex flex-col gap-1.5 min-w-[210px]">
                          {order.captainName ? (
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Bike className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                <span className="font-extrabold text-zinc-100 truncate">
                                  {order.captainName}
                                </span>
                                {order.distanceToMerchantKm !== undefined && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-mono">
                                    {formatDistanceArabic(order.distanceToMerchantKm)}
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : null}

                          <div className="flex items-center gap-1.5">
                            {/* زر ابحث عن كابتن (أقرب كابتن للتاجر) */}
                            <button
                              type="button"
                              disabled={isSearching}
                              onClick={() => handleSearchAndAssignNearestCaptain(order)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 font-extrabold text-[11px] transition-all cursor-pointer disabled:opacity-50 shrink-0"
                              title="يبحث النظام تلقائياً عن أقرب كابتن متاح للتاجر ويسند له الطلب"
                            >
                              <Compass className={`w-3.5 h-3.5 ${isSearching ? 'animate-spin' : ''}`} />
                              <span>{isSearching ? 'جاري البحث...' : 'ابحث عن كابتن'}</span>
                            </button>

                            {/* اختيار يدوي للكابتن */}
                            <select
                              value=""
                              onChange={(e) => handleAssignCaptain(order.id, e.target.value)}
                              className="bg-[#0a0c12] hover:bg-zinc-900 border border-zinc-700/80 text-zinc-300 text-[11px] font-bold rounded-lg px-2 py-1.5 focus:outline-none focus:border-amber-400 cursor-pointer transition-all"
                            >
                              <option value="" disabled className="bg-zinc-900 text-zinc-400">
                                {order.captainName ? 'تغيير الكابتن' : '+ تعيين يدوي'}
                              </option>
                              {captains.map((c) => (
                                <option key={c.id} value={c.id} className="bg-zinc-900 text-white">
                                  {c.name} {c.canReceiveOrders === false ? '(موقوف)' : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </td>

                      {/* رسوم التوصيل */}
                      <td className="py-4 px-3.5 font-mono font-bold text-xs text-amber-400 whitespace-nowrap">
                        {order.deliveryFee} ج.م
                      </td>

                      {/* 1. توقيت إنشاء الطلب */}
                      <td className="py-4 px-3.5 text-xs text-zinc-300 whitespace-nowrap font-mono">
                        {formatDateTimeDisplay(order.createdAt)}
                      </td>

                      {/* 2. النظام أخذ وقت قد إيه يبحث عن كابتن */}
                      <td className="py-4 px-3.5 text-xs whitespace-nowrap">
                        {order.captainSearchDuration ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 font-bold text-[11px]">
                            <Timer className="w-3.5 h-3.5" />
                            <span>{order.captainSearchDuration}</span>
                          </span>
                        ) : (
                          <span className="text-zinc-500 text-[11px]">قيد البحث / لم يُعيّن</span>
                        )}
                      </td>

                      {/* 3. وقت قبول الطلب من الكابتن */}
                      <td className="py-4 px-3.5 text-xs whitespace-nowrap font-mono">
                        {order.acceptedAt ? (
                          <span className="text-emerald-400 font-bold">
                            {formatTimeDisplay(order.acceptedAt)}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStampStageTime(order, 'acceptedAt', 'وقت قبول الكابتن')}
                            className="text-[11px] px-2 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 border border-zinc-800 transition-colors"
                          >
                            + تسجيل القبول
                          </button>
                        )}
                      </td>

                      {/* 4. وقت وصول الكابتن للتاجر */}
                      <td className="py-4 px-3.5 text-xs whitespace-nowrap font-mono">
                        {order.arrivedAtMerchantAt ? (
                          <span className="text-sky-400 font-bold">
                            {formatTimeDisplay(order.arrivedAtMerchantAt)}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              handleStampStageTime(order, 'arrivedAtMerchantAt', 'وقت وصول الكابتن للتاجر')
                            }
                            className="text-[11px] px-2 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-sky-400 border border-zinc-800 transition-colors"
                          >
                            + تسجيل الوصول للتاجر
                          </button>
                        )}
                      </td>

                      {/* 5. وقت استلام الطلب من التاجر */}
                      <td className="py-4 px-3.5 text-xs whitespace-nowrap font-mono">
                        {order.pickedUpAt ? (
                          <span className="text-purple-400 font-bold">
                            {formatTimeDisplay(order.pickedUpAt)}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              handleStampStageTime(order, 'pickedUpAt', 'وقت استلام الطلب من التاجر')
                            }
                            className="text-[11px] px-2 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-purple-400 border border-zinc-800 transition-colors"
                          >
                            + تسجيل الاستلام
                          </button>
                        )}
                      </td>

                      {/* 6. وقت تسليم الطلب للعميل */}
                      <td className="py-4 px-3.5 text-xs whitespace-nowrap font-mono">
                        {order.deliveredAt ? (
                          <span className="text-emerald-300 font-bold">
                            {formatTimeDisplay(order.deliveredAt)}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              handleStampStageTime(order, 'deliveredAt', 'وقت تسليم الطلب للعميل')
                            }
                            className="text-[11px] px-2 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-emerald-300 border border-zinc-800 transition-colors"
                          >
                            + تسجيل التسليم
                          </button>
                        )}
                      </td>

                      {/* الحالة */}
                      <td className="py-4 px-3.5 whitespace-nowrap">
                        <StatusBadge status={order.status} type="order" />
                      </td>

                      {/* الإجراءات */}
                      <td className="py-4 px-3.5 text-left whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <select
                            value={order.status}
                            onChange={(e) => handleUpdateStatus(order.id, e.target.value as OrderStatus)}
                            className="bg-[#0a0c12] border border-zinc-800 text-[11px] font-bold text-zinc-300 rounded-lg px-2 py-1 focus:outline-none focus:border-amber-500 cursor-pointer"
                          >
                            {ORDER_STATUSES.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>

                          <button
                            onClick={() => setViewingOrder(order)}
                            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800/80 rounded-lg transition-colors cursor-pointer"
                            title="عرض تفاصيل ومراحل توقيت الطلب"
                          >
                            <Eye className="w-4 h-4" />
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

      {/* View Order Modal with Complete Timeline */}
      {viewingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-[#11141c] border border-zinc-800 rounded-3xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setViewingOrder(null)}
              className="absolute top-5 left-5 text-zinc-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-lg">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-white">{viewingOrder.orderNumber}</h3>
                  <StatusBadge status={viewingOrder.status} type="order" />
                </div>
                <p className="text-xs text-zinc-400">
                  توقيت إنشاء الطلب: {formatDateTimeDisplay(viewingOrder.createdAt)}
                </p>
              </div>
            </div>

            {/* Merchant & Captain Assignment Card */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mb-5">
              <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
                <span className="text-zinc-500 block mb-1">اسم التاجر</span>
                <span className="font-bold text-zinc-200">{viewingOrder.restaurantName}</span>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2">
                <span className="text-zinc-500 block">كابتن التوصيل</span>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-zinc-200 truncate">
                    {viewingOrder.captainName || 'لم يتم تعيين كابتن'}
                  </span>
                  <button
                    type="button"
                    disabled={searchingOrderId === viewingOrder.id}
                    onClick={() => handleSearchAndAssignNearestCaptain(viewingOrder)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-[11px] transition-all cursor-pointer shrink-0"
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>ابحث عن كابتن</span>
                  </button>
                </div>
                <select
                  value={viewingOrder.captainId || ''}
                  onChange={(e) => handleAssignCaptain(viewingOrder.id, e.target.value)}
                  className="w-full bg-zinc-950 border border-amber-500/40 text-[11px] text-amber-400 font-bold rounded-lg px-2 py-1.5 focus:outline-none focus:border-amber-400 cursor-pointer"
                >
                  <option value="" disabled>
                    {viewingOrder.captainName ? 'تغيير الكابتن يدوياً' : 'تعيين كابتن يدوياً'}
                  </option>
                  {captains.map((c) => (
                    <option key={c.id} value={c.id} className="bg-zinc-900 text-white">
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {viewingOrder.deliveryAddress && (
                <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800 sm:col-span-2">
                  <span className="text-zinc-500 block mb-1">عنوان التوصيل</span>
                  <span className="font-bold text-zinc-200">{viewingOrder.deliveryAddress}</span>
                </div>
              )}
            </div>

            {/* Detailed 6-Stage Order Timestamps Panel */}
            <div className="mb-5 p-4 rounded-2xl bg-[#0a0c12] border border-zinc-800 space-y-3">
              <h4 className="text-xs font-black text-amber-400 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>سجل التوقيتات الزمنية للطلب</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-zinc-900/70 border border-zinc-800/80">
                  <span className="text-zinc-400 block mb-1">1. توقيت إنشاء الطلب</span>
                  <span className="font-mono font-bold text-zinc-100">
                    {formatDateTimeDisplay(viewingOrder.createdAt)}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-zinc-900/70 border border-zinc-800/80">
                  <span className="text-zinc-400 block mb-1">2. الوقت المستغرق للبحث عن كابتن</span>
                  <span className="font-bold text-amber-400">
                    {viewingOrder.captainSearchDuration || 'قيد البحث / لم يُحدّد'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-zinc-900/70 border border-zinc-800/80 flex items-center justify-between">
                  <div>
                    <span className="text-zinc-400 block mb-1">3. وقت قبول الطلب من الكابتن</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {formatDateTimeDisplay(viewingOrder.acceptedAt)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleStampStageTime(viewingOrder, 'acceptedAt', 'وقت قبول الكابتن')}
                    className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[10px] text-zinc-200 font-bold"
                  >
                    تسجيل الآن
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-zinc-900/70 border border-zinc-800/80 flex items-center justify-between">
                  <div>
                    <span className="text-zinc-400 block mb-1">4. وقت وصول الكابتن للتاجر</span>
                    <span className="font-mono font-bold text-sky-400">
                      {formatDateTimeDisplay(viewingOrder.arrivedAtMerchantAt)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleStampStageTime(viewingOrder, 'arrivedAtMerchantAt', 'وقت وصول الكابتن للتاجر')
                    }
                    className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[10px] text-zinc-200 font-bold"
                  >
                    تسجيل الآن
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-zinc-900/70 border border-zinc-800/80 flex items-center justify-between">
                  <div>
                    <span className="text-zinc-400 block mb-1">5. وقت استلام الطلب من التاجر</span>
                    <span className="font-mono font-bold text-purple-400">
                      {formatDateTimeDisplay(viewingOrder.pickedUpAt)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleStampStageTime(viewingOrder, 'pickedUpAt', 'وقت استلام الطلب من التاجر')
                    }
                    className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[10px] text-zinc-200 font-bold"
                  >
                    تسجيل الآن
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-zinc-900/70 border border-zinc-800/80 flex items-center justify-between">
                  <div>
                    <span className="text-zinc-400 block mb-1">6. وقت تسليم الطلب للعميل</span>
                    <span className="font-mono font-bold text-emerald-300">
                      {formatDateTimeDisplay(viewingOrder.deliveredAt)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleStampStageTime(viewingOrder, 'deliveredAt', 'وقت تسليم الطلب للعميل')
                    }
                    className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[10px] text-zinc-200 font-bold"
                  >
                    تسجيل الآن
                  </button>
                </div>
              </div>
            </div>

            {/* Delivery Fee Card */}
            <div className="p-4 rounded-xl bg-zinc-900/90 border border-zinc-800 flex items-center justify-between text-xs mb-5">
              <span className="text-zinc-300 font-bold">رسوم التوصيل (المحددة من التاجر):</span>
              <span className="font-mono text-amber-400 font-black text-base">{viewingOrder.deliveryFee} ج.م</span>
            </div>

            {/* Status changer in modal */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-zinc-800/80">
              <label className="text-xs font-bold text-zinc-400">تغيير حالة الطلب:</label>
              <select
                value={viewingOrder.status}
                onChange={(e) => handleUpdateStatus(viewingOrder.id, e.target.value as OrderStatus)}
                className="bg-[#0a0c12] border border-zinc-700 text-xs font-bold text-amber-400 rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500"
              >
                {ORDER_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Send Order to Captain Modal */}
      <SendOrderModal
        isOpen={isSendModalOpen}
        onClose={() => setIsSendModalOpen(false)}
        onOrderCreated={fetchOrders}
      />
    </div>
  );
};
