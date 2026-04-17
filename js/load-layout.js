(function() {
  const body = document.body;
  const basePath = body.dataset.basePath || '';
  const activePage = body.dataset.activePage || window.location.pathname.split('/').pop().replace('.html', '') || 'index';

  function prefixRelativePaths(html) {
    return html
      .replace(/href="(?!https?:|mailto:|tel:|#|\/)([^"]+)"/g, `href="${basePath}$1"`)
      .replace(/src="(?!https?:|data:|\/)([^"]+)"/g, `src="${basePath}$1"`);
  }

  function highlightActivePage(container) {
    const navLinks = container.querySelectorAll('.nav-link');

    navLinks.forEach(link => {
      const linkPage = link.getAttribute('data-page');
      if (linkPage === activePage) {
        link.classList.remove('hover:text-white/80');
        link.classList.add('bg-white/20', 'px-3', 'sm:px-4', 'py-1.5', 'sm:py-2', 'rounded-md', 'hover:bg-white/30');
      }
    });
  }

  fetch(`${basePath}components/navbar.html`)
    .then(response => response.text())
    .then(html => {
      const navbarContainer = document.getElementById('navbar-container');
      if (!navbarContainer) {
        return;
      }

      navbarContainer.innerHTML = prefixRelativePaths(html);
      highlightActivePage(navbarContainer);
    })
    .catch(error => console.error('Error loading navbar:', error));

  fetch(`${basePath}components/footer.html`)
    .then(response => response.text())
    .then(html => {
      const footerContainer = document.getElementById('footer-container');
      if (!footerContainer) {
        return;
      }

      footerContainer.innerHTML = prefixRelativePaths(html);
    })
    .catch(error => console.error('Error loading footer:', error));
})();