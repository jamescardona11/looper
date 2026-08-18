import Foundation

class DarwinNotificationManager {
    static let shared = DarwinNotificationManager()

    private typealias Callback = () -> Void
    private typealias ObserverToken = UnsafeMutableRawPointer

    private let notificationCenter: CFNotificationCenter
    private var callbackByName = [String: Callback]()

    private init() {
        notificationCenter = CFNotificationCenterGetDarwinNotifyCenter()
    }

    func post(_ name: String) {
        CFNotificationCenterPostNotification(
            notificationCenter,
            CFNotificationName(name as CFString),
            nil,
            nil,
            true
        )
    }

    func observe(_ name: String, callback: @escaping () -> Void) {
        callbackByName.updateValue(callback, forKey: name)
        CFNotificationCenterAddObserver(
            notificationCenter,
            observerToken,
            Self.forwardNotification,
            name as CFString,
            nil,
            .deliverImmediately
        )
    }

    func removeObserver(_ name: String) {
        CFNotificationCenterRemoveObserver(
            notificationCenter,
            observerToken,
            CFNotificationName(name as CFString),
            nil
        )
        callbackByName[name] = nil
    }

    func removeAll() {
        CFNotificationCenterRemoveEveryObserver(notificationCenter, observerToken)
        callbackByName.removeAll(keepingCapacity: false)
    }

    private var observerToken: ObserverToken {
        Unmanaged.passUnretained(self).toOpaque()
    }

    private func enqueueCallback(named name: String) {
        DispatchQueue.main.async { [self] in
            callbackByName[name]?()
        }
    }

    private static let forwardNotification: CFNotificationCallback = {
        _, token, notification, _, _ in
        guard let token, let notification else { return }

        let recipient = Unmanaged<DarwinNotificationManager>
            .fromOpaque(token)
            .takeUnretainedValue()
        recipient.enqueueCallback(named: notification.rawValue as String)
    }
}
