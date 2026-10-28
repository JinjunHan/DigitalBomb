export const FRIEND_RETURN_DURATION = .64;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const t = clamp(v); return t * t * (3 - 2 * t); };
export function shouldReturnToJoin(previousRoom: string, previousPhase: string, hasRoom: boolean, queued: boolean) {
  return !!previousRoom && previousPhase === 'waiting' && !hasRoom && !queued;
}
export function friendReturnPose(elapsed: number) {
  const out = smooth(elapsed / .46), incoming = smooth((elapsed - .08) / .48), keyboard = smooth((elapsed - .18) / .46);
  return {
    outgoingX: 540 * out, outgoingAngle: -2 * out, outgoingScale: 1 - .05 * out, outgoingOpacity: 1 - out,
    incomingX: -110 * (1 - incoming), incomingOpacity: incoming,
    keyboardY: -45 * (1 - keyboard), keyboardOpacity: keyboard,
    complete: elapsed >= FRIEND_RETURN_DURATION,
  };
}
