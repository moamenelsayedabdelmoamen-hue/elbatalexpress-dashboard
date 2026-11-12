/**
 * Central registry for all Firestore collection names and common fields.
 * If the current or future schema names differ in your Firebase project,
 * you can adjust them in this single file without touching the UI components.
 */

export const COLLECTIONS = {
  RESTAURANTS: 'restaurants',
  CAPTAINS: 'captains',
  ORDERS: 'orders',
  SUBSCRIPTIONS: 'subscriptions',
  PAYMENTS: 'payments',
  SETTINGS: 'settings',
  ADMINS: 'admins',
  USERS: 'users',
  CAPTAIN_SCHEDULES: 'captain_schedules',
  NOTIFICATIONS: 'notifications',
} as const;

export const RESTAURANT_FIELDS = {
  NAME: 'name',
  NAME_AR: 'nameAr',
  CATEGORY: 'category',
  CUISINE: 'cuisine',
  PHONE: 'phone',
  RATING: 'rating',
  STATUS: 'status',
  IS_ACTIVE: 'isActive',
  SUBSCRIPTION_STATUS: 'subscriptionStatus',
  CREATED_AT: 'createdAt',
  UPDATED_AT: 'updatedAt',
} as const;

export const ORDER_FIELDS = {
  ORDER_NUMBER: 'orderNumber',
  RESTAURANT_ID: 'restaurantId',
  RESTAURANT_NAME: 'restaurantName',
  CUSTOMER_NAME: 'customerName',
  CUSTOMER_PHONE: 'customerPhone',
  CAPTAIN_ID: 'captainId',
  CAPTAIN_NAME: 'captainName',
  STATUS: 'status',
  TOTAL: 'total',
  SUBTOTAL: 'subtotal',
  DELIVERY_FEE: 'deliveryFee',
  CREATED_AT: 'createdAt',
} as const;

export const SUBSCRIPTION_PLANS = [
  { captainsCount: 2, price: 400, label: '2 كابتن - 400 جنيه' },
  { captainsCount: 4, price: 800, label: '4 كابتن - 800 جنيه' },
  { captainsCount: 6, price: 1200, label: '6 كابتن - 1200 جنيه' },
  { captainsCount: 8, price: 1600, label: '8 كابتن - 1600 جنيه' },
] as const;
