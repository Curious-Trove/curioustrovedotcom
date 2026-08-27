(function () {
  var carousel = document.getElementById('product-docs-carousel');
  var track = document.getElementById('product-docs-track');
  var previous = document.getElementById('product-docs-previous');
  var next = document.getElementById('product-docs-next');

  if (!carousel || !track || !previous || !next) {
    return;
  }

  function updateControls() {
    var maximum = Math.max(0, carousel.scrollWidth - carousel.clientWidth);
    previous.disabled = carousel.scrollLeft <= 4;
    next.disabled = carousel.scrollLeft >= maximum - 4;
  }

  function scrollByCard(direction) {
    var card = track.querySelector('.docs-carousel-card');
    if (!card) {
      return;
    }

    var gap = parseFloat(window.getComputedStyle(track).columnGap) || 0;
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    carousel.scrollBy({
      left: direction * (card.getBoundingClientRect().width + gap),
      behavior: reducedMotion ? 'auto' : 'smooth'
    });
  }

  previous.addEventListener('click', function () {
    scrollByCard(-1);
  });

  next.addEventListener('click', function () {
    scrollByCard(1);
  });

  carousel.addEventListener('scroll', updateControls, { passive: true });
  window.addEventListener('resize', updateControls);

  window.requestAnimationFrame(updateControls);
}());
