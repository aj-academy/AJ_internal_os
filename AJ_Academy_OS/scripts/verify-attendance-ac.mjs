/**
 * Lightweight A–C helper checks (no DB). Run: node scripts/verify-attendance-ac.mjs
 */
import assert from "node:assert/strict";

function roundCoordForCache(value, decimals = 4) {
  const f = 10 ** decimals;
  return (Math.round(value * f) / f).toFixed(decimals);
}

function geocodeCacheKey(latitude, longitude) {
  return `${roundCoordForCache(latitude)},${roundCoordForCache(longitude)}`;
}

function todayDateIST() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function stopCameraStream(stream, video) {
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

assert.equal(roundCoordForCache(13.0827456), "13.0827");
assert.equal(geocodeCacheKey(13.0827456, 80.2707123), "13.0827,80.2707");

const today = todayDateIST();
assert.match(today, /^\d{4}-\d{2}-\d{2}$/);

// Synthetic stream with stoppable tracks
let stopped = 0;
const fakeStream = {
  getTracks() {
    return [
      {
        stop() {
          stopped += 1;
        },
      },
      {
        stop() {
          stopped += 1;
        },
      },
    ];
  },
};
const fakeVideo = { srcObject: fakeStream };
assert.equal(stopCameraStream(fakeStream, fakeVideo), null);
assert.equal(stopped, 2);
assert.equal(fakeVideo.srcObject, null);
assert.equal(stopCameraStream(null, null), null);

// Midnight boundary: IST date must differ from UTC when UTC is previous calendar day
// Example: 2026-08-11T18:30:00.000Z == 2026-08-12 00:00 IST
{
  const sample = new Date("2026-08-11T18:30:00.000Z");
  const ist = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(sample);
  const utcYmd = sample.toISOString().slice(0, 10);
  assert.equal(ist, "2026-08-12");
  assert.equal(utcYmd, "2026-08-11");
  assert.notEqual(ist, utcYmd);
}

console.log(
  JSON.stringify({
    ok: true,
    todayDateIST: today,
    cacheKeySample: geocodeCacheKey(13.0827, 80.2707),
    midnightBoundary: "IST vs UTC date diverge as expected",
  }),
);
