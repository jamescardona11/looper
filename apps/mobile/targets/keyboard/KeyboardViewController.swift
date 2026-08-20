import AVFoundation
import UIKit

private func configured<Component>(_ component: Component, _ update: (Component) -> Void)
  -> Component
{
  update(component)
  return component
}

// MARK: - Audio Waveform

class AudioWaveformView: UIView {
  private struct SignalState {
    var phase: CGFloat = 0
    var visibleLevel: CGFloat = 0
    var requestedLevel: CGFloat = 0
    var referenceLevel: CGFloat = 0
    var columns: [CGFloat] = []
  }

  private var frameClock: CADisplayLink?
  private var signal = SignalState()

  // Rejilla de 3 pt con puntos base oscuros y puntos blancos al escuchar, como
  // en el desktop. El lienzo ya no es el compacto de 32×18: ocupa el ancho del
  // rail, porque a ese tamaño la animación no se percibía.
  private let dotSpacing: CGFloat = 3
  private let baseDotRadius: CGFloat = 0.9
  private let activeDotRadius: CGFloat = 1.0
  private let baseDotColor = UIColor(red: 0.176, green: 0.180, blue: 0.216, alpha: 1)
  private let highlightColor = UIColor.white
  private let attackSmoothing: CGFloat = 0.45
  private let decaySmoothing: CGFloat = 0.08
  // Amplitud lineal, no dB: 0.015 son unos -36 dBFS, un umbral que se tragaba
  // la voz baja y dejaba la señal clavada en cero. 0.002 (~-54 dBFS) queda por
  // encima del silencio digital pero deja pasar el habla floja.
  private let signalFloor: CGFloat = 0.002
  // El divisor de la normalización. Estaba en 0.05, muy por encima de lo que
  // capta un micro en una sala normal (~0.005), así que `normalized` nunca se
  // acercaba a 1 y la rejilla no llegaba a encender ni su fila central: la
  // adaptación al nivel de tu voz, que es el objetivo de referenceLevel,
  // quedaba anulada. Con 0.004 el divisor lo marca la señal real y del silencio
  // se encarga signalFloor.
  private let minimumReference: CGFloat = 0.004

  var isActive = false {
    didSet {
      guard !isActive else { return }
      signal.requestedLevel = 0
    }
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    configureCanvas()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    configureCanvas()
  }

  private func configureCanvas() {
    (backgroundColor, isOpaque, contentMode) = (.clear, false, .redraw)
  }

  func startAnimating() {
    stopAnimating()
    let clock = CADisplayLink(target: self, selector: #selector(advanceFrame))
    clock.preferredFramesPerSecond = 60
    clock.add(to: .main, forMode: .common)
    frameClock = clock
  }

  func stopAnimating() {
    frameClock?.invalidate()
    frameClock = nil
  }

  func updateLevel(_ level: CGFloat) {
    guard level > signalFloor else {
      signal.requestedLevel = 0
      return
    }
    let adaptation: CGFloat = level > signal.referenceLevel ? 0.3 : 0.01
    signal.referenceLevel += (level - signal.referenceLevel) * adaptation
    let normalized = level / max(signal.referenceLevel, minimumReference)
    signal.requestedLevel = min(1, normalized * 0.85)
  }

  @objc private func advanceFrame() {
    smoothVisibleLevel()
    advanceRipplePhase()
    resizeColumnBufferIfNeeded()
    updateColumnLevels()
    setNeedsDisplay()
  }

  private func smoothVisibleLevel() {
    let coefficient = signal.requestedLevel > signal.visibleLevel ? attackSmoothing : decaySmoothing
    signal.visibleLevel += (signal.requestedLevel - signal.visibleLevel) * coefficient
  }

  private func advanceRipplePhase() {
    signal.phase += 0.11
    let fullTurn = CGFloat.pi * 2
    if signal.phase > fullTurn { signal.phase -= fullTurn }
  }

  private func resizeColumnBufferIfNeeded() {
    let requiredCount = max(1, Int(bounds.width / dotSpacing))
    guard signal.columns.count != requiredCount else { return }
    signal.columns = .init(repeating: 0, count: requiredCount)
  }

  private func updateColumnLevels() {
    let midpoint = CGFloat(signal.columns.count - 1) / 2
    var columnLevels = signal.columns
    for index in columnLevels.indices {
      let distance = midpoint > 0 ? abs(CGFloat(index) - midpoint) / midpoint : 0
      let centerWeight = 1 - distance * 0.42
      let ripple = 0.76 + 0.24 * sin(signal.phase + distance * 4.2)
      let desired = isActive ? signal.visibleLevel * centerWeight * ripple : 0
      let columnSmoothing: CGFloat = desired > columnLevels[index] ? 0.5 : 0.1
      columnLevels[index] += (desired - columnLevels[index]) * columnSmoothing
    }
    signal.columns = columnLevels
  }

  override func draw(_ rect: CGRect) {
    guard let context = UIGraphicsGetCurrentContext() else { return }
    let columnCount = max(1, Int(rect.width / dotSpacing))
    let rowCount = max(1, Int(rect.height / dotSpacing))
    let origin = CGPoint(
      x: (rect.width - CGFloat(columnCount) * dotSpacing) / 2,
      y: (rect.height - CGFloat(rowCount) * dotSpacing) / 2
    )

    for column in 0..<columnCount {
      let amplitude = signal.columns.indices.contains(column) ? signal.columns[column] : 0
      let activeRadius = amplitude * rect.height * 0.45

      for row in 0..<rowCount {
        let center = CGPoint(
          x: origin.x + (CGFloat(column) + 0.5) * dotSpacing,
          y: origin.y + (CGFloat(row) + 0.5) * dotSpacing
        )
        let distanceFromCenter = abs(center.y - rect.midY)
        let isActiveDot = activeRadius > 0.5 && distanceFromCenter < activeRadius
        let edgeAlpha = pillMaskAlpha(at: center, in: rect)
        guard edgeAlpha > 0.05 else { continue }

        let radius: CGFloat
        if isActiveDot {
          let brightness = 0.5 + 0.5 * (1 - distanceFromCenter / (activeRadius + 0.1))
          highlightColor.withAlphaComponent(brightness * edgeAlpha).setFill()
          context.setShadow(
            offset: .zero,
            blur: brightness > 0.8 ? 4 : 0,
            color: highlightColor.withAlphaComponent(0.4).cgColor
          )
          radius = activeDotRadius
        } else {
          baseDotColor.withAlphaComponent(edgeAlpha).setFill()
          context.setShadow(offset: .zero, blur: 0, color: nil)
          radius = baseDotRadius
        }

        context.fillEllipse(
          in: CGRect(
            origin: CGPoint(x: center.x - radius, y: center.y - radius),
            size: CGSize(width: radius * 2, height: radius * 2)
          )
        )
      }
    }
  }

  private func pillMaskAlpha(at point: CGPoint, in rect: CGRect) -> CGFloat {
    let capRadius = rect.height / 2
    let distanceInside: CGFloat
    switch point.x {
    case ..<capRadius:
      distanceInside = capRadius - hypot(point.x - capRadius, point.y - rect.midY)
    case (rect.width - capRadius)...:
      distanceInside = capRadius - hypot(point.x - (rect.width - capRadius), point.y - rect.midY)
    default:
      distanceInside = min(point.y, rect.maxY - point.y)
    }
    return min(1, max(0, distanceInside / 15))
  }
}

// MARK: - Indeterminate Progress Bar

class IndeterminateProgressView: UIView {
  private var frameClock: CADisplayLink?
  private var elapsed: CGFloat = 0

  var barColor: UIColor = .label

  private let fadeLayer = CAGradientLayer()
  private let cycleDuration: CGFloat = 1.8

  override init(frame: CGRect) {
    super.init(frame: frame)
    configureGradientMask()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    configureGradientMask()
  }

  private func configureGradientMask() {
    (backgroundColor, isOpaque) = (.clear, false)
    fadeLayer.colors = [UIColor.clear, UIColor.white, UIColor.white, UIColor.clear].map(\.cgColor)
    fadeLayer.locations = [0, 0.12, 0.88, 1.0]
    (fadeLayer.startPoint, fadeLayer.endPoint) = (
      CGPoint(x: 0, y: 0.5),
      CGPoint(x: 1, y: 0.5)
    )
    layer.mask = fadeLayer
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    defer { CATransaction.commit() }
    fadeLayer.frame = bounds
  }

  func startAnimating() {
    stopAnimating()
    elapsed = 0
    let clock = CADisplayLink(target: self, selector: #selector(advanceFrame))
    clock.preferredFramesPerSecond = 60
    clock.add(to: .main, forMode: .common)
    frameClock = clock
  }

  func stopAnimating() {
    frameClock?.invalidate()
    frameClock = nil
  }

  @objc private func advanceFrame() {
    elapsed += 1 / 60
    if elapsed > cycleDuration { elapsed -= cycleDuration }
    setNeedsDisplay()
  }

  override func draw(_ rect: CGRect) {
    guard let context = UIGraphicsGetCurrentContext() else { return }
    let dotCount = 8
    let spacing = rect.width / CGFloat(dotCount)
    let activePosition = (elapsed / cycleDuration) * CGFloat(dotCount)

    for index in 0..<dotCount {
      let distance = abs(CGFloat(index) - activePosition)
      let wrappedDistance = min(distance, CGFloat(dotCount) - distance)
      let intensity = max(0.22, 1 - wrappedDistance * 0.45)
      let radius = 2.1 + intensity * 1.2
      let center = CGPoint(x: spacing * (CGFloat(index) + 0.5), y: rect.midY)

      context.saveGState()
      barColor.withAlphaComponent(intensity).setFill()
      let dotRect = CGRect(
        origin: CGPoint(x: center.x - radius, y: center.y - radius),
        size: CGSize(width: radius * 2, height: radius * 2)
      )
      context.fillEllipse(in: dotRect)
      context.restoreGState()
    }
  }
}

private final class LooperLogoView: UIView {
  private let color: UIColor

  init(color: UIColor) {
    self.color = color
    super.init(frame: .zero)
    backgroundColor = .clear
    isOpaque = false
    isUserInteractionEnabled = false
  }

  required init?(coder: NSCoder) {
    color = .white
    super.init(coder: coder)
    backgroundColor = .clear
    isOpaque = false
    isUserInteractionEnabled = false
  }

  override func draw(_ rect: CGRect) {
    let scale = min(rect.width, rect.height) / 80
    let origin = CGPoint(
      x: (rect.width - 80 * scale) / 2,
      y: (rect.height - 80 * scale) / 2
    )
    let point: (CGFloat, CGFloat) -> CGPoint = { x, y in
      CGPoint(x: origin.x + x * scale, y: origin.y + y * scale)
    }

    let path = UIBezierPath()
    path.move(to: point(10, 27))
    path.addCurve(
      to: point(27, 10),
      controlPoint1: point(10, 17.61),
      controlPoint2: point(17.61, 10)
    )
    path.addLine(to: point(46, 10))
    path.addLine(to: point(46, 32))
    path.addLine(to: point(68, 32))
    path.addLine(to: point(68, 53))
    path.addCurve(
      to: point(51, 70),
      controlPoint1: point(68, 62.39),
      controlPoint2: point(60.39, 70)
    )
    path.addLine(to: point(27, 70))
    path.addCurve(
      to: point(10, 53),
      controlPoint1: point(10, 62.39),
      controlPoint2: point(17.61, 70)
    )
    path.close()
    path.append(
      UIBezierPath(
        roundedRect: CGRect(
          x: origin.x + 52 * scale,
          y: origin.y + 4 * scale,
          width: 20 * scale,
          height: 20 * scale
        ),
        cornerRadius: 3 * scale
      )
    )
    color.setFill()
    path.fill()
  }
}

// MARK: - Keyboard Controller

class KeyboardViewController: UIInputViewController {
  private enum Palette {
    static let background = UIColor(red: 0.000, green: 0.000, blue: 0.000, alpha: 1)
    static let backgroundSecondary = UIColor(red: 0.039, green: 0.039, blue: 0.039, alpha: 1)
    static let surfaceMuted = UIColor(red: 0.082, green: 0.082, blue: 0.082, alpha: 1)
    static let surface = UIColor(red: 0.125, green: 0.125, blue: 0.125, alpha: 1)
    static let surfaceElevated = UIColor(red: 0.216, green: 0.216, blue: 0.216, alpha: 1)
    static let border = UIColor(red: 0.157, green: 0.157, blue: 0.157, alpha: 1)
    static let text = UIColor(red: 1.000, green: 1.000, blue: 1.000, alpha: 1)
    static let textSecondary = UIColor(red: 0.745, green: 0.745, blue: 0.745, alpha: 1)
    static let muted = UIColor(red: 0.525, green: 0.525, blue: 0.525, alpha: 1)
    static let accent = UIColor(red: 0.439, green: 0.475, blue: 0.984, alpha: 1)
    static let onAccent = background
  }

  private enum Layout {
    static let contentHeight: CGFloat = 240
  }

  private enum PillVisual {
    case idle, recording, loading
    case error(String)
  }

  private var dictationPhase: DictationPhase = .idle
  private var isProcessing = false

  private var dictationRail: UIView!
  private var pillButton: UIView!
  private var pillLabel: UILabel!
  private var controlIconView: UIImageView!
  private var controlActivityIndicator: UIActivityIndicatorView!
  private var waveformView: AudioWaveformView!
  private var progressView: IndeterminateProgressView!
  private var nextKeyboardButton: UIButton?
  private var logoButton: UIButton!
  private var languageChip: UIButton!
  private var transformSelectorButton: UIButton!
  private var transformSelectorWithoutLanguageConstraint: NSLayoutConstraint!
  private var transformSelectorWithLanguageConstraint: NSLayoutConstraint!
  private var transformationBackdrop: UIControl!
  private var transformationPanel: UIView!
  private var formatPickerButton: UIButton!
  private var stylePickerButton: UIButton!
  private var transformSummaryLabel: UILabel!

  private var selectedToneId: String?
  private var activeToneIds: [String] = []
  private var toneById: [String: SharedTone] = [:]
  private var manualWorkflows: [SharedWorkflow] = []
  private var selectedWorkflowId: String?

  private var selectedFormatId: String?

  private var termIds: [String] = []
  private var termById: [String: SharedTerm] = [:]
  private var snippets: [SharedSnippet] = []

  private var dictationLanguages: [String] = ["en"]

  private var audioLevelTimer: Timer?
  private var keyboardAudioRecorder: AVAudioRecorder?
  private var keyboardRecordingTimer: Timer?
  private var keyboardRecordingStartedAt: Date?
  private var smoothedAudioLevel: CGFloat = 0
  private var appCounterPoller: Timer?
  private var lastAppCounter: Int = -1

  private var cachedIdToken: String?
  private var cachedIdTokenExpiry: Date?
  private var lastDebugLog: String = ""

  private var memberInfo: MemberInfo?
  private var memberRefreshTimer: Timer?
  private var fullAccessBanner: UIView!

  override func viewDidLoad() {
    super.viewDidLoad()
    inputView?.allowsSelfSizing = true
    preferredContentSize = CGSize(width: 0, height: Layout.contentHeight)
    buildUI()
    startKeyboardCounterPoller()
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    syncFullAccessStatus()
    loadTones()
    loadWorkflows()
    loadFormats()
    loadLanguage()
    loadDictionary()
    loadSnippets()
    refreshDictationState()
    startDarwinObservers()
    refreshMemberData()
    startMemberRefreshTimer()
  }

  private func syncFullAccessStatus() {
    let defaults = UserDefaults(suiteName: DictationConstants.appGroupId)
    defaults?.set(hasFullAccess, forKey: "looper_keyboard_has_full_access")
    updateFullAccessState()
  }

  private func updateFullAccessState() {
    dictationRail.isHidden = !hasFullAccess
    transformSelectorButton.isHidden = !hasFullAccess
    fullAccessBanner.isHidden = hasFullAccess
  }

  @objc private func onOpenSettingsTap() {
    openURL(UIApplication.openSettingsURLString)
  }

  override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    updateColorsForAppearance()
  }

  private func updateColorsForAppearance() {
    progressView?.barColor = Palette.accent
  }

  // MARK: - Dictation State

  private func refreshDictationState() {
    let defaults = UserDefaults(suiteName: DictationConstants.appGroupId)
    let phaseStr = defaults?.string(forKey: DictationConstants.phaseKey) ?? "idle"
    var newPhase = DictationPhase(rawValue: phaseStr) ?? .idle

    if newPhase != .idle && isHeartbeatStale(defaults) {
      NSLog("[LooperKB] Heartbeat stale, resetting phase to idle")
      defaults?.set("idle", forKey: DictationConstants.phaseKey)
      newPhase = .idle
    }

    let oldPhase = dictationPhase
    dictationPhase = newPhase

    if isProcessing { return }

    switch newPhase {
    case .recording:
      applyPillVisual(.recording, animated: oldPhase != newPhase)
      startAudioLevelPolling()
    case .active:
      stopAudioLevelPolling()
      let shouldProcessFixture =
        defaults?.bool(forKey: DictationConstants.keyboardFixtureReadyKey) == true
      if shouldProcessFixture {
        defaults?.set(false, forKey: DictationConstants.keyboardFixtureReadyKey)
        defaults?.synchronize()
      }
      if oldPhase == .recording || shouldProcessFixture {
        handleTranscription()
      } else {
        applyPillVisual(.idle, animated: oldPhase != newPhase)
      }
    case .idle:
      stopAudioLevelPolling()
      applyPillVisual(.idle, animated: oldPhase != newPhase)
    }
  }

  private func isHeartbeatStale(_ defaults: UserDefaults?) -> Bool {
    if defaults?.bool(forKey: DictationConstants.keyboardFixtureReadyKey) == true {
      return false
    }
    let heartbeat = defaults?.double(forKey: DictationConstants.heartbeatKey)
    guard let heartbeat = heartbeat, heartbeat > 0 else { return true }
    let elapsed = Date().timeIntervalSince1970 - heartbeat
    return elapsed > DictationConstants.heartbeatStaleThreshold
  }

  // MARK: - Build UI

  private func buildUI() {
    view.backgroundColor = Palette.backgroundSecondary
    overrideUserInterfaceStyle = .dark

    let hc = view.heightAnchor.constraint(equalToConstant: Layout.contentHeight)
    hc.priority = .defaultHigh
    hc.isActive = true

    logoButton = configured(UIButton(type: .custom)) { button in
      button.translatesAutoresizingMaskIntoConstraints = false
      button.backgroundColor = Palette.surface
      button.layer.cornerRadius = 12
      button.clipsToBounds = true
      button.accessibilityLabel = "Looper"
      button.accessibilityTraits = .button
      button.addTarget(self, action: #selector(onLogoButtonTap), for: .touchUpInside)
    }
    addButtonFeedback(logoButton)
    view.addSubview(logoButton)

    let logoImageView = LooperLogoView(color: Palette.text)
    logoImageView.translatesAutoresizingMaskIntoConstraints = false
    logoImageView.accessibilityIdentifier = "LooperLogoImageView"
    logoButton.addSubview(logoImageView)
    NSLayoutConstraint.activate([
      logoImageView.centerXAnchor.constraint(equalTo: logoButton.centerXAnchor),
      logoImageView.centerYAnchor.constraint(equalTo: logoButton.centerYAnchor),
      logoImageView.widthAnchor.constraint(equalToConstant: 28),
      logoImageView.heightAnchor.constraint(equalToConstant: 28),
    ])
    logoButton.isAccessibilityElement = true

    languageChip = configured(UIButton(type: .system)) { button in
      button.translatesAutoresizingMaskIntoConstraints = false
      button.setTitle("EN", for: .normal)
      button.titleLabel?.font = .systemFont(ofSize: 13, weight: .semibold)
      button.setTitleColor(Palette.textSecondary, for: .normal)
      button.backgroundColor = .clear
      button.layer.cornerRadius = 12
      button.clipsToBounds = true
      button.isUserInteractionEnabled = true
      button.addTarget(self, action: #selector(onLanguageChipTap), for: .touchUpInside)
    }
    addButtonFeedback(languageChip)
    view.addSubview(languageChip)

    dictationRail = configured(UIView()) { rail in
      rail.translatesAutoresizingMaskIntoConstraints = false
      rail.backgroundColor = .clear
    }

    let dictationVisuals = configured(UIView()) { visuals in
      visuals.translatesAutoresizingMaskIntoConstraints = false
    }
    dictationRail.addSubview(dictationVisuals)

    waveformView = configured(AudioWaveformView()) { waveform in
      waveform.translatesAutoresizingMaskIntoConstraints = false
      waveform.alpha = 0
      waveform.isUserInteractionEnabled = false
    }
    dictationVisuals.addSubview(waveformView)

    progressView = configured(IndeterminateProgressView()) { progress in
      progress.translatesAutoresizingMaskIntoConstraints = false
      progress.alpha = 0
      progress.isUserInteractionEnabled = false
    }
    dictationVisuals.addSubview(progressView)

    pillLabel = configured(UILabel()) { label in
      label.translatesAutoresizingMaskIntoConstraints = false
      label.textColor = Palette.text
      label.font = .systemFont(ofSize: 14, weight: .semibold)
      label.textAlignment = .center
      label.isAccessibilityElement = false
    }
    dictationVisuals.addSubview(pillLabel)

    pillButton = configured(UIView()) { button in
      button.translatesAutoresizingMaskIntoConstraints = false
      button.backgroundColor = Palette.accent
      button.layer.cornerRadius = 32
      button.clipsToBounds = true
      button.isUserInteractionEnabled = true
      button.isAccessibilityElement = true
      button.accessibilityTraits = .button
    }
    dictationRail.addSubview(pillButton)

    controlIconView = configured(UIImageView()) { icon in
      icon.translatesAutoresizingMaskIntoConstraints = false
      icon.tintColor = Palette.text
      icon.contentMode = .scaleAspectFit
      icon.isUserInteractionEnabled = false
    }
    pillButton.addSubview(controlIconView)

    controlActivityIndicator = configured(UIActivityIndicatorView(style: .medium)) { indicator in
      indicator.translatesAutoresizingMaskIntoConstraints = false
      indicator.color = Palette.onAccent
      indicator.hidesWhenStopped = true
      indicator.isUserInteractionEnabled = false
    }
    pillButton.addSubview(controlActivityIndicator)

    let press = UILongPressGestureRecognizer(target: self, action: #selector(onPillPress(_:)))
    press.minimumPressDuration = 0
    pillButton.addGestureRecognizer(press)

    let lockIcon = configured(UIImageView(image: UIImage(systemName: "lock.fill"))) { icon in
      icon.translatesAutoresizingMaskIntoConstraints = false
      icon.tintColor = Palette.muted
      icon.contentMode = .scaleAspectFit
    }

    let accessLabel = configured(UILabel()) { label in
      label.translatesAutoresizingMaskIntoConstraints = false
      label.text = "Falta el acceso completo"
      label.font = .systemFont(ofSize: 14, weight: .medium)
      label.textColor = Palette.text
    }

    let labelRow = configured(UIStackView(arrangedSubviews: [lockIcon, accessLabel])) { row in
      row.axis = .horizontal
      row.spacing = 6
      row.alignment = .center
    }

    NSLayoutConstraint.activate([
      lockIcon.widthAnchor.constraint(equalToConstant: 18),
      lockIcon.heightAnchor.constraint(equalToConstant: 18),
    ])

    let settingsButton = configured(UIButton(type: .system)) { button in
      button.setTitle("Abrir ajustes", for: .normal)
      button.titleLabel?.font = .systemFont(ofSize: 14, weight: .semibold)
      button.backgroundColor = Palette.accent
      button.setTitleColor(Palette.onAccent, for: .normal)
      button.contentEdgeInsets = UIEdgeInsets(top: 0, left: 16, bottom: 0, right: 16)
      button.heightAnchor.constraint(equalToConstant: 32).isActive = true
      button.layer.cornerRadius = 16
      button.addTarget(self, action: #selector(onOpenSettingsTap), for: .touchUpInside)
    }
    addButtonFeedback(settingsButton)

    fullAccessBanner = configured(UIStackView(arrangedSubviews: [labelRow, settingsButton])) {
      banner in
      banner.axis = .vertical
      banner.spacing = 8
      banner.alignment = .center
      banner.translatesAutoresizingMaskIntoConstraints = false
      banner.isHidden = true
    }

    view.addSubview(dictationRail)
    view.addSubview(fullAccessBanner)

    NSLayoutConstraint.activate([
      dictationVisuals.leadingAnchor.constraint(equalTo: dictationRail.leadingAnchor, constant: 16),
      dictationVisuals.trailingAnchor.constraint(
        equalTo: dictationRail.trailingAnchor, constant: -16),
      dictationVisuals.topAnchor.constraint(equalTo: pillButton.bottomAnchor, constant: 14),
      dictationVisuals.heightAnchor.constraint(equalToConstant: 23),

      waveformView.leadingAnchor.constraint(equalTo: dictationRail.leadingAnchor, constant: 8),
      waveformView.trailingAnchor.constraint(equalTo: dictationRail.trailingAnchor, constant: -8),
      waveformView.bottomAnchor.constraint(equalTo: pillButton.topAnchor, constant: -16),
      waveformView.heightAnchor.constraint(equalToConstant: 26),

      progressView.leadingAnchor.constraint(equalTo: waveformView.leadingAnchor),
      progressView.trailingAnchor.constraint(equalTo: waveformView.trailingAnchor),
      progressView.topAnchor.constraint(equalTo: waveformView.topAnchor),
      progressView.heightAnchor.constraint(equalTo: waveformView.heightAnchor),

      pillLabel.leadingAnchor.constraint(equalTo: dictationVisuals.leadingAnchor),
      pillLabel.trailingAnchor.constraint(equalTo: dictationVisuals.trailingAnchor),
      pillLabel.centerYAnchor.constraint(equalTo: dictationVisuals.centerYAnchor),

      pillButton.centerXAnchor.constraint(equalTo: dictationRail.centerXAnchor),
      pillButton.topAnchor.constraint(equalTo: dictationRail.topAnchor, constant: 48),
      pillButton.widthAnchor.constraint(equalToConstant: 64),
      pillButton.heightAnchor.constraint(equalToConstant: 64),

      controlIconView.centerXAnchor.constraint(equalTo: pillButton.centerXAnchor),
      controlIconView.centerYAnchor.constraint(equalTo: pillButton.centerYAnchor),
      controlIconView.widthAnchor.constraint(equalToConstant: 22),
      controlIconView.heightAnchor.constraint(equalToConstant: 22),

      controlActivityIndicator.centerXAnchor.constraint(equalTo: pillButton.centerXAnchor),
      controlActivityIndicator.centerYAnchor.constraint(equalTo: pillButton.centerYAnchor),

    ])

    transformSelectorButton = UIButton(type: .system)
    transformSelectorButton.translatesAutoresizingMaskIntoConstraints = false
    transformSelectorButton.backgroundColor = Palette.surfaceMuted
    transformSelectorButton.layer.borderWidth = 1
    transformSelectorButton.layer.borderColor = Palette.border.cgColor
    transformSelectorButton.layer.cornerRadius = 12
    transformSelectorButton.addTarget(
      self, action: #selector(onTransformSelectorTap), for: .touchUpInside)
    transformSelectorButton.accessibilityLabel = "Transformación"
    addButtonFeedback(transformSelectorButton)
    view.addSubview(transformSelectorButton)

    let transformIcon = UIImageView(image: UIImage(systemName: "slider.horizontal.3"))
    transformIcon.translatesAutoresizingMaskIntoConstraints = false
    transformIcon.tintColor = Palette.accent
    transformIcon.contentMode = .scaleAspectFit
    transformIcon.isUserInteractionEnabled = false
    transformSelectorButton.addSubview(transformIcon)

    let transformLabel = UILabel()
    transformLabel.translatesAutoresizingMaskIntoConstraints = false
    transformLabel.text = "Transformación"
    transformLabel.textColor = Palette.muted
    transformLabel.font = .systemFont(ofSize: 9.5, weight: .semibold)
    transformLabel.isUserInteractionEnabled = false
    transformSelectorButton.addSubview(transformLabel)

    transformSummaryLabel = UILabel()
    transformSummaryLabel.translatesAutoresizingMaskIntoConstraints = false
    transformSummaryLabel.textColor = Palette.textSecondary
    transformSummaryLabel.font = .systemFont(ofSize: 12, weight: .semibold)
    transformSummaryLabel.lineBreakMode = .byTruncatingTail
    transformSummaryLabel.isUserInteractionEnabled = false
    transformSelectorButton.addSubview(transformSummaryLabel)

    let transformChevron = UIImageView(image: UIImage(systemName: "chevron.right"))
    transformChevron.translatesAutoresizingMaskIntoConstraints = false
    transformChevron.tintColor = Palette.muted
    transformChevron.contentMode = .scaleAspectFit
    transformChevron.isUserInteractionEnabled = false
    transformSelectorButton.addSubview(transformChevron)

    let nkb = UIButton(type: .system)
    nkb.setImage(
      UIImage(systemName: "globe", withConfiguration: UIImage.SymbolConfiguration(pointSize: 18)),
      for: .normal)
    nkb.tintColor = Palette.muted
    nkb.translatesAutoresizingMaskIntoConstraints = false
    nkb.addTarget(self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)
    view.addSubview(nkb)
    nextKeyboardButton = nkb

    transformSelectorWithoutLanguageConstraint = transformSelectorButton.leadingAnchor.constraint(
      equalTo: logoButton.trailingAnchor,
      constant: 8
    )
    transformSelectorWithLanguageConstraint = transformSelectorButton.leadingAnchor.constraint(
      equalTo: languageChip.trailingAnchor,
      constant: 8
    )

    NSLayoutConstraint.activate([
      logoButton.topAnchor.constraint(equalTo: view.topAnchor, constant: 8),
      logoButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 12),
      logoButton.heightAnchor.constraint(equalToConstant: 44),
      logoButton.widthAnchor.constraint(equalToConstant: 44),

      languageChip.topAnchor.constraint(equalTo: view.topAnchor, constant: 8),
      languageChip.leadingAnchor.constraint(equalTo: logoButton.trailingAnchor, constant: 8),
      languageChip.heightAnchor.constraint(equalToConstant: 44),
      languageChip.widthAnchor.constraint(greaterThanOrEqualToConstant: 44),

      transformSelectorButton.topAnchor.constraint(equalTo: view.topAnchor, constant: 8),
      transformSelectorWithoutLanguageConstraint,
      transformSelectorButton.trailingAnchor.constraint(
        equalTo: view.trailingAnchor, constant: -12),
      transformSelectorButton.heightAnchor.constraint(equalToConstant: 44),

      dictationRail.topAnchor.constraint(equalTo: transformSelectorButton.bottomAnchor, constant: 14),
      dictationRail.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      dictationRail.widthAnchor.constraint(equalTo: view.widthAnchor, constant: -32),
      dictationRail.heightAnchor.constraint(equalToConstant: 160),

      fullAccessBanner.centerXAnchor.constraint(equalTo: dictationRail.centerXAnchor),
      fullAccessBanner.centerYAnchor.constraint(equalTo: dictationRail.centerYAnchor),

      transformIcon.leadingAnchor.constraint(
        equalTo: transformSelectorButton.leadingAnchor, constant: 10),
      transformIcon.centerYAnchor.constraint(equalTo: transformSelectorButton.centerYAnchor),
      transformIcon.widthAnchor.constraint(equalToConstant: 20),
      transformIcon.heightAnchor.constraint(equalToConstant: 20),

      transformLabel.leadingAnchor.constraint(equalTo: transformIcon.trailingAnchor, constant: 8),
      transformLabel.topAnchor.constraint(equalTo: transformSelectorButton.topAnchor, constant: 6),
      transformSummaryLabel.leadingAnchor.constraint(equalTo: transformLabel.leadingAnchor),
      transformSummaryLabel.trailingAnchor.constraint(
        equalTo: transformChevron.leadingAnchor, constant: -8),
      transformSummaryLabel.topAnchor.constraint(equalTo: transformLabel.bottomAnchor),

      transformChevron.trailingAnchor.constraint(
        equalTo: transformSelectorButton.trailingAnchor, constant: -10),
      transformChevron.centerYAnchor.constraint(equalTo: transformSelectorButton.centerYAnchor),
      transformChevron.widthAnchor.constraint(equalToConstant: 16),
      transformChevron.heightAnchor.constraint(equalToConstant: 16),

      nkb.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 8),
      nkb.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -4),
      nkb.widthAnchor.constraint(equalToConstant: 44),
      nkb.heightAnchor.constraint(equalToConstant: 44),
    ])

    buildTransformationPanel()

    waveformView.startAnimating()
    updateColorsForAppearance()
    updateTransformationSummary()
    applyPillVisual(.idle, animated: false)
  }

  private func buildTransformationPanel() {
    transformationBackdrop = UIControl()
    transformationBackdrop.translatesAutoresizingMaskIntoConstraints = false
    transformationBackdrop.backgroundColor = UIColor.black.withAlphaComponent(0.72)
    transformationBackdrop.isHidden = true
    transformationBackdrop.accessibilityViewIsModal = true
    transformationBackdrop.addTarget(
      self, action: #selector(onTransformationBackdropTap), for: .touchUpInside)
    view.addSubview(transformationBackdrop)

    transformationPanel = UIView()
    transformationPanel.translatesAutoresizingMaskIntoConstraints = false
    transformationPanel.backgroundColor = Palette.surfaceMuted
    transformationPanel.layer.borderWidth = 1
    transformationPanel.layer.borderColor = Palette.border.cgColor
    transformationPanel.layer.cornerRadius = 18
    transformationPanel.clipsToBounds = true
    transformationBackdrop.addSubview(transformationPanel)

    let title = UILabel()
    title.translatesAutoresizingMaskIntoConstraints = false
    title.text = "Transformación"
    title.textColor = Palette.text
    title.font = .systemFont(ofSize: 15, weight: .semibold)
    transformationPanel.addSubview(title)

    let closeButton = UIButton(type: .system)
    closeButton.translatesAutoresizingMaskIntoConstraints = false
    closeButton.setImage(UIImage(systemName: "xmark"), for: .normal)
    closeButton.tintColor = Palette.textSecondary
    closeButton.accessibilityLabel = "Cerrar el selector de transformación"
    closeButton.addTarget(self, action: #selector(onDoneTransformationTap), for: .touchUpInside)
    transformationPanel.addSubview(closeButton)

    let formatRow = makeTransformationRow(label: "Formato")
    formatPickerButton = formatRow.button
    transformationPanel.addSubview(formatRow.container)

    let styleRow = makeTransformationRow(label: "Estilo")
    stylePickerButton = styleRow.button
    transformationPanel.addSubview(styleRow.container)

    let doneButton = UIButton(type: .system)
    doneButton.translatesAutoresizingMaskIntoConstraints = false
    doneButton.setTitle("Hecho", for: .normal)
    doneButton.setTitleColor(Palette.onAccent, for: .normal)
    doneButton.titleLabel?.font = .systemFont(ofSize: 14, weight: .bold)
    doneButton.backgroundColor = Palette.accent
    doneButton.layer.cornerRadius = 12
    doneButton.addTarget(self, action: #selector(onDoneTransformationTap), for: .touchUpInside)
    addButtonFeedback(doneButton)
    transformationPanel.addSubview(doneButton)

    NSLayoutConstraint.activate([
      transformationBackdrop.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      transformationBackdrop.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      transformationBackdrop.topAnchor.constraint(equalTo: view.topAnchor),
      transformationBackdrop.bottomAnchor.constraint(equalTo: view.bottomAnchor),

      transformationPanel.leadingAnchor.constraint(
        equalTo: transformationBackdrop.leadingAnchor, constant: 8),
      transformationPanel.trailingAnchor.constraint(
        equalTo: transformationBackdrop.trailingAnchor, constant: -8),
      transformationPanel.bottomAnchor.constraint(
        equalTo: transformationBackdrop.bottomAnchor, constant: -8),
      transformationPanel.heightAnchor.constraint(equalToConstant: 214),

      title.leadingAnchor.constraint(equalTo: transformationPanel.leadingAnchor, constant: 16),
      title.centerYAnchor.constraint(equalTo: closeButton.centerYAnchor),
      closeButton.topAnchor.constraint(equalTo: transformationPanel.topAnchor, constant: 4),
      closeButton.trailingAnchor.constraint(
        equalTo: transformationPanel.trailingAnchor, constant: -4),
      closeButton.widthAnchor.constraint(equalToConstant: 44),
      closeButton.heightAnchor.constraint(equalToConstant: 44),

      formatRow.container.topAnchor.constraint(equalTo: closeButton.bottomAnchor, constant: 2),
      formatRow.container.leadingAnchor.constraint(
        equalTo: transformationPanel.leadingAnchor, constant: 12),
      formatRow.container.trailingAnchor.constraint(
        equalTo: transformationPanel.trailingAnchor, constant: -12),
      formatRow.container.heightAnchor.constraint(equalToConstant: 48),

      styleRow.container.topAnchor.constraint(
        equalTo: formatRow.container.bottomAnchor, constant: 8),
      styleRow.container.leadingAnchor.constraint(equalTo: formatRow.container.leadingAnchor),
      styleRow.container.trailingAnchor.constraint(equalTo: formatRow.container.trailingAnchor),
      styleRow.container.heightAnchor.constraint(equalToConstant: 48),

      doneButton.topAnchor.constraint(equalTo: styleRow.container.bottomAnchor, constant: 8),
      doneButton.leadingAnchor.constraint(equalTo: styleRow.container.leadingAnchor),
      doneButton.trailingAnchor.constraint(equalTo: styleRow.container.trailingAnchor),
      doneButton.heightAnchor.constraint(equalToConstant: 44),
    ])
  }

  private func makeTransformationRow(label: String) -> (container: UIView, button: UIButton) {
    let container = UIView()
    container.translatesAutoresizingMaskIntoConstraints = false
    container.backgroundColor = Palette.surface
    container.layer.cornerRadius = 12

    let rowLabel = UILabel()
    rowLabel.translatesAutoresizingMaskIntoConstraints = false
    rowLabel.text = label
    rowLabel.textColor = Palette.muted
    rowLabel.font = .systemFont(ofSize: 12, weight: .semibold)
    container.addSubview(rowLabel)

    let button = UIButton(type: .system)
    button.translatesAutoresizingMaskIntoConstraints = false
    button.setTitleColor(Palette.textSecondary, for: .normal)
    button.titleLabel?.font = .systemFont(ofSize: 13, weight: .semibold)
    button.contentHorizontalAlignment = .right
    button.showsMenuAsPrimaryAction = true
    container.addSubview(button)

    NSLayoutConstraint.activate([
      rowLabel.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 12),
      rowLabel.centerYAnchor.constraint(equalTo: container.centerYAnchor),
      rowLabel.widthAnchor.constraint(equalToConstant: 64),
      button.leadingAnchor.constraint(equalTo: rowLabel.trailingAnchor, constant: 8),
      button.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -8),
      button.topAnchor.constraint(equalTo: container.topAnchor, constant: 2),
      button.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -2),
    ])
    return (container, button)
  }

  @objc private func onTransformSelectorTap() {
    refreshTransformationMenus()
    transformationBackdrop.alpha = 0
    transformationBackdrop.isHidden = false
    UIView.animate(withDuration: 0.16) {
      self.transformationBackdrop.alpha = 1
    }
    UIAccessibility.post(notification: .screenChanged, argument: formatPickerButton)
  }

  @objc private func onTransformationBackdropTap(_ sender: UIControl, event: UIEvent) {
    guard let touch = event.allTouches?.first else { return }
    if !transformationPanel.frame.contains(touch.location(in: transformationBackdrop)) {
      dismissTransformationPanel()
    }
  }

  @objc private func onDoneTransformationTap() {
    dismissTransformationPanel()
  }

  private func dismissTransformationPanel() {
    UIView.animate(
      withDuration: 0.14,
      animations: {
        self.transformationBackdrop.alpha = 0
      }
    ) { _ in
      self.transformationBackdrop.isHidden = true
      UIAccessibility.post(notification: .layoutChanged, argument: self.transformSelectorButton)
    }
  }

  private func updateTransformationSummary() {
    guard transformSummaryLabel != nil else { return }
    let formatName = keyboardFormats.first { $0.id == selectedFormatId }?.name ?? "Sin formato"
    let styleName: String
    if let workflow = manualWorkflows.first(where: { $0.id == selectedWorkflowId }) {
      styleName = "Smart · \(workflow.name)"
    } else if let toneId = selectedToneId, let tone = toneById[toneId] {
      styleName = tone.name
    } else {
      styleName = "Sin estilo"
    }
    let summary = "\(formatName) · \(styleName)"
    transformSummaryLabel.text = summary
    transformSelectorButton.accessibilityValue = summary
    refreshTransformationMenus()
  }

  private func refreshTransformationMenus() {
    guard formatPickerButton != nil, stylePickerButton != nil else { return }
    let noFormat = UIAction(title: "Sin formato", state: selectedFormatId == nil ? .on : .off) {
      [weak self] _ in
      self?.selectFormat(nil)
    }
    let formats = keyboardFormats.map { format in
      UIAction(title: format.name, state: format.id == selectedFormatId ? .on : .off) {
        [weak self] _ in
        self?.selectFormat(format.id)
      }
    }
    formatPickerButton.menu = UIMenu(
      title: "Formato", options: .singleSelection, children: [noFormat] + formats)
    formatPickerButton.setTitle(
      keyboardFormats.first { $0.id == selectedFormatId }?.name ?? "Sin formato", for: .normal)

    let noStyle = UIAction(
      title: "Sin estilo", state: selectedToneId == nil && selectedWorkflowId == nil ? .on : .off
    ) { [weak self] _ in
      self?.selectStyle(toneId: nil, workflowId: nil)
    }
    let workflows = manualWorkflows.map { workflow in
      UIAction(
        title: "Smart · \(workflow.name)", state: workflow.id == selectedWorkflowId ? .on : .off
      ) { [weak self] _ in
        self?.selectStyle(toneId: nil, workflowId: workflow.id)
      }
    }
    let tones = activeToneIds.compactMap { toneId -> UIAction? in
      guard let tone = toneById[toneId] else { return nil }
      return UIAction(
        title: tone.name, state: toneId == selectedToneId && selectedWorkflowId == nil ? .on : .off
      ) { [weak self] _ in
        self?.selectStyle(toneId: toneId, workflowId: nil)
      }
    }
    stylePickerButton.menu = UIMenu(
      title: "Estilo", options: .singleSelection, children: [noStyle] + workflows + tones)
    if let workflow = manualWorkflows.first(where: { $0.id == selectedWorkflowId }) {
      stylePickerButton.setTitle("Smart · \(workflow.name)", for: .normal)
    } else if let toneId = selectedToneId, let tone = toneById[toneId] {
      stylePickerButton.setTitle(tone.name, for: .normal)
    } else {
      stylePickerButton.setTitle("Sin estilo", for: .normal)
    }
  }

  private func selectFormat(_ formatId: String?) {
    selectedFormatId = formatId
    UserDefaults(suiteName: DictationConstants.appGroupId)?.set(
      formatId, forKey: "looper_selected_format_id")
    updateTransformationSummary()
  }

  private func selectStyle(toneId: String?, workflowId: String?) {
    selectedToneId = toneId
    selectedWorkflowId = workflowId
    if let defaults = UserDefaults(suiteName: DictationConstants.appGroupId) {
      defaults.set(toneId, forKey: "looper_selected_tone_id")
      defaults.set(workflowId, forKey: "looper_selected_workflow_id")
    }
    updateTransformationSummary()
  }

  private func applyPillVisual(_ visual: PillVisual, animated: Bool) {
    let changes: () -> Void
    switch visual {
    case .idle:
      changes = {
        self.waveformView.alpha = 0
        self.waveformView.isActive = false
        self.progressView.alpha = 0
        self.pillButton.backgroundColor = Palette.accent
        self.pillLabel.text = "Listo para dictar"
        self.pillLabel.alpha = 1
        self.controlIconView.image = UIImage(systemName: "mic.fill")
        self.controlIconView.alpha = 1
        self.controlActivityIndicator.stopAnimating()
        self.pillButton.isUserInteractionEnabled = true
        self.transformSelectorButton.isEnabled = true
        self.transformSelectorButton.alpha = 1
        self.pillButton.accessibilityLabel = "Empezar a dictar"
        self.pillButton.accessibilityValue = "Ready"
        self.pillButton.accessibilityTraits = .button
      }
      progressView.stopAnimating()

    case .recording:
      changes = {
        self.waveformView.alpha = 1
        self.waveformView.isActive = true
        self.progressView.alpha = 0
        self.pillButton.backgroundColor = Palette.accent
        self.pillLabel.text = "Escuchando"
        self.pillLabel.alpha = 1
        self.controlIconView.image = UIImage(systemName: "stop.fill")
        self.controlIconView.alpha = 1
        self.controlActivityIndicator.stopAnimating()
        self.pillButton.isUserInteractionEnabled = true
        self.transformSelectorButton.isEnabled = false
        self.transformSelectorButton.alpha = 0.48
        self.pillButton.accessibilityLabel = "Terminar el dictado"
        self.pillButton.accessibilityValue = "Escuchando"
        self.pillButton.accessibilityTraits = .button
      }
      progressView.stopAnimating()

    case .loading:
      changes = {
        self.waveformView.alpha = 0
        self.waveformView.isActive = false
        self.progressView.alpha = 1
        self.pillButton.backgroundColor = Palette.surfaceElevated
        self.pillLabel.text = "Preparando tu texto"
        self.pillLabel.alpha = 1
        self.controlIconView.alpha = 0
        self.controlActivityIndicator.startAnimating()
        self.pillButton.isUserInteractionEnabled = false
        self.transformSelectorButton.isEnabled = false
        self.transformSelectorButton.alpha = 0.48
        self.pillButton.accessibilityLabel = "Procesando el dictado"
        self.pillButton.accessibilityValue = "Procesando"
        self.pillButton.accessibilityTraits = [.button, .notEnabled]
      }
      progressView.startAnimating()

    case .error(let message):
      changes = {
        self.waveformView.alpha = 0
        self.waveformView.isActive = false
        self.progressView.alpha = 0
        self.pillButton.backgroundColor = UIColor.systemRed
        self.pillLabel.text = message
        self.pillLabel.alpha = 1
        self.controlIconView.image = UIImage(systemName: "exclamationmark")
        self.controlIconView.alpha = 1
        self.controlActivityIndicator.stopAnimating()
        self.pillButton.isUserInteractionEnabled = true
        self.transformSelectorButton.isEnabled = true
        self.transformSelectorButton.alpha = 1
        self.pillButton.accessibilityLabel = "Error de dictado"
        self.pillButton.accessibilityValue = message
        self.pillButton.accessibilityTraits = .button
      }
      progressView.stopAnimating()
      DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
        self?.applyPillVisual(.idle, animated: true)
      }
    }

    if animated {
      UIView.animate(
        withDuration: 0.18, delay: 0, options: [.beginFromCurrentState, .curveEaseOut],
        animations: changes)
    } else {
      changes()
    }
  }

  // MARK: - Actions

  @objc private func onPillPress(_ gesture: UILongPressGestureRecognizer) {
    switch gesture.state {
    case .began:
      UIView.animate(withDuration: 0.1, delay: 0, options: .curveEaseOut) {
        self.pillButton.transform = CGAffineTransform(scaleX: 0.96, y: 0.96)
      }
    case .ended:
      UIView.animate(
        withDuration: 0.14, delay: 0, options: [.beginFromCurrentState, .curveEaseOut]
      ) {
        self.pillButton.transform = .identity
      }
      let location = gesture.location(in: pillButton)
      if pillButton.bounds.contains(location) {
        switch dictationPhase {
        case .idle, .active:
          startKeyboardRecording()
        case .recording:
          stopKeyboardRecording()
        }
      }
    case .cancelled, .failed:
      UIView.animate(
        withDuration: 0.14, delay: 0, options: [.beginFromCurrentState, .curveEaseOut]
      ) {
        self.pillButton.transform = .identity
      }
    default: break
    }
  }

  private func startKeyboardRecording() {
    guard hasFullAccess else {
      applyPillVisual(.error("Enable Full Access in Settings"), animated: true)
      return
    }

    let audioSession = AVAudioSession.sharedInstance()
    switch audioSession.recordPermission {
    case .granted:
      beginKeyboardRecording()
    case .undetermined:
      audioSession.requestRecordPermission { [weak self] granted in
        DispatchQueue.main.async {
          guard let self else { return }
          guard granted else {
            self.applyPillVisual(.error("Microphone access is required"), animated: true)
            return
          }
          self.beginKeyboardRecording()
        }
      }
    default:
      applyPillVisual(.error("Microphone access is required"), animated: true)
    }
  }

  private func beginKeyboardRecording() {
    guard keyboardAudioRecorder == nil,
      let defaults = UserDefaults(suiteName: DictationConstants.appGroupId),
      let audioURL = DictationConstants.audioFileURL
    else {
      applyPillVisual(.error("Recording error — try again"), animated: true)
      return
    }

    do {
      try? FileManager.default.removeItem(at: audioURL)

      let audioSession = AVAudioSession.sharedInstance()
      try audioSession.setCategory(.record, mode: .measurement, options: [])
      try audioSession.setActive(true)

      let recorder = try AVAudioRecorder(
        url: audioURL,
        settings: [
          AVFormatIDKey: kAudioFormatMPEG4AAC,
          AVSampleRateKey: 44_100,
          AVNumberOfChannelsKey: 1,
          AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
        ]
      )
      recorder.isMeteringEnabled = true
      recorder.prepareToRecord()
      guard recorder.record() else {
        throw NSError(
          domain: "LooperKeyboard",
          code: 1,
          userInfo: [NSLocalizedDescriptionKey: "Could not start the recorder"]
        )
      }

      keyboardAudioRecorder = recorder
      keyboardRecordingStartedAt = Date()
      defaults.set(DictationPhase.recording.rawValue, forKey: DictationConstants.phaseKey)
      defaults.set(Date().timeIntervalSince1970, forKey: DictationConstants.startedAtKey)
      defaults.set(Date().timeIntervalSince1970, forKey: DictationConstants.heartbeatKey)
      defaults.set(0, forKey: DictationConstants.audioLevelKey)
      defaults.synchronize()
      startKeyboardRecordingTimer(defaults)
      DarwinNotificationManager.shared.post(DictationConstants.dictationPhaseChanged)
      refreshDictationState()
    } catch {
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
      applyPillVisual(.error("Recording error — try again"), animated: true)
    }
  }

  private func stopKeyboardRecording() {
    guard let recorder = keyboardAudioRecorder,
      let defaults = UserDefaults(suiteName: DictationConstants.appGroupId)
    else {
      return
    }

    recorder.stop()
    keyboardAudioRecorder = nil
    keyboardRecordingStartedAt = nil
    stopKeyboardRecordingTimer()
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)

    defaults.set(DictationPhase.active.rawValue, forKey: DictationConstants.phaseKey)
    defaults.set(Date().timeIntervalSince1970, forKey: DictationConstants.heartbeatKey)
    defaults.set(0, forKey: DictationConstants.audioLevelKey)
    defaults.synchronize()
    DarwinNotificationManager.shared.post(DictationConstants.dictationPhaseChanged)
    refreshDictationState()
  }

  private func startKeyboardRecordingTimer(_ defaults: UserDefaults) {
    stopKeyboardRecordingTimer()
    keyboardRecordingTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) {
      [weak self] _ in
      guard let self, let recorder = self.keyboardAudioRecorder else { return }

      if let startedAt = self.keyboardRecordingStartedAt,
        Date().timeIntervalSince(startedAt) >= DictationConstants.maxRecordingDuration
      {
        self.stopKeyboardRecording()
        return
      }

      recorder.updateMeters()
      let normalizedLevel = max(0, min(1, pow(10, recorder.averagePower(forChannel: 0) / 20)))
      defaults.set(Float(normalizedLevel), forKey: DictationConstants.audioLevelKey)
      defaults.set(Date().timeIntervalSince1970, forKey: DictationConstants.heartbeatKey)
    }
  }

  private func stopKeyboardRecordingTimer() {
    keyboardRecordingTimer?.invalidate()
    keyboardRecordingTimer = nil
  }

  private func addButtonFeedback(_ button: UIButton) {
    button.addTarget(self, action: #selector(onButtonDown(_:)), for: .touchDown)
    button.addTarget(
      self, action: #selector(onButtonUp(_:)), for: [.touchUpInside, .touchUpOutside, .touchCancel])
  }

  @objc private func onButtonDown(_ sender: UIButton) {
    UIView.animate(
      withDuration: 0.1, delay: 0,
      options: [.curveEaseInOut, .allowUserInteraction, .beginFromCurrentState]
    ) {
      sender.transform = CGAffineTransform(scaleX: 0.9, y: 0.9)
    }
  }

  @objc private func onButtonUp(_ sender: UIButton) {
    UIView.animate(
      withDuration: 0.15, delay: 0, usingSpringWithDamping: 0.6, initialSpringVelocity: 0,
      options: [.allowUserInteraction, .beginFromCurrentState]
    ) {
      sender.transform = .identity
    }
  }

  private func openURL(_ urlString: String) {
    guard let url = URL(string: urlString) else { return }
    var responder: UIResponder? = self
    while let r = responder {
      if let application = r as? UIApplication {
        application.open(url, options: [:], completionHandler: nil)
        return
      }
      responder = r.next
    }

    let selector = NSSelectorFromString("openURL:")
    responder = self
    while let r = responder {
      if r.responds(to: selector) {
        r.perform(selector, with: url)
        return
      }
      responder = r.next
    }
  }

  // MARK: - Keyboard Counter Polling

  private func startKeyboardCounterPoller() {
    appCounterPoller = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
      self?.checkKeyboardCounter()
    }
  }

  private func checkKeyboardCounter() {
    let counter = CounterRepo().getKeyboard()
    if counter != lastAppCounter {
      lastAppCounter = counter
      loadTones()
      loadWorkflows()
      loadLanguage()
      loadDictionary()
      loadSnippets()
    }

    let defaults = UserDefaults(suiteName: DictationConstants.appGroupId)
    let hasPendingSimulatorFixture =
      defaults?.bool(forKey: DictationConstants.keyboardFixtureReadyKey) == true
    if dictationPhase != .idle || hasPendingSimulatorFixture {
      refreshDictationState()
    }
  }

  // MARK: - Dictionary

  private func loadDictionary() {
    guard let defaults = UserDefaults(suiteName: DictationConstants.appGroupId) else { return }
    let loaded = SharedTerm.loadFromDefaults(defaults)
    termIds = loaded.termIds
    termById = loaded.termById
  }

  private func loadSnippets() {
    guard let defaults = UserDefaults(suiteName: DictationConstants.appGroupId) else { return }
    snippets = SharedSnippet.loadFromDefaults(defaults)
  }

  // MARK: - Language Chip

  private func loadLanguage() {
    let defaults = UserDefaults(suiteName: DictationConstants.appGroupId)
    let language = defaults?.string(forKey: "looper_dictation_language") ?? "en"
    dictationLanguages = defaults?.stringArray(forKey: "looper_dictation_languages") ?? ["en"]
    languageChip.setTitle(KeyboardLanguagePolicy.shortCode(for: language), for: .normal)
    let showsLanguageSelector = dictationLanguages.count > 1
    languageChip.isHidden = !showsLanguageSelector
    transformSelectorWithoutLanguageConstraint.isActive = !showsLanguageSelector
    transformSelectorWithLanguageConstraint.isActive = showsLanguageSelector
  }

  @objc private func onLogoButtonTap() {
    openURL("looper://open")
  }

  @objc private func onLanguageChipTap() {
    let defaults = UserDefaults(suiteName: DictationConstants.appGroupId)
    let current = defaults?.string(forKey: "looper_dictation_language") ?? "en"
    guard let next = KeyboardLanguagePolicy.next(after: current, among: dictationLanguages) else {
      return
    }

    defaults?.set(next, forKey: "looper_dictation_language")
    languageChip.setTitle(KeyboardLanguagePolicy.shortCode(for: next), for: .normal)

    CounterRepo().incrementApp()
  }

  // MARK: - Tone Selector

  private func loadTones() {
    let defaults = UserDefaults(suiteName: DictationConstants.appGroupId)
    let toneData = defaults.flatMap { SharedTone.loadFromDefaults($0) }
    activeToneIds = toneData?.activeToneIds ?? []
    toneById = toneData?.toneById ?? [:]
    let storedToneId = defaults?.string(forKey: "looper_selected_tone_id")
    selectedToneId = activeToneIds.contains(storedToneId ?? "") ? storedToneId : activeToneIds.first
    updateTransformationSummary()
  }

  private func loadWorkflows() {
    guard let defaults = UserDefaults(suiteName: DictationConstants.appGroupId) else { return }
    manualWorkflows = SharedWorkflow.loadFromDefaults(defaults).filter {
      $0.enabled && $0.triggerType == "manual"
    }
    let storedId = defaults.string(forKey: "looper_selected_workflow_id")
    selectedWorkflowId = manualWorkflows.contains(where: { $0.id == storedId }) ? storedId : nil
    if selectedWorkflowId != nil {
      selectedToneId = nil
    }
    updateTransformationSummary()
  }

  // MARK: - Format Selector

  private func loadFormats() {
    let defaults = UserDefaults(suiteName: DictationConstants.appGroupId)
    let storedId = defaults?.string(forKey: "looper_selected_format_id")
    selectedFormatId = keyboardFormats.contains(where: { $0.id == storedId }) ? storedId : nil
    updateTransformationSummary()
  }

  // MARK: - Member Status

  private func startMemberRefreshTimer() {
    memberRefreshTimer?.invalidate()
    memberRefreshTimer = Timer.scheduledTimer(withTimeInterval: 300, repeats: true) {
      [weak self] _ in
      self?.refreshMemberData()
    }
  }

  private func refreshMemberData() {
    fetchIdToken { [weak self] idToken in
      guard let self = self, let idToken = idToken else { return }
      guard let defaults = UserDefaults(suiteName: DictationConstants.appGroupId),
        let convexUrl = defaults.string(forKey: "looper_convex_url")
      else { return }

      let config = RepoConfig(functionUrl: convexUrl, idToken: idToken)
      let repo = MemberRepo(config: config)

      Task {
        do {
          let member = try await repo.getMyMember()

          await MainActor.run {
            self.memberInfo = member
          }
        } catch {
          NSLog("[LooperKB] Failed to refresh member: %@", error.localizedDescription)
        }
      }
    }
  }


  // MARK: - Transcription

  private func dbg(_ msg: String) {
    NSLog("[LooperKB] %@", msg)
    lastDebugLog = msg
  }

  private func keyboardTranscriptionMode(_ requestedMode: String) -> String {
    requestedMode == "local" ? "cloud" : requestedMode
  }

  private func buildTranscribeRepo(
    defaults: UserDefaults,
    config: RepoConfig?,
    modeOverride: String? = nil
  ) -> BaseTranscribeAudioRepo? {
    let requestedMode =
      modeOverride ?? defaults.string(forKey: "looper_ai_transcription_mode") ?? "cloud"
    let mode = keyboardTranscriptionMode(requestedMode)
    if mode == "api",
      let provider = defaults.string(forKey: "looper_ai_transcription_provider"),
      let apiKey = defaults.string(forKey: "looper_ai_transcription_api_key")
    {
      let baseUrl = defaults.string(forKey: "looper_ai_transcription_base_url")
      let model = defaults.string(forKey: "looper_ai_transcription_model")
      let azureRegion = defaults.string(forKey: "looper_ai_transcription_azure_region")
      return ByokTranscribeAudioRepo(
        apiKey: apiKey, provider: provider, baseUrl: baseUrl, modelOverride: model,
        azureRegion: azureRegion)
    }
    guard let config = config else { return nil }
    return CloudTranscribeAudioRepo(config: config)
  }

  private func buildGenerateTextRepo(
    defaults: UserDefaults,
    config: RepoConfig?,
    modeOverride: String? = nil
  ) -> BaseGenerateTextRepo? {
    let mode = modeOverride ?? defaults.string(forKey: "looper_ai_post_processing_mode") ?? "cloud"
    if mode == "api",
      let provider = defaults.string(forKey: "looper_ai_post_processing_provider"),
      let apiKey = defaults.string(forKey: "looper_ai_post_processing_api_key")
    {
      let baseUrl = defaults.string(forKey: "looper_ai_post_processing_base_url")
      let model = defaults.string(forKey: "looper_ai_post_processing_model")
      return ByokGenerateTextRepo(
        apiKey: apiKey, provider: provider, baseUrl: baseUrl, modelOverride: model)
    }
    guard let config = config else { return nil }
    return CloudGenerateTextRepo(config: config)
  }

  private func handleTranscription() {
    guard hasFullAccess else {
      DispatchQueue.main.async {
        self.applyPillVisual(.error("Enable Full Access in Settings"), animated: true)
      }
      return
    }

    let capturedWorkflow = selectedWorkflowId.flatMap { selectedId in
      manualWorkflows.first { $0.id == selectedId }
    }
    let workflowToneIds = [
      "polish": "default",
      "literal": "verbatim",
      "chat": "chat",
      "email": "email",
    ]
    let capturedToneId =
      capturedWorkflow?.transformPreset.flatMap { workflowToneIds[$0] }
      ?? selectedToneId
    let capturedTone = capturedToneId.flatMap { toneById[$0] }
    let capturedFormat = keyboardFormats.first { $0.id == selectedFormatId }
    let capturedSelection = textDocumentProxy.selectedText
    let capturedClipboard =
      capturedWorkflow?.input == "clipboard"
      ? UIPasteboard.general.string
      : nil
    let capturedContextBefore = textDocumentProxy.documentContextBeforeInput

    isProcessing = true
    applyPillVisual(.loading, animated: true)

    guard let defaults = UserDefaults(suiteName: DictationConstants.appGroupId) else {
      DispatchQueue.main.async {
        self.isProcessing = false
        self.applyPillVisual(.error("Setup error — please reinstall"), animated: true)
      }
      return
    }

    guard let audioUrl = DictationConstants.audioFileURL else {
      DispatchQueue.main.async {
        self.isProcessing = false
        self.applyPillVisual(.error("Recording error — try again"), animated: true)
      }
      return
    }

    let configuredTranscriptionMode =
      defaults.string(forKey: "looper_ai_transcription_mode") ?? "cloud"
    let requestedTranscriptionMode: String
    switch capturedWorkflow?.engine {
    case "local": requestedTranscriptionMode = "local"
    case "cloud": requestedTranscriptionMode = "cloud"
    default: requestedTranscriptionMode = configuredTranscriptionMode
    }
    let transcriptionMode = keyboardTranscriptionMode(requestedTranscriptionMode)
    let configuredPostProcessingMode =
      defaults.string(forKey: "looper_ai_post_processing_mode") ?? "cloud"
    let postProcessingMode =
      capturedWorkflow?.deterministicOnly == true
      ? "off"
      : configuredPostProcessingMode
    let shouldPostProcess =
      postProcessingMode != "off"
      && (capturedTone != nil || capturedFormat != nil || capturedWorkflow?.customPrompt != nil)
    let needsCloudAuth =
      transcriptionMode == "cloud" || (shouldPostProcess && postProcessingMode == "cloud")

    let continueWithConfig: (RepoConfig?) -> Void = { [weak self] config in
      guard let self = self else { return }

      guard
        let transcribeRepo = self.buildTranscribeRepo(
          defaults: defaults,
          config: config,
          modeOverride: transcriptionMode
        )
      else {
        DispatchQueue.main.async {
          self.isProcessing = false
          self.applyPillVisual(.error("Transcription not configured"), animated: true)
        }
        return
      }

      let dictationLanguage =
        capturedWorkflow?.language
        ?? defaults.string(forKey: "looper_dictation_language")
        ?? "en"
      let userName = defaults.string(forKey: "looper_user_name") ?? "User"
      let prompt = buildLocalizedTranscriptionPrompt(
        termIds: self.termIds,
        termById: self.termById,
        userName: userName,
        language: dictationLanguage
      )
      let whisperLanguage = mapDictationLanguageToWhisperLanguage(dictationLanguage)

      Task {
        do {
          let rawTranscript = try await transcribeRepo.transcribe(
            audioFileURL: audioUrl,
            prompt: prompt,
            language: whisperLanguage
          )

          guard !rawTranscript.isEmpty else {
            await MainActor.run {
              self.isProcessing = false
              self.applyPillVisual(.idle, animated: true)
            }
            return
          }

          let workflowSource: String
          switch capturedWorkflow?.input {
          case "selection":
            workflowSource =
              capturedSelection?.isEmpty == false ? capturedSelection! : rawTranscript
          case "clipboard":
            workflowSource =
              capturedClipboard?.isEmpty == false ? capturedClipboard! : rawTranscript
          default: workflowSource = rawTranscript
          }
          let formattedTranscript =
            capturedWorkflow?.transformPreset == "literal"
            ? workflowSource.trimmingCharacters(in: .whitespacesAndNewlines)
            : SpokenFormatting.apply(workflowSource, language: dictationLanguage)
          var finalText = formattedTranscript
          do {
            if shouldPostProcess {
              if let generateRepo = self.buildGenerateTextRepo(
                defaults: defaults,
                config: config,
                modeOverride: postProcessingMode
              ) {
                let raw = try await generateRepo.generate(
                  system: buildSystemPostProcessingPrompt(),
                  prompt: buildPostProcessingPrompt(
                    transcript: formattedTranscript,
                    tonePromptTemplate: capturedWorkflow?.customPrompt
                      ?? capturedTone?.promptTemplate,
                    formatPromptTemplate: capturedFormat?.promptTemplate,
                    userNameOverride: userName,
                    languageOverride: dictationLanguage
                  ),
                  jsonResponse: postProcessingJsonResponse
                )
                if let data = raw.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let processed = json["processedTranscription"] as? String
                {
                  finalText = processed.trimmingCharacters(in: .whitespacesAndNewlines)
                } else {
                  self.dbg("Could not parse processedTranscription from JSON, using raw")
                  finalText = raw
                }
              }
            }
          } catch {
            self.dbg("Post-processing failed, using raw transcript: \(error.localizedDescription)")
          }

          finalText = finalText.trimmingCharacters(in: .whitespacesAndNewlines)
          let snippetClipboard: String?
          if let capturedClipboard {
            snippetClipboard = capturedClipboard
          } else if SnippetExpansion.requiresClipboard(self.snippets, in: finalText) {
            snippetClipboard = await MainActor.run { UIPasteboard.general.string }
          } else {
            snippetClipboard = nil
          }
          finalText = SnippetExpansion.apply(
            finalText,
            snippets: self.snippets,
            clipboard: snippetClipboard,
            app: nil,
            selection: capturedSelection
          )
          guard !finalText.isEmpty else {
            await MainActor.run {
              self.isProcessing = false
              self.applyPillVisual(.idle, animated: true)
            }
            return
          }

          if let config = config {
            let tz = TimeZone.current.identifier
            UserRepo(config: config).incrementWordCount(text: finalText, timezone: tz)
          }

          let prepared = DestinationInsertion.prepare(
            finalText,
            contextBefore: capturedContextBefore,
            keyboardType: self.textDocumentProxy.keyboardType ?? .default,
            autocapitalization: self.textDocumentProxy.autocapitalizationType ?? .sentences,
            secure: self.textDocumentProxy.isSecureTextEntry ?? false
          )
          await MainActor.run {
            switch capturedWorkflow?.output {
            case "copy":
              UIPasteboard.general.string = finalText
            default:
              if capturedWorkflow?.output == "insert", let selected = capturedSelection {
                self.textDocumentProxy.adjustTextPosition(byCharacterOffset: selected.count)
              }
              self.textDocumentProxy.insertText(prepared)
              if capturedWorkflow?.autoSendOnInsert == true {
                self.textDocumentProxy.insertText("\n")
              }
            }
            self.isProcessing = false
            self.applyPillVisual(.idle, animated: true)
            self.refreshMemberData()
          }

          TranscriptionRepo().save(
            text: finalText,
            rawTranscript: rawTranscript,
            toneId: capturedToneId,
            toneName: capturedTone?.name,
            audioSourceUrl: audioUrl
          )
        } catch {
          self.dbg("Transcription failed: \(error.localizedDescription)")
          await MainActor.run {
            self.isProcessing = false
            self.applyPillVisual(.error("Transcription failed — try again"), animated: true)
          }
        }
      }
    }

    if needsCloudAuth {
      fetchIdToken { [weak self] idToken in
        guard let self = self else { return }
        guard let idToken = idToken else {
          DispatchQueue.main.async {
            self.isProcessing = false
            self.applyPillVisual(.error("Sign in required — open Looper"), animated: true)
          }
          return
        }
        guard let convexUrl = defaults.string(forKey: "looper_convex_url") else {
          DispatchQueue.main.async {
            self.isProcessing = false
            self.applyPillVisual(.error("Setup error — open Looper"), animated: true)
          }
          return
        }
        continueWithConfig(RepoConfig(functionUrl: convexUrl, idToken: idToken))
      }
    } else {
      continueWithConfig(nil)
    }
  }

  // MARK: - Authentication

  private func fetchIdToken(completion: @escaping (String?) -> Void) {
    if let token = cachedIdToken, let expiry = cachedIdTokenExpiry, Date() < expiry {
      completion(token)
      return
    }

    guard let defaults = UserDefaults(suiteName: DictationConstants.appGroupId) else {
      dbg("UserDefaults not accessible")
      completion(nil)
      return
    }

    guard let refreshToken = defaults.string(forKey: "looper_convex_refresh_token"),
      let convexUrl = defaults.string(forKey: "looper_convex_url")
    else {
      dbg("Missing auth keys in UserDefaults")
      completion(nil)
      return
    }

    refreshConvexSession(convexUrl: convexUrl, refreshToken: refreshToken) {
      [weak self] idToken, nextRefreshToken in
      guard let self = self, let idToken = idToken, let nextRefreshToken = nextRefreshToken else {
        completion(nil)
        return
      }
      // Convex rotates the refresh token on every use — the old one is
      // invalidated, so the next refresh must use this new value.
      defaults.set(nextRefreshToken, forKey: "looper_convex_refresh_token")
      self.cachedIdToken = idToken
      self.cachedIdTokenExpiry = (self.jwtExpiry(idToken) ?? Date().addingTimeInterval(3600))
        .addingTimeInterval(-60)
      completion(idToken)
    }
  }

  private func refreshConvexSession(
    convexUrl: String, refreshToken: String, completion: @escaping (String?, String?) -> Void
  ) {
    guard
      let request = KeyboardSessionWire.makeRefreshRequest(
        baseURL: convexUrl,
        refreshToken: refreshToken
      )
    else {
      dbg("refreshConvexSession: invalid URL")
      completion(nil, nil)
      return
    }

    URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
      if let error = error {
        self?.dbg("refreshConvexSession: \(error.localizedDescription)")
        completion(nil, nil)
        return
      }
      guard let data, let tokens = KeyboardSessionWire.decodeTokens(from: data) else {
        let errorMessage = KeyboardSessionWire.errorMessage(in: data ?? Data())
        self?.dbg("refreshConvexSession: \(errorMessage ?? "unexpected response")")
        completion(nil, nil)
        return
      }
      completion(tokens.idToken, tokens.refreshToken)
    }.resume()
  }

  private func jwtExpiry(_ jwt: String) -> Date? {
    KeyboardSessionWire.expiry(of: jwt)
  }

  // MARK: - Audio Level Polling

  private func startAudioLevelPolling() {
    stopAudioLevelPolling()
    smoothedAudioLevel = 0
    audioLevelTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
      guard let self = self else { return }
      let defaults = UserDefaults(suiteName: DictationConstants.appGroupId)
      let raw = CGFloat(defaults?.float(forKey: DictationConstants.audioLevelKey) ?? 0)
      self.smoothedAudioLevel += (raw - self.smoothedAudioLevel) * 0.3
      self.waveformView?.updateLevel(self.smoothedAudioLevel)
    }
  }

  private func stopAudioLevelPolling() {
    audioLevelTimer?.invalidate()
    audioLevelTimer = nil
  }

  // MARK: - Darwin Notification Observers

  private func startDarwinObservers() {
    DarwinNotificationManager.shared.observe(DictationConstants.dictationPhaseChanged) {
      [weak self] in
      self?.handlePhaseChange()
    }
  }

  private func handlePhaseChange() {
    refreshDictationState()
  }

  // MARK: - System

  override func viewWillLayoutSubviews() {
    super.viewWillLayoutSubviews()
    let showGlobe = needsInputModeSwitchKey
    nextKeyboardButton?.isHidden = !showGlobe
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    if keyboardAudioRecorder?.isRecording == true {
      stopKeyboardRecording()
    }
    appCounterPoller?.invalidate()
    appCounterPoller = nil
    memberRefreshTimer?.invalidate()
    memberRefreshTimer = nil
    DarwinNotificationManager.shared.removeObserver(DictationConstants.dictationPhaseChanged)
    stopAudioLevelPolling()
    waveformView.stopAnimating()
    progressView.stopAnimating()
  }

  override func textWillChange(_ textInput: UITextInput?) {}
  override func textDidChange(_ textInput: UITextInput?) {}
}
