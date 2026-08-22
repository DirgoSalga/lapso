// Stub only -- do not implement in v1 (spec §6.3).
//
// A closed tab runs no JavaScript, so nothing here can fire a notification
// on schedule; notify.ts's catch-up path (compute dueMilestones on launch,
// show one consolidated card) is the compromise for that. The real fix is
// Web Push, which needs a server component this app deliberately doesn't
// have:
//
//   1. A serverless function holding a VAPID key pair, which calls the
//      push service (via a library like web-push) whenever a milestone's
//      scheduled time arrives -- it needs the schedule server-side, since
//      the point is delivering without the client running.
//   2. Here: subscribe via `registration.pushManager.subscribe({
//      userVisibleOnly: true, applicationServerKey: <VAPID public key> })`,
//      send the subscription to that function, and handle
//      `pushsubscriptionchange` (subscriptions can expire/rotate) by
//      re-subscribing and re-sending.
//   3. In the service worker: a `push` event listener calling
//      `self.registration.showNotification(...)`.
export {}
