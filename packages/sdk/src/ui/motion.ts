/** Decorative effects never delay or determine the result of an operation. */
function play(element: Element | null, frames: Keyframe[], duration: number) {
  if (
    !element?.isConnected ||
    !element.animate ||
    element.ownerDocument.defaultView?.matchMedia?.(
      '(prefers-reduced-motion: reduce)'
    ).matches
  )
    return
  element.getAnimations?.().forEach(animation => animation.cancel())
  element.animate(frames, { duration, easing: 'cubic-bezier(.2,.7,.3,1)' })
}

export function likeMotion(button: Element | null) {
  play(
    button?.querySelector('.vlike-symbol') || null,
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.25)' },
      { transform: 'scale(1)' },
    ],
    280
  )
  button?.querySelectorAll('.hitalk-like-spark').forEach((heart, index) => {
    const x = [-15, 2, 19][index]
    const y = [-25, -34, -23][index]
    play(
      heart,
      [
        { transform: 'translate(0, 0) scale(.5)', opacity: 0 },
        { opacity: 1, offset: 0.2 },
        { transform: `translate(${x}px, ${y}px) scale(.85)`, opacity: 0 },
      ],
      480
    )
  })
}

export function sendMotion(container: Element) {
  play(
    container.querySelector('.hitalk-send-plane'),
    [
      { transform: 'translate(0, 0)', opacity: 1 },
      {
        transform: 'translate(24px, -20px) rotate(-12deg)',
        opacity: 0,
        offset: 0.45,
      },
      { transform: 'translate(-12px, 10px)', opacity: 0, offset: 0.46 },
      { transform: 'translate(0, 0)', opacity: 1 },
    ],
    500
  )
}
