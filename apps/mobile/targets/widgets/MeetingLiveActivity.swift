import ActivityKit
import SwiftUI
import WidgetKit

struct MeetingLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: MeetingActivityAttributes.self) { context in
            HStack(spacing: 12) {
                activityIcon(for: context.state.phase)
                VStack(alignment: .leading, spacing: 4) {
                    Text(context.attributes.title)
                        .font(.headline)
                        .lineLimit(1)
                    HStack(spacing: 8) {
                        phaseLabel(for: context.state.phase)
                        if context.state.phase == "recording" {
                            Text(timerInterval: context.state.startedAt...Date.distantFuture, countsDown: false)
                                .monospacedDigit()
                        }
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
                Spacer()
                if context.state.markedMoments > 0 {
                    Label("\(context.state.markedMoments)", systemImage: "bookmark.fill")
                        .font(.caption.bold())
                }
            }
            .padding()
            .activityBackgroundTint(Color(red: 20 / 255, green: 21 / 255, blue: 25 / 255))
            .activitySystemActionForegroundColor(.white)
            .widgetURL(URL(string: "looper://capture"))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    activityIcon(for: context.state.phase)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 2) {
                        Text(context.attributes.title)
                            .font(.headline)
                            .lineLimit(1)
                        phaseLabel(for: context.state.phase)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if context.state.phase == "recording" {
                        Text(timerInterval: context.state.startedAt...Date.distantFuture, countsDown: false)
                            .font(.caption.monospacedDigit())
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Link(destination: URL(string: "looper://capture")!) {
                        Label("Volver al meeting", systemImage: "arrow.up.right")
                            .font(.caption.bold())
                    }
                }
            } compactLeading: {
                activityIcon(for: context.state.phase)
            } compactTrailing: {
                if context.state.phase == "recording" {
                    Text(timerInterval: context.state.startedAt...Date.distantFuture, countsDown: false)
                        .font(.caption2.monospacedDigit())
                        .frame(width: 42)
                } else {
                    Image(systemName: context.state.phase == "processing" ? "sparkles" : "checkmark")
                }
            } minimal: {
                activityIcon(for: context.state.phase)
            }
            .widgetURL(URL(string: "looper://capture"))
        }
    }
}

@ViewBuilder
private func activityIcon(for phase: String) -> some View {
    Image(systemName: phase == "recording" ? "waveform" : phase == "processing" ? "sparkles" : "checkmark")
        .font(.system(size: 16, weight: .bold))
        .foregroundStyle(Color(red: 143 / 255, green: 156 / 255, blue: 255 / 255))
}

private func phaseLabel(for phase: String) -> Text {
    switch phase {
    case "recording": Text("Escuchando")
    case "processing": Text("Organizando")
    case "complete": Text("Guardado")
    default: Text("Necesita atención")
    }
}
