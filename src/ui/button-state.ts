export function setButtonBusy(
  btn: HTMLButtonElement,
  busy: boolean,
  busyLabel?: string
): void {
  if (busy) {
    if (!btn.dataset.label) {
      btn.dataset.label = btn.textContent ?? '';
    }
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    if (busyLabel) btn.textContent = busyLabel;
    return;
  }

  btn.disabled = false;
  btn.removeAttribute('aria-busy');
  if (btn.dataset.label) {
    btn.textContent = btn.dataset.label;
  }
}
