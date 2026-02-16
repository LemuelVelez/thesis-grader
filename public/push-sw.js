/* eslint-disable no-restricted-globals */
const DEFAULT_URL = "/dashboard/admin/notifications"

self.addEventListener("install", () => {
    self.skipWaiting()
})

self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim())
})

function safeParsePushPayload(event) {
    try {
        if (!event.data) return {}
        return event.data.json()
    } catch {
        try {
            return { body: event.data ? event.data.text() : "" }
        } catch {
            return {}
        }
    }
}

self.addEventListener("push", (event) => {
    const payload = safeParsePushPayload(event)

    const title =
        typeof payload.title === "string" && payload.title.trim().length > 0
            ? payload.title.trim()
            : "New notification"

    const body =
        typeof payload.body === "string" && payload.body.trim().length > 0
            ? payload.body.trim()
            : "You have a new update."

    const tag =
        typeof payload.tag === "string" && payload.tag.trim().length > 0
            ? payload.tag.trim()
            : "thesisgrader-notification"

    const dataNode =
        payload && typeof payload.data === "object" && payload.data
            ? payload.data
            : {}

    const targetUrl =
        typeof payload.url === "string" && payload.url.trim().length > 0
            ? payload.url.trim()
            : typeof dataNode.url === "string" && dataNode.url.trim().length > 0
                ? dataNode.url.trim()
                : DEFAULT_URL

    const options = {
        body,
        tag,
        renotify: false,
        data: {
            ...dataNode,
            url: targetUrl,
        },
    }

    if (typeof payload.icon === "string" && payload.icon.trim().length > 0) {
        options.icon = payload.icon.trim()
    }

    if (typeof payload.badge === "string" && payload.badge.trim().length > 0) {
        options.badge = payload.badge.trim()
    }

    event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", (event) => {
    event.notification.close()

    const clickedUrl =
        event.notification &&
            event.notification.data &&
            typeof event.notification.data.url === "string"
            ? event.notification.data.url
            : DEFAULT_URL

    event.waitUntil(
        (async () => {
            const target = new URL(clickedUrl, self.location.origin).href
            const allClients = await self.clients.matchAll({
                type: "window",
                includeUncontrolled: true,
            })

            for (const client of allClients) {
                if ("focus" in client) {
                    await client.focus()
                    if ("navigate" in client) {
                        await client.navigate(target)
                    }
                    return
                }
            }

            if (self.clients.openWindow) {
                await self.clients.openWindow(target)
            }
        })(),
    )
})
