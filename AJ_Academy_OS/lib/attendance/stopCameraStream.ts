/**
 * Stop an active MediaStream and detach it from a video element.
 * Safe to call repeatedly (idempotent).
 */
export function stopCameraStream(
  stream: MediaStream | null | undefined,
  video?: HTMLVideoElement | null,
): null {
  if (stream) {
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        /* ignore */
      }
    }
  }
  if (video) {
    try {
      video.srcObject = null;
    } catch {
      /* ignore */
    }
  }
  return null;
}
