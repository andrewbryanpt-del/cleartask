// Firebase Cloud Messaging service worker. Firebase config is sent from the
// main app via postMessage so this file does not need build-time env vars.
importScripts("https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js");

let messaging = null;

function showNotification(payload) {
  const notification = payload.notification ?? {};
  const data = payload.data ?? {};
  return self.registration.showNotification(notification.title || "ClearTask", {
    body: notification.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data,
  });
}

self.addEventListener("message", (event) => {
  if (event.data?.type !== "INIT_FIREBASE") return;

  if (!messaging) {
    firebase.initializeApp(event.data.config);
    messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => showNotification(payload));
  }

  event.ports[0]?.postMessage({ ok: true });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const taskId = event.notification.data && event.notification.data.taskId;
  const url = taskId ? `/tasks/${taskId}` : "/";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        for (const client of windows) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return clients.openWindow(url);
      }),
  );
});
