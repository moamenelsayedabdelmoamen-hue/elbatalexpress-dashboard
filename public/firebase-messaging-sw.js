/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAsXpoAY4bhwE6krsdCcBKrUMw7SHnb7Xc",
  authDomain: "el-batal-express-956ae.firebaseapp.com",
  databaseURL: "https://el-batal-express-956ae-default-rtdb.firebaseio.com",
  projectId: "el-batal-express-956ae",
  storageBucket: "el-batal-express-956ae.firebasestorage.app",
  messagingSenderId: "877386066216",
  appId: "1:877386066216:web:b74914c0dc38501bcd081d",
  measurementId: "G-T5ESTNN6JY"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notificationTitle =
    (payload.notification && payload.notification.title) ||
    (payload.data && payload.data.title) ||
    'تنبيه جديد - البطل إكسبريس';

  const notificationOptions = {
    body:
      (payload.notification && payload.notification.body) ||
      (payload.data && payload.data.body) ||
      'يوجد تحديث جديد في لوحة تحكم البطل إكسبريس',
    icon: '/logo.png',
    badge: '/logo.png',
    dir: 'rtl',
    lang: 'ar',
    data: payload.data || { url: '/orders' },
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/orders';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.focus();
          return;
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
