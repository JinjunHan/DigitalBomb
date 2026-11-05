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
