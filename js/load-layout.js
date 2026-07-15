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
        link.classList.remove('hover:bg-white/10');
        link.classList.add('bg-white/20', 'font-semibold');
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

      if (!window.location.pathname.endsWith('/octoshaper/') && !window.location.pathname.endsWith('/octoshaper/index.html')) {
        const main = document.querySelector('main');
        if (main) {
          main.classList.add('pt-10');
        }
      }
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

  function highlightSidebarPage(container) {
    const currentPage = window.location.pathname.split('/').pop().replace('.html', '');
    const links = container.querySelectorAll('nav a[data-sidebar-page]');

    links.forEach(function(link) {
      const page = link.getAttribute('data-sidebar-page');
      if (page === currentPage) {
        link.classList.remove('text-brand-dark', 'hover:bg-[#f8f9fa]');
        link.classList.add('bg-[#f4f0fa]', 'text-[#8a74d8ff]', 'border', 'border-[#8a74d8ff]/20');
      }
    });
  }

  fetch(`${basePath}components/octoshaper-docs-sidebar.html`)
    .then(response => response.text())
    .then(html => {
      const sidebarContainer = document.getElementById('octoshaper-docs-sidebar-container');
      if (!sidebarContainer) {
        return;
      }

      sidebarContainer.innerHTML = prefixRelativePaths(html);
      highlightSidebarPage(sidebarContainer);

      var currentPage = window.location.pathname.split('/').pop().replace('.html', '');

      if (currentPage === 'nodes') {
        var collapsed = sidebarContainer.querySelector('[data-sidebar-page="nodes-collapsed"]');
        var expanded = sidebarContainer.querySelector('[data-sidebar-group="nodes-expanded"]');
        if (collapsed) collapsed.style.display = 'none';
        if (expanded) expanded.classList.remove('hidden');
        var aside = sidebarContainer.querySelector('aside');
        if (aside) {
          aside.classList.add('lg:max-h-[calc(100vh-2rem)]', 'lg:overflow-y-auto');
        }
      }

      window.dispatchEvent(new CustomEvent('octoshaper-sidebar-ready'));
    })
    .catch(error => console.error('Error loading docs sidebar:', error));
})();