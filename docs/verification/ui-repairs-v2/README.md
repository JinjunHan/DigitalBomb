# Cutouts, layering and complete in-game history — 2026-10-29

`overview.jpg` and the numbered screenshots are actual rebuilt client captures at 390×844, plus a 390×600 gameplay capture. The complete two-client journey is also refreshed in `../journey/`.

## Completed user requests

1. WeChat acquisition/privacy failure messages: corrected notification cutout and moved notices to a dedicated `NoticeLayer` above the modal layer. Notice dismissal/expiry does not close the modal or rebuild the page/native authorization control. Simulated WeChat API failure is captured; this is not real-device authorization verification.
2. Preparation and in-game hands/cards: recut the skin/sleeve boundary to exclude source-card/table remnants; palms under the fan, separate thumbs over it. Selected-card border derives from the current card, shares its aspect and follows the selected card's position/order. All four selection indices and replacement of a selected digit were checked.
3. Record controls: recut “回到最新” with its arrow and border; reconstruct a closed inactive tab from the original artwork. Both my/opponent tab switches and the latest button were clicked and verified.
4. Defeat title: removed background scraps and hard truncation, reconstructed the full reason plate and placed the actual result reason inside it, including non-cracked endings/rematch states.
5. In-game record table: all own guesses are in a native ScrollView, including timeout rows. Three rows are visible at once; there is no `slice(-3)`. Dragging reveals older records. Typing and arriving history preserve a reader's old position; when already at the bottom, new rows are followed. The expanded view still switches between all my/opponent records. New room IDs use separate scroll keys.
6. Bottom notifications: corrected copy/error/turn/confirmation-timeout artwork and kept the full panel above the bottom safe inset on tall/short screens.

## Verification

- `npm test`: 50 passed. Server/client typechecks passed.
- `verify-ui-repairs.cjs`: 20-row history with actual pointer dragging, stable position after typing/new history, follow-bottom behavior, selection replacement, both tabs/latest, simulated WeChat failure notice above a modal and dismiss-only behavior, 390×844 and 390×600 layouts.
- `verify-journey.cjs`: real two-client lobby/profile/friend-room/preparation/guess/reply/draw/records/rematch/leave and queue cancellation passed.
- `verify-wechat-ui.cjs`: native-button mock lifecycle, profile/privacy/share/invitation integration passed.
- `verify-feedback.cjs`: opponent/own feedback, timeouts, endings/cancellation, records/rematch, controls, reconnect suppression, real motion captures, safe bottom inset passed. Updated the notice lookup for its new layer.
- `npm run build:wechat`: passed; main 1978.6 KB, resources 25422.0 KB, total 27400.6 KB (26.76 MiB), 3319.4 KB headroom to 30 MiB. Export `build/wechatgame/`.
- `verify-wechat-feedback.mjs`: main scene, feedback runtime and 44 feedback textures passed. The new thumb resources loaded successfully in the built client.

Source/mask details: `docs/design/ui-repairs-v2/`. No server deployment or release. Local browser validation and WeChat export do not replace WeChat device testing.
