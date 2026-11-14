import { auth } from '../firebase/config';

const PAYMOB_BACKEND_URL = (import.meta.env.VITE_PAYMOB_BACKEND_URL || 'https://paymob-backend-sf2w.onrender.com').replace(/\/$/, '');

export type PaymobMethod = 'card' | 'wallet';

export async function createPaymobPayment(input: {
  restaurantId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  method: PaymobMethod;
}): Promise<{ url: string; order_id: string; type: PaymobMethod }> {
  const user = auth?.currentUser;
  if (!user) throw new Error('يجب تسجيل الدخول بحساب مسؤول قبل إنشاء عملية الدفع.');
  const token = await user.getIdToken();
  const response = await fetch(`${PAYMOB_BACKEND_URL}/pay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      restaurant_id: input.restaurantId,
      email: input.email,
      first_name: input.firstName,
      last_name: input.lastName,
      phone_number: input.phone || '',
      payment_method: input.method,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'تعذر إنشاء عملية الدفع عبر Paymob.');
  if (!result.url || !result.order_id) throw new Error('استجابة Paymob غير مكتملة.');
  return result;
}
