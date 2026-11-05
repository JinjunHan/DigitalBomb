# Shader runtime verification — 2026-11-05

Verified the final Web auxiliary build in headless Chrome with Playwright, viewport 390 × 844. The runtime loaded original Cocos art and the new shader; screenshots come from the real renderer. The sequence GIF preserves the measured capture intervals (with a 350 ms hold between transitions). Controlled local client snapshots supplied battle states; no remote service or production data was changed.

- [Overview of all five effects](overview.jpg)
- [Continuous modal paper entrance/exit](paper-transition.gif)

Passed checks:

1. Persistent room/table sprites use live ambient materials and advance their time.
2. Real pointer hold illuminates a button; dragging outside and releasing restores its original material.
3. Profile paper reveals and exits; a settled redraw stays visible. Nickname text survives a redraw during editing.
4. Modal paper entrance/exit follows its existing clock; settled redraw retains progress and exits cleanly.
5. Real room-code key taps produce 1234, trigger the sweep, and delete back to 123.
6. Hit feedback produces a moving golden sweep; zero-hit feedback produces a short red flash.
7. Local countdown pulses in the final five seconds. Rebuilding UI retains the pulse phase; input remains usable. Opponent turn clears the warning.
8. Disabling motion restores original materials, opens/closes modals immediately, and prevents a stale sweep when re-enabled.
9. Rapid modal replacement leaves no orphan surfaces.

Console errors: 0. Console warnings: 0. No observed shader compilation or runtime errors. Full raw captures and test harness remain in `/tmp/digitalbomb-shader-verify/` for this local session.

Limits: this is Web renderer verification, not WeChat developer-tools/physical-device performance validation or a release. Screenshot capture intervals vary with headless rendering and do not establish a mobile frame-rate benchmark.

## Parameter upload optimization

[Measurement and regression record](optimization.json) compares 60 rendered frames before/after optimization. Per-frame material API calls changed from 4 to 1 for each ambient surface, 4 to 0 for a static held button, and 8 to 1 for the urgent timer. This does not measure device FPS or GPU transfers.

The 11 existing runtime checks passed. Five additional checks covered a paper created during `GameApp.update` being hidden before its first draw, in-place UV crop/flip updates, grayscale changes, material restoration/reuse/disposal, and empty/missing-frame recovery. The first-frame test caught Cocos converting a NaN Vec4 cache sentinel to zero; the corrected sentinel now forces the initial zero-coverage upload. Empty-frame fallback was exercised before drawing and replaced with valid art, since the Cocos renderer requires a texture. Final independent recovery/visual-check session had zero errors or warnings. The final gold-sweep screenshot was inspected locally; original artwork and text remained intact.
