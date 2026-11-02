/** Pequenos utilitários de interface: elementos, diálogos modais e avisos passageiros. */

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of [].concat(children)) if (child != null) node.append(child);
  return node;
}

let openDialogs = 0;
export const isDialogOpen = () => openDialogs > 0;

/**
 * Diálogo modal. Resolve com o `value` do botão escolhido; Esc ou clique fora
 * resolvem com `dismissValue`.
 * @param {{title: string, body?: (Node|string)[], buttons: {label: string, value: any, primary?: boolean, danger?: boolean}[], dismissValue?: any}} options
 */
export function showDialog({ title, body = [], buttons, dismissValue = null }) {
  return new Promise((resolve) => {
    const previous = document.activeElement;
    const close = (value) => {
      openDialogs -= 1;
      document.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      if (previous && previous.focus) previous.focus();
      resolve(value);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close(dismissValue);
      } else if (event.key === 'Tab') {
        const focusable = panel.querySelectorAll('button');
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    const actions = el('div', { class: 'rx-dialog-actions' }, buttons.map((button) =>
      el('button', {
        type: 'button',
        class: `rx-btn${button.primary ? ' rx-btn-primary' : ''}${button.danger ? ' rx-btn-danger' : ''}`,
        text: button.label,
        'data-value': String(button.value),
        onclick: () => close(button.value),
      }),
    ));
    const panel = el('div', { class: 'rx-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
      el('h2', { text: title }),
      el('div', { class: 'rx-dialog-body' }, body.map((part) => (typeof part === 'string' ? el('p', { text: part }) : part))),
      actions,
    ]);
    const backdrop = el('div', { class: 'rx-backdrop', onmousedown: (event) => event.target === backdrop && close(dismissValue) }, [panel]);
    openDialogs += 1;
    document.getElementById('rx-overlays').append(backdrop);
    document.addEventListener('keydown', onKey, true);
    const preferred = panel.querySelector('.rx-btn-primary') || panel.querySelector('button');
    preferred.focus();
  });
}

export function toast(message, { kind = 'info', duration = 5000 } = {}) {
  const host = document.getElementById('rx-toasts');
  const node = el('div', { class: `rx-toast rx-toast-${kind}`, role: kind === 'error' ? 'alert' : 'status', text: message });
  host.append(node);
  setTimeout(() => node.remove(), duration);
  return node;
}

export function warningList(warnings) {
  return el('ul', { class: 'rx-warning-list' }, warnings.map((warning) => el('li', { text: warning.message })));
}
