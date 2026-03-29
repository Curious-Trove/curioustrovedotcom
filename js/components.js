// Load navbar and footer components
(function() {
  // Load navbar
  fetch('components/navbar.html')
    .then(response => response.text())
    .then(html => {
      const navbarContainer = document.getElementById('navbar-container');
      if (navbarContainer) {
        navbarContainer.innerHTML = html;
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
