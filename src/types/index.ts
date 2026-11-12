export type UserRole = 'admin' | 'restaurant' | 'captain' | 'user';

export type AdminRolePermission =
  | 'add_restaurants'
  | 'add_captains'
  | 'read_only'
  | 'manage_orders';

export interface AdminAccount {
  id: string;
  uid?: string;
  name: string;
  displayName?: string;
  email: string;
  roles: AdminRolePermission[];
  status: 'active' | 'pending_verification';
  emailVerified?: boolean;
  isMasterAdmin?: boolean;
  createdAt?: any;
  updatedAt?: any;
  addedBy?: string;
  raw?: Record<string, any>;
}

export interface AdminUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
  isAdmin: boolean;
  isMasterAdmin?: boolean;
  emailVerified?: boolean;
  roles?: AdminRolePermission[];
}

export type SubscriptionStatus = 'Active' | 'Pending' | 'Expired' | 'Suspended';

export interface Restaurant {
  id: string;
  name: string;
  category?: string;
  phone?: string;
  rating?: number;
  subscriptionStatus?: SubscriptionStatus;
  isActive: boolean;
  createdAt?: any;
  address?: string;
  ownerEmail?: string;
  logo?: string;
  image?: string;
  location?: any; // GeoPoint or { lat, lng } or { latitude, longitude }
  coords?: { lat: number; lng: number } | null;
  activeOrdersCount?: number;
  status?: string;
  // Preserve any raw fields from existing Firestore documents
  raw?: Record<string, any>;
}

export type CaptainStatus = 'online' | 'offline' | 'busy' | 'available';

export interface Captain {
  id: string;
  name: string;
  phone: string;
  email?: string;
  password?: string;
  profileImage?: string;
  photoURL?: string;
  status: CaptainStatus;
  isOnline?: boolean;
  canReceiveOrders?: boolean;
  ordersCount: number;
  rating: number;
  createdAt?: any;
  updatedAt?: any;
  statusUpdatedAt?: any;
  vehicleType?: string;
  location?: any; // GeoPoint or { lat, lng } or { latitude, longitude }
  coords?: { lat: number; lng: number } | null;
  lastLocationUpdate?: any;
  currentOrderId?: string;
  raw?: Record<string, any>;
}

export interface NearestCaptainResult {
  captain: Captain;
  distanceKm: number;
  formattedDistance: string;
  isFresh: boolean;
  minutesAgo: number;
  formattedTime: string;
}

export type OrderStatus =
  | 'New'
  | 'Accepted'
  | 'Preparing'
  | 'Ready'
  | 'Picked Up'
  | 'Delivered'
  | 'Cancelled';

export interface OrderItem {
  id?: string;
  name: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  restaurantId?: string;
  restaurantName: string;
  customerName: string;
  customerPhone?: string;
  deliveryAddress?: string;
  captainId?: string;
  captainName?: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: OrderStatus;
  createdAt?: any;
  assignedAt?: any;
  acceptedAt?: any;
  arrivedAtMerchantAt?: any;
  pickedUpAt?: any;
  deliveredAt?: any;
  captainSearchDuration?: string;
  captainSearchSeconds?: number;
  distanceToMerchantKm?: number;
  items?: OrderItem[];
  raw?: Record<string, any>;
}

export interface SubscriptionPlan {
  captainsCount: number;
  price: number;
  label: string;
}

export interface Subscription {
  id: string;
  restaurantId: string;
  restaurantName: string;
  merchantLogo?: string;
  merchantPhone?: string;
  merchantEmail?: string;
  plan: string;
  captainsCount?: number;
  price: number;
  startDate: string;
  endDate: string;
  status: SubscriptionStatus;
  raw?: Record<string, any>;
}

export type PaymentMethod = 'Visa' | 'Mobile Wallet' | 'Cash' | string;
export type PaymentStatus = 'success' | 'pending' | 'failed';

export interface Payment {
  id: string;
  transactionId?: string;
  transactionNumber?: string;
  restaurantId?: string;
  restaurantName: string;
  amount: number;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  date?: string;
  createdAt?: any;
  notes?: string;
  raw?: Record<string, any>;
}

export interface DashboardStats {
  totalRestaurants: number;
  activeRestaurants: number;
  totalCaptains: number;
  activeCaptains: number;
  totalOrders: number;
  todayOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  totalRevenue: number;
  monthlyRevenue?: number;
  dailyOrderVolume?: number;
  avgOrderValue?: number;
  avgDeliveryTimeMinutes?: number;
  orderSuccessRate?: number;
}

export interface SystemSettings {
  companyName: string;
  companyNameAr: string;
  supportPhone: string;
  supportEmail: string;
  address: string;
  baseDeliveryFee: number;
  perKmRate: number;
  taxRatePercent: number;
  activeCities: string[];
}

// -----------------------------------------------------------------------------
// Captain Shifts & Work Schedule Types (نظام إدارة شفتات وساعات عمل الكباتن)
// -----------------------------------------------------------------------------
export type DayOfWeek =
  | 'saturday'
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday';

export interface ShiftTimeSlot {
  id: string;
  name?: string;
  startTime: string; // "HH:mm" e.g. "09:00"
  endTime: string;   // "HH:mm" e.g. "17:00" or "02:00" (overnight)
  durationHours: number; // calculated hours
  isOvernight?: boolean;
}

export interface DaySchedule {
  day: DayOfWeek;
  dayNameAr: string;
  isDayOff: boolean;
  shifts: ShiftTimeSlot[];
  totalHours: number;
}

export type ShiftWorkStatus =
  | 'active'        // أخضر: يعمل ومستعد لاستقبال الطلبات
  | 'starting_soon' // برتقالي: لديه شفت قريب وسيبدأ العمل قريباً
  | 'off_shift'     // أحمر: خارج ساعات العمل ولا يستقبل طلبات
  | 'paused'        // رمادي: جدول العمل متوقف مؤقتاً
  | 'unscheduled';  // رمادي: غير مجدول

export interface NextShiftInfo {
  day: DayOfWeek;
  dayNameAr: string;
  shift: ShiftTimeSlot;
  startsInMinutes: number;
  startTimeFormatted: string;
  isToday: boolean;
}

export interface CaptainShiftStatusInfo {
  status: ShiftWorkStatus;
  statusLabelAr: string;
  statusBadgeVariant: 'success' | 'warning' | 'danger' | 'neutral';
  isEligibleForOrders: boolean;
  currentShift: ShiftTimeSlot | null;
  nextShift: NextShiftInfo | null;
  currentShiftEnd: string | null;
  todayWorkingHours: number;
  weeklyWorkingHours: number;
  isPaused: boolean;
  isDayOffToday: boolean;
  currentTimeInCairo: string;
  message?: string;
}

export interface CaptainSchedule {
  id: string; // captainId / UID
  captainId: string;
  captainName: string;
  captainPhone?: string;
  isPaused: boolean;
  notes?: string;
  weeklySchedule: Record<DayOfWeek, DaySchedule>;
  totalWeeklyHours: number;
  updatedAt?: any;
  createdAt?: any;
  updatedBy?: string;
  raw?: Record<string, any>;
}

// -----------------------------------------------------------------------------
// Firebase Cloud Messaging (FCM) & In-Dashboard Admin Notifications
// -----------------------------------------------------------------------------
export type AdminNotificationType = 'new_order' | 'captain_assignment_failed' | 'system';

export interface AdminNotification {
  id: string;
  type: AdminNotificationType;
  title: string;
  body: string;
  orderId?: string;
  orderNumber?: string;
  restaurantName?: string;
  reason?: string;
  isRead: boolean;
  createdAt: string;
  userId?: string;
}


