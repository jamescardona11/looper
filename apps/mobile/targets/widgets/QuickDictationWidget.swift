import SwiftUI
import WidgetKit

private struct QuickDictationEntry: TimelineEntry {
    let date: Date
    let weeklyWordCount: Int
    let lastCaptureTitle: String?
    let lastCaptureDetail: String
}

private struct QuickDictationProvider: TimelineProvider {
    private let appGroupId = "group.com.j11.looper.mobile"

    private func entry() -> QuickDictationEntry {
        let defaults = UserDefaults(suiteName: appGroupId)
        return QuickDictationEntry(
            date: Date(),
            weeklyWordCount: defaults?.integer(forKey: "looper_widget_weekly_word_count") ?? 0,
            lastCaptureTitle: defaults?.string(forKey: "looper_widget_last_capture_title"),
            lastCaptureDetail: defaults?.string(forKey: "looper_widget_last_capture_detail") ?? "Aún no hay capturas"
        )
    }

    func placeholder(in context: Context) -> QuickDictationEntry {
        entry()
    }

    func getSnapshot(
        in context: Context,
        completion: @escaping (QuickDictationEntry) -> Void
    ) {
        completion(entry())
    }

    func getTimeline(
        in context: Context,
        completion: @escaping (Timeline<QuickDictationEntry>) -> Void
    ) {
        completion(Timeline(entries: [entry()], policy: .never))
    }
}

struct QuickDictationWidget: Widget {
    private let kind = "LooperQuickDictation"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: QuickDictationProvider()) { entry in
            Link(destination: URL(string: "looper://dictation")!) {
                ZStack {
                    Color(red: 251 / 255, green: 250 / 255, blue: 245 / 255)
                    VStack(alignment: .leading, spacing: 8) {
                        Image(systemName: "mic.fill")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 34, height: 34)
                            .background(Color(red: 103 / 255, green: 84 / 255, blue: 232 / 255), in: Circle())
                        Spacer()
                        Text(entry.weeklyWordCount == 0 ? "—" : "\(entry.weeklyWordCount)")
                            .font(.system(size: 34, weight: .bold, design: .rounded))
                            .foregroundStyle(Color(red: 21 / 255, green: 22 / 255, blue: 26 / 255))
                        Text("palabras esta semana.")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(Color(red: 21 / 255, green: 22 / 255, blue: 26 / 255))
                        Text("Capturadas con Looper.")
                            .font(.caption)
                            .foregroundStyle(Color(red: 114 / 255, green: 118 / 255, blue: 128 / 255))
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                    .padding(16)
                }
            }
        }
        .configurationDisplayName("Dictado rápido")
        .description("Muestra tus palabras capturadas esta semana.")
        .supportedFamilies([.systemSmall])
    }
}
