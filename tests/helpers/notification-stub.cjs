// Route tests isolate delivery; outbox tests exercise the actual queue/worker.
exports.withNotificationStub = deps => ({
  ...deps,
  "@/lib/notification-service": {
    notifyUser: async () => {}, notifyUsers: async () => {}, flushNotifications: async () => {},
    ...deps["@/lib/notification-service"],
  },
});
