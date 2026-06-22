// Web Push service worker: displays incoming notifications and routes
// clicks to the relevant task. Payload shape comes from the API's
// PushPayload (lib/push.ts): { type, title, body?, taskId? }.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Non-JSON payload — show what we can.
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "ClearTask", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data,
    }),
  );
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
