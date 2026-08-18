import ActivityKit
import Foundation

struct MeetingActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        let phase: String
        let startedAt: Date
        let markedMoments: Int
    }

    let meetingId: String
    let title: String
}
