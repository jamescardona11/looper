import SwiftUI
import WidgetKit

private struct QuickDictationEntry: TimelineEntry {
    let date: Date
}

private struct QuickDictationProvider: TimelineProvider {
    func placeholder(in context: Context) -> QuickDictationEntry {
        QuickDictationEntry(date: Date())
    }

    func getSnapshot(
        in context: Context,
        completion: @escaping (QuickDictationEntry) -> Void
    ) {
        completion(QuickDictationEntry(date: Date()))
    }

    func getTimeline(
        in context: Context,
        completion: @escaping (Timeline<QuickDictationEntry>) -> Void
    ) {
        completion(Timeline(entries: [QuickDictationEntry(date: Date())], policy: .never))
    }
}

struct QuickDictationWidget: Widget {
    private let kind = "LooperQuickDictation"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: QuickDictationProvider()) { _ in
            Link(destination: URL(string: "looper://dictation")!) {
                ZStack {
                    Color(red: 20 / 255, green: 21 / 255, blue: 25 / 255)
                    VStack(alignment: .leading, spacing: 10) {
                        Image(systemName: "waveform.circle.fill")
                            .font(.system(size: 32, weight: .semibold))
                            .foregroundStyle(Color(red: 143 / 255, green: 156 / 255, blue: 255 / 255))
                        Spacer()
                        Text("Dictar una idea")
                            .font(.headline)
                            .foregroundStyle(.white)
                        Text("Abre Looper listo para escuchar")
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.62))
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                    .padding(16)
                }
            }
        }
        .configurationDisplayName("Dictado rápido")
        .description("Abre Looper directamente en Dictation.")
        .supportedFamilies([.systemSmall])
    }
}
