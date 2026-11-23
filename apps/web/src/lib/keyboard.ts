type ComposingKeyboardEvent =
  KeyboardEvent | { readonly nativeEvent: KeyboardEvent };

const IME_PROCESS_KEY_CODE = 229;

/**
 * True when a keydown belongs to an active IME composition (for example the
 * Enter that confirms a Japanese, Chinese, or Korean candidate). Safari fires
 * `compositionend` before that Enter keydown and reports `isComposing: false`,
 * so the legacy keyCode 229 is checked as well. Call it inside the Enter
 * branch, before submitting, so other keys and mobile keyboards are untouched.
 */
export function isImeComposing(event: ComposingKeyboardEvent): boolean {
  const native = "nativeEvent" in event ? event.nativeEvent : event;
  return native.isComposing || native.keyCode === IME_PROCESS_KEY_CODE;
}
