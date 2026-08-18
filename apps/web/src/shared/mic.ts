// Single entry point for microphone access. Routing every getUserMedia call
// through here keeps error handling consistent and gives permission-only
// callers a leak-free path — a recurring bug was acquiring a stream just to
// trigger the permission prompt and forgetting to stop its tracks, leaving the
// mic "in use".

// Acquire a live mic stream. The caller owns teardown — stop the tracks when
// done (e.g. in a cleanup / disconnect path).
export async function acquireMicStream(
  audio: MediaTrackConstraints | true = true,
): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio });
}

// Prompt for mic permission WITHOUT leaking a stream: acquire, then immediately
// stop every track. Returns true if granted, false if denied/unavailable.
export async function requestMicPermission(): Promise<boolean> {
  try {
    const stream = await acquireMicStream();
    for (const track of stream.getTracks()) track.stop();
    return true;
  } catch {
    return false;
  }
}
