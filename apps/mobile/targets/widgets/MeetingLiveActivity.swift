import ActivityKit
import SwiftUI
import WidgetKit

struct MeetingLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: MeetingActivityAttributes.self) { context in
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    activityIcon(for: context.state.phase)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.attributes.title)
                            .font(.headline)
                            .lineLimit(1)
                        Text("en este iPhone")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Label {
                        phaseLabel(for: context.state.phase)
                    } icon: {
                        Circle()
                            .fill(context.state.phase == "recording" ? Color.red.opacity(0.8) : Color.accentColor)
                            .frame(width: 6, height: 6)
                    }
                    .font(.caption.bold())
                }

                HStack(spacing: 0) {
                    activityMetric(
                        context.state.phase == "recording"
                            ? Text(timerInterval: context.state.startedAt...Date.distantFuture, countsDown: false)
                            : Text("—"),
                        label: "Transcurrido"
                    )
                    activityMetric(Text("\(context.state.markedMoments)"), label: "Momentos")
                    activityMetric(phaseLabel(for: context.state.phase), label: "Estado")
                }

                VStack(spacing: 5) {
                    HStack(spacing: 0) {
                        phaseNode("waveform", active: context.state.phase == "recording")
                        Rectangle().fill(Color.white.opacity(0.2)).frame(height: 1)
                        phaseNode("sparkles", active: context.state.phase == "processing")
                        Rectangle().fill(Color.white.opacity(0.2)).frame(height: 1)
                        phaseNode("checkmark", active: context.state.phase == "complete")
                    }
                    HStack {
                        Text("Escuchando")
                        Spacer()
                        Text("Organizando")
                        Spacer()
                        Text("Guardado")
                    }
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                }

                Link(destination: URL(string: "looper://capture")!) {
                    HStack {
                        Label("Abrir para marcar un momento", systemImage: "bookmark")
                        Spacer()
                        Text("Abrir meeting ↗")
                    }
                    .font(.caption.bold())
                    .foregroundStyle(.white)
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
private func activityMetric(_ value: Text, label: String) -> some View {
    VStack(alignment: .leading, spacing: 2) {
        value
            .font(.headline.monospacedDigit())
            .lineLimit(1)
        Text(label)
            .font(.caption2)
            .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
}

private func phaseNode(_ name: String, active: Bool) -> some View {
    Image(systemName: name)
        .font(.caption.bold())
        .foregroundStyle(active ? Color(red: 143 / 255, green: 156 / 255, blue: 255 / 255) : .secondary)
        .frame(width: 22, height: 22)
        .background(active ? Color.white.opacity(0.12) : Color.clear, in: Circle())
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
