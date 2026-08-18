import ActivityKit
import Foundation
import React

@objc(LooperLiveActivity)
class LooperLiveActivityModule: NSObject {
    @objc
    static func requiresMainQueueSetup() -> Bool {
        false
    }

    @objc(start:title:startedAt:resolver:rejecter:)
    func start(
        _ meetingId: String,
        title: String,
        startedAt: NSNumber,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.2, *) else {
            resolve(nil)
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            resolve(nil)
            return
        }

        Task {
            do {
                for activity in Activity<MeetingActivityAttributes>.activities {
                    await activity.end(nil, dismissalPolicy: .immediate)
                }
                let attributes = MeetingActivityAttributes(meetingId: meetingId, title: title)
                let state = MeetingActivityAttributes.ContentState(
                    phase: "recording",
                    startedAt: Date(timeIntervalSince1970: startedAt.doubleValue / 1_000),
                    markedMoments: 0
                )
                let activity = try Activity.request(
                    attributes: attributes,
                    content: ActivityContent(state: state, staleDate: nil),
                    pushType: nil
                )
                resolve(activity.id)
            } catch {
                reject("LIVE_ACTIVITY_START_FAILED", error.localizedDescription, error)
            }
        }
    }

    @objc(update:phase:markedMoments:resolver:rejecter:)
    func update(
        _ meetingId: String,
        phase: String,
        markedMoments: NSNumber,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter _: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.2, *) else {
            resolve(nil)
            return
        }

        Task {
            guard let activity = activity(for: meetingId) else {
                resolve(nil)
                return
            }
            let state = MeetingActivityAttributes.ContentState(
                phase: phase,
                startedAt: activity.content.state.startedAt,
                markedMoments: markedMoments.intValue
            )
            await activity.update(ActivityContent(state: state, staleDate: nil))
            resolve(nil)
        }
    }

    @objc(end:phase:resolver:rejecter:)
    func end(
        _ meetingId: String,
        phase: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter _: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.2, *) else {
            resolve(nil)
            return
        }

        Task {
            guard let activity = activity(for: meetingId) else {
                resolve(nil)
                return
            }
            let state = MeetingActivityAttributes.ContentState(
                phase: phase,
                startedAt: activity.content.state.startedAt,
                markedMoments: activity.content.state.markedMoments
            )
            let content = ActivityContent(state: state, staleDate: nil)
            let dismissal: ActivityUIDismissalPolicy = phase == "complete"
                ? .after(Date().addingTimeInterval(30))
                : .default
            await activity.end(content, dismissalPolicy: dismissal)
            resolve(nil)
        }
    }

    @available(iOS 16.2, *)
    private func activity(for meetingId: String) -> Activity<MeetingActivityAttributes>? {
        Activity<MeetingActivityAttributes>.activities.first {
            $0.attributes.meetingId == meetingId
        }
    }
}
