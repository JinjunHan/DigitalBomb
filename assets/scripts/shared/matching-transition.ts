/** Foreground transition; the persistent scene runs its own camera movement. */
export const MATCHING_TRANSITION_DURATION = .6;
const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
export function matchingTransition(elapsed: number) {
  const outgoing = ease(elapsed / .32);
  const incoming = ease((elapsed - .08) / (MATCHING_TRANSITION_DURATION - .08));
  return {
    outgoingScale: 1 - .08 * outgoing,
    outgoingOpacity: 1 - outgoing,
    incomingY: 48 * incoming - 48,
    incomingScale: .96 + .04 * incoming,
    incomingOpacity: incoming,
    complete: elapsed >= MATCHING_TRANSITION_DURATION,
  };
}
