import SwiftUI
import WidgetKit

private struct RecentCaptureEntry: TimelineEntry {
    let date: Date
    let title: String?
    let detail: String
}

private struct RecentCaptureProvider: TimelineProvider {
    private let appGroupId = "group.com.j11.looper.mobile"

    private func entry() -> RecentCaptureEntry {
        let defaults = UserDefaults(suiteName: appGroupId)
        return RecentCaptureEntry(
            date: Date(),
            title: defaults?.string(forKey: "looper_widget_last_capture_title"),
            detail: defaults?.string(forKey: "looper_widget_last_capture_detail") ?? "Aún no hay capturas"
        )
    }

    func placeholder(in context: Context) -> RecentCaptureEntry { entry() }

    func getSnapshot(in context: Context, completion: @escaping (RecentCaptureEntry) -> Void) {
        completion(entry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<RecentCaptureEntry>) -> Void) {
        completion(Timeline(entries: [entry()], policy: .never))
    }
}

struct RecentCaptureWidget: Widget {
    private let kind = "LooperRecentCapture"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: RecentCaptureProvider()) { entry in
            Link(destination: URL(string: "looper://notes")!) {
                ZStack {
                    Color(red: 21 / 255, green: 22 / 255, blue: 26 / 255)
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 8) {
                            Image(systemName: "checkmark")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(width: 28, height: 28)
                                .background(Color.white.opacity(0.1), in: Circle())
                            Text("Última captura")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(.white.opacity(0.62))
                        }
                        Spacer()
                        Text(entry.title ?? entry.detail)
                            .font(.system(size: 15, weight: .semibold))
                            .lineLimit(2)
                            .foregroundStyle(.white)
                        Text(entry.title == nil ? "Captura pendiente" : "Resumen listo")
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.82))
                        Spacer(minLength: 2)
                        Text("Abrir en Looper ↗")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(Color(red: 209 / 255, green: 189 / 255, blue: 255 / 255))
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                    .padding(16)
                }
            }
        }
        .configurationDisplayName("Última captura")
        .description("Abre la última captura en Looper.")
        .supportedFamilies([.systemSmall])
    }
}
