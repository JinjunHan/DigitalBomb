/** Seconds on the shared navigation clock. Background is outside all animated groups. */
export const PROFILE_ENTER_DURATION = .8;
export const PROFILE_EXIT_DURATION = PROFILE_ENTER_DURATION;
const ease = (value: number) => .5 - Math.cos(Math.PI * Math.max(0, Math.min(1, value))) / 2;
export function profileTransition(elapsed: number, exiting = false) {
  // Returning samples the same timeline backwards, including the home's .3s hold.
  const time = exiting ? PROFILE_ENTER_DURATION - elapsed : elapsed;
  const body = ease(time / PROFILE_ENTER_DURATION);
  const lobby = ease(time / .5);
  return {
    bodyProgress: exiting ? 1 - body : body,
    bodyScale: 1.2 - .2 * body,
    bodyOpacity: .8 + .2 * body,
    backOpacity: body,
    lobbyScale: 1 - .2 * lobby,
    lobbyOpacity: 1 - lobby,
    complete: elapsed >= (exiting ? PROFILE_EXIT_DURATION : PROFILE_ENTER_DURATION),
  };
}
