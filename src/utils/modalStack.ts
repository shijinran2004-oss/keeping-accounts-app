const stack: Array<() => void> = []

export function pushModal(close: () => void) {
  stack.push(close)
}

export function popModal(close: () => void) {
  const i = stack.lastIndexOf(close)
  if (i >= 0) stack.splice(i, 1)
}

export function closeTopModal(): boolean {
  const fn = stack[stack.length - 1]
  if (!fn) return false
  fn()
  return true
}
