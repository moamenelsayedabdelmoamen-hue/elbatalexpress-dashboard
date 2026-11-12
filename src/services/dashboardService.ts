import { DashboardStats, Order } from '../types';
import { RestaurantService } from './restaurantService';
import { CaptainService } from './captainService';
import { OrderService } from './orderService';
import { PaymentService } from './paymentService';

export const EMPTY_STATS: DashboardStats = {
  totalRestaurants: 0,
  activeRestaurants: 0,
  totalCaptains: 0,
  activeCaptains: 0,
  totalOrders: 0,
  todayOrders: 0,
  completedOrders: 0,
  cancelledOrders: 0,
  totalRevenue: 0,
  monthlyRevenue: 0,
  dailyOrderVolume: 0,
  avgOrderValue: 0,
  avgDeliveryTimeMinutes: 0,
  orderSuccessRate: 0,
};

export const DashboardService = {
  async getDashboardData(): Promise<{ stats: DashboardStats; recentOrders: Order[]; isLive: boolean }> {
    try {
      const [restaurantsRes, captainsRes, ordersRes, paymentsRes] = await Promise.all([
        RestaurantService.getAll(),
        CaptainService.getAll(),
        OrderService.getAll(),
        PaymentService.getAll(),
      ]);

      const restaurants = restaurantsRes.data;
      const captains = captainsRes.data;
      const orders = ordersRes.data;
      const payments = paymentsRes.data;

      const totalRestaurants = restaurants.length;
      const activeRestaurants = restaurants.filter((r) => r.isActive).length;

      const totalCaptains = captains.length;
      const activeCaptains = captains.filter((c) => c.status === 'online' || c.status === 'busy').length;

      const totalOrders = orders.length;
      const completedOrders = orders.filter((o) => o.status === 'Delivered').length;
      const cancelledOrders = orders.filter((o) => o.status === 'Cancelled').length;

      // Count orders created today & calculate daily volume safely
      const todayString = new Date().toISOString().split('T')[0];
      const todayOrderList = orders.filter((o) => {
        if (!o.createdAt) return false;
        const createdStr = typeof o.createdAt === 'string' ? o.createdAt : String(o.createdAt);
        return createdStr.startsWith(todayString);
      });
      const todayOrders = todayOrderList.length;
      const dailyOrderVolume = todayOrderList.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

      // Calculate total and monthly revenue strictly from real successful payments
      const successfulPayments = payments.filter((p) => p.status === 'success');
      const totalRevenue = successfulPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      const now = new Date();
      const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const thisMonthPayments = successfulPayments.filter((p) => {
        const dateStr = typeof p.createdAt === 'string' ? p.createdAt : (typeof p.date === 'string' ? p.date : '');
        return dateStr.startsWith(currentMonthPrefix);
      });
      const monthlyRevenue = thisMonthPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      const totalOrdersAmount = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
      const avgOrderValue = totalOrders > 0
        ? Math.round(totalOrdersAmount / totalOrders)
        : 0;

      const orderSuccessRate = totalOrders > 0
        ? Math.round((completedOrders / totalOrders) * 100)
        : 0;

      // Calculate real average delivery time from orders with createdAt & deliveredAt
      const deliveredWithTimestamps = orders.filter(
        (o) => o.status === 'Delivered' && o.createdAt && o.deliveredAt
      );
      let avgDeliveryTimeMinutes = completedOrders > 0 ? 25 : 0;
      if (deliveredWithTimestamps.length > 0) {
        const totalMins = deliveredWithTimestamps.reduce((acc, o) => {
          const start = new Date(o.createdAt).getTime();
          const end = new Date(o.deliveredAt!).getTime();
          const diffMins = Math.round((end - start) / 60000);
          return acc + (diffMins > 0 && diffMins < 300 ? diffMins : 25);
        }, 0);
        avgDeliveryTimeMinutes = Math.round(totalMins / deliveredWithTimestamps.length);
      }

      const stats: DashboardStats = {
        totalRestaurants,
        activeRestaurants,
        totalCaptains,
        activeCaptains,
        totalOrders,
        todayOrders,
        completedOrders,
        cancelledOrders,
        totalRevenue,
        monthlyRevenue,
        dailyOrderVolume,
        avgOrderValue,
        avgDeliveryTimeMinutes,
        orderSuccessRate,
      };

      const recentOrders = orders.slice(0, 6);

      return {
        stats,
        recentOrders,
        isLive: restaurantsRes.isLive || ordersRes.isLive || captainsRes.isLive,
      };
    } catch (error) {
      console.error('Error computing dashboard data:', error);
      return {
        stats: EMPTY_STATS,
        recentOrders: [],
        isLive: false,
      };
    }
  },
};
