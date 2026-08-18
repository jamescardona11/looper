use cidre::{api, cg, cv, ns, sc, vn};

const MAX_CAPTURE_DIMENSION: f64 = 2_560.0;
const MIN_OCR_CONFIDENCE: f32 = 0.35;

fn capture_dimensions(frame: cg::Rect, scale: f64) -> Option<(usize, usize)> {
    let width = frame.width().abs() * scale;
    let height = frame.height().abs() * scale;
    if width < 1.0 || height < 1.0 {
        return None;
    }

    let downscale = (MAX_CAPTURE_DIMENSION / width.max(height)).min(1.0);
    Some((
        (width * downscale).round().max(1.0) as usize,
        (height * downscale).round().max(1.0) as usize,
    ))
}

fn normalize_lines(lines: impl IntoIterator<Item = String>, max_chars: usize) -> Option<String> {
    let mut output = String::new();
    let mut previous = String::new();

    for line in lines {
        let normalized = line.split_whitespace().collect::<Vec<_>>().join(" ");
        if normalized.is_empty() || normalized == previous {
            continue;
        }

        let remaining = max_chars.saturating_sub(output.chars().count());
        if remaining == 0 {
            break;
        }
        if !output.is_empty() {
            output.push('\n');
        }
        output.extend(normalized.chars().take(remaining));
        previous = normalized;
    }

    (!output.trim().is_empty()).then_some(output)
}

fn window_matches(window: &sc::Window, active_bundle_id: Option<&str>, active_title: &str) -> bool {
    if !window.is_on_screen() || window.window_layer() != 0 {
        return false;
    }
    let Some(app) = window.owning_app() else {
        return false;
    };

    let bundle_matches = active_bundle_id
        .is_some_and(|bundle_id| app.bundle_id().to_string().eq_ignore_ascii_case(bundle_id));
    if !bundle_matches {
        return false;
    }

    let title = window
        .title()
        .map(|title| title.to_string())
        .unwrap_or_default();
    active_title.is_empty() || title == active_title || window.is_active()
}

fn display_for_window<'a>(
    displays: &'a ns::Array<sc::Display>,
    window: &sc::Window,
) -> Option<&'a sc::Display> {
    let frame = window.frame();
    let center = cg::Point::new(
        frame.origin.x + frame.width() / 2.0,
        frame.origin.y + frame.height() / 2.0,
    );
    displays
        .iter()
        .find(|display| display.frame().contains_point(&center))
        .or_else(|| displays.first())
}

fn recognize_text(pixel_buffer: &cv::PixelBuf, max_chars: usize) -> Option<String> {
    let mut request = vn::RecognizeTextRequest::new();
    request.set_recognition_level(vn::RequestTextRecognitionLevel::Accurate);
    request.set_uses_lang_correction(true);
    request.set_automatically_detects_lang(true);

    let requests = ns::Array::<vn::Request>::from_slice(&[&request]);
    let handler = vn::ImageRequestHandler::with_cv_pixel_buf(pixel_buffer, None)?;
    handler.perform(&requests).ok()?;

    let results = request.results()?;
    let lines = results.iter().filter_map(|observation| {
        let candidates = observation.top_candidates(1);
        let candidate = candidates.first()?;
        (candidate.confidence() >= MIN_OCR_CONFIDENCE).then(|| candidate.string().to_string())
    });
    normalize_lines(lines, max_chars)
}

pub async fn capture_active_window_text(max_chars: usize) -> Option<String> {
    if max_chars == 0 || !api::version!(macos = 14.0) || !cg::screen_capture_access::preflight() {
        return None;
    }

    let active = crate::accessibility_context::get_active_context()?;
    let content = sc::ShareableContent::current().await.ok()?;
    let windows = content.windows();
    let window = windows
        .iter()
        .find(|window| window_matches(window, active.bundle_id.as_deref(), &active.window_title))?;
    let displays = content.displays();
    let display = display_for_window(&displays, window)?;

    let window_array = ns::Array::from_slice_retained(&[window.retained()]);
    let filter = sc::ContentFilter::with_display_including_windows(display, &window_array);
    let scale = filter.point_pixel_scale() as f64;
    let (width, height) = capture_dimensions(window.frame(), scale)?;

    let mut configuration = sc::StreamCfg::new();
    configuration.set_width(width);
    configuration.set_height(height);
    configuration.set_pixel_format(cv::PixelFormat::_32_BGRA);
    configuration.set_shows_cursor(false);

    let sample = sc::ScreenshotManager::capture_sample_buf(&filter, &configuration)
        .await
        .ok()?;
    recognize_text(sample.image_buf()?, max_chars)
}

#[cfg(test)]
mod tests {
    use super::{capture_dimensions, normalize_lines};
    use cidre::cg;

    #[test]
    fn capture_dimensions_preserve_ratio_and_cap_the_long_edge() {
        assert_eq!(
            capture_dimensions(cg::Rect::new(0.0, 0.0, 2_000.0, 1_000.0), 2.0),
            Some((2_560, 1_280))
        );
        assert_eq!(capture_dimensions(cg::Rect::zero(), 2.0), None);
    }

    #[test]
    fn normalized_ocr_text_is_deduplicated_and_bounded() {
        assert_eq!(
            normalize_lines(
                [
                    "  First   line ".to_string(),
                    "First line".to_string(),
                    "Second line".to_string(),
                ],
                18,
            )
            .as_deref(),
            Some("First line\nSecond l")
        );
        assert_eq!(normalize_lines(["   ".to_string()], 100), None);
    }
}
