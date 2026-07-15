// Load navbar and footer components
(function() {
  // Load navbar
  fetch('components/navbar.html')
    .then(response => response.text())
    .then(html => {
      const navbarContainer = document.getElementById('navbar-container');
      if (navbarContainer) {
        navbarContainer.innerHTML = html;

        const main = document.querySelector('main');
        if (main) {
          main.classList.add('pt-10');
        }

        // Highlight active page in navbar
        const currentPage = window.location.pathname.split('/').pop().replace('.html', '') || 'index';
        const navLinks = document.querySelectorAll('.nav-link');
        
        navLinks.forEach(link => {
          const linkPage = link.getAttribute('data-page');
          if (linkPage === currentPage) {
            link.classList.remove('hover:bg-white/10');
            link.classList.add('bg-white/20', 'font-semibold');
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
