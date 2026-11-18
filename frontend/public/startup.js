(() => {
  const root = document.getElementById('root');
  if (!root) return;

  let failureShown = false;
  const isStillStarting = () => Boolean(root.querySelector('[data-startup-screen]'));

  const showFailure = () => {
    if (failureShown || !isStillStarting()) return;
    failureShown = true;
    window.clearTimeout(startupTimeout);

    const screen = root.querySelector('[data-startup-screen]');
    const title = root.querySelector('[data-startup-title]');
    const detail = root.querySelector('[data-startup-detail]');
    const spinner = root.querySelector('[data-startup-spinner]');
    const retry = root.querySelector('[data-startup-retry]');

    screen?.setAttribute('role', 'alert');
    screen?.setAttribute('aria-live', 'assertive');
    if (title) title.textContent = 'No se pudo abrir LESSSO';
    if (detail) {
      detail.textContent = 'La interfaz no respondió. Comprueba la conexión y vuelve a intentarlo.';
      detail.hidden = false;
    }
    if (spinner) spinner.hidden = true;
    if (retry) retry.hidden = false;
  };

  const startupTimeout = window.setTimeout(showFailure, 12_000);
  const onStartupError = () => showFailure();
  const onStartupRejection = () => showFailure();

  window.addEventListener('error', onStartupError, true);
  window.addEventListener('unhandledrejection', onStartupRejection);
  root.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('[data-startup-retry]')) {
      window.location.reload();
    }
  });

  const observer = new MutationObserver(() => {
    if (isStillStarting()) return;
    window.clearTimeout(startupTimeout);
    window.removeEventListener('error', onStartupError, true);
    window.removeEventListener('unhandledrejection', onStartupRejection);
    observer.disconnect();
  });
  observer.observe(root, { childList: true, subtree: true });
})();
