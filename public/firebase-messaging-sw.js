/* Service worker exclusivo das notificações do Vibely (separado do cache do app). */
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp(Object.fromEntries(new URL(self.location).searchParams));
firebase.messaging();

self.addEventListener("notificationclick", (event) => {
  const path = (event.notification && event.notification.data && event.notification.data.path) || "/";
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(new URL(path, self.location.origin).href);
          return client.focus();
        }
      }
      return self.clients.openWindow(new URL(path, self.location.origin).href);
    }),
  );
});
