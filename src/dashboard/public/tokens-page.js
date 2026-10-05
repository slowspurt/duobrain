// tokens.html: paint each preview from its token, and copy var(--duo-…) when a name is clicked.
// Previews are set through the CSSOM so the page works under the dashboard's CSP and from file://.
for (const node of document.querySelectorAll('[data-paint][data-token]')) {
  node.style.setProperty(node.dataset.paint, `var(${node.dataset.token})`);
}

for (const button of document.querySelectorAll('[data-copy]')) {
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.classList.add('copied');
      setTimeout(() => button.classList.remove('copied'), 900);
    } catch {
      // Clipboard access needs a secure context; the name stays visible to copy by hand.
    }
  });
}
