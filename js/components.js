// Load navbar and footer components
(function() {
  // Load navbar
  fetch('components/navbar.html')
    .then(response => response.text())
    .then(html => {
      const navbarContainer = document.getElementById('navbar-container');
      if (navbarContainer) {
        navbarContainer.innerHTML = html;
        
        // Highlight active page in navbar
        const currentPage = window.location.pathname.split('/').pop().replace('.html', '') || 'index';
        const navLinks = document.querySelectorAll('.nav-link');
        
        navLinks.forEach(link => {
          const linkPage = link.getAttribute('data-page');
          if (linkPage === currentPage) {
            link.classList.remove('hover:text-white/80');
            link.classList.add('bg-white/20', 'px-3', 'sm:px-4', 'py-1.5', 'sm:py-2', 'rounded-md', 'hover:bg-white/30');
          }
        });
      }
    })
    .catch(error => console.error('Error loading navbar:', error));

  // Load footer
  fetch('components/footer.html')
    .then(response => response.text())
    .then(html => {
      const footerContainer = document.getElementById('footer-container');
      if (footerContainer) {
        footerContainer.innerHTML = html;
      }
    })
    .catch(error => console.error('Error loading footer:', error));
})();
