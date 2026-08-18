import Foundation

private struct RetrySchedule: IteratorProtocol {
    private let limit: Int
    private let multiplier: Double
    private var attempt = 0
    private var delay: TimeInterval

    var totalAttempts: Int { limit }

    init(limit: Int, firstDelay: TimeInterval, multiplier: Double) {
        precondition(limit > 0, "A retry operation needs at least one attempt")
        self.limit = limit
        self.delay = firstDelay
        self.multiplier = multiplier
    }

    mutating func next() -> (number: Int, delayAfterFailure: TimeInterval?)? {
        guard attempt < limit else { return nil }
        attempt += 1
        let pause = attempt == limit ? nil : delay
        delay *= multiplier
        return (attempt, pause)
    }
}

func withRetry<T>(
    maxAttempts: Int = 3,
    initialDelay: TimeInterval = 1.0,
    backoffMultiplier: Double = 2.0,
    operation: @escaping () async throws -> T
) async throws -> T {
    try await executeWithRetry(
        schedule: RetrySchedule(
            limit: maxAttempts,
            firstDelay: initialDelay,
            multiplier: backoffMultiplier
        ),
        operation: operation,
        pause: { seconds in
            try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
        },
        report: { attempt, limit, error in
            NSLog(
                "[LooperKB] Retry %d/%d failed: %@",
                attempt,
                limit,
                error.localizedDescription
            )
        }
    )
}

private func executeWithRetry<T>(
    schedule: RetrySchedule,
    operation: @escaping () async throws -> T,
    pause: @escaping (TimeInterval) async throws -> Void,
    report: (Int, Int, Error) -> Void
) async throws -> T {
    var schedule = schedule
    var lastFailure: Error?
    let limit = schedule.totalAttempts

    while let step = schedule.next() {
        do {
            return try await operation()
        } catch {
            lastFailure = error
            report(step.number, limit, error)
            if let delay = step.delayAfterFailure {
                try await pause(delay)
            }
        }
    }

    throw lastFailure!
}
