import '@/ui/tokens.css';
import '@/ui/injected.css';

export function ensureStyles(): void {
  // Tokens and injected UI styles are loaded via the content script CSS bundle.
}

export function showToast(message: string): void {
  const existing = document.querySelector('.curated-toast');
  existing?.remove();

  const toast = document.createElement('div');
  toast.className = 'curated-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}
