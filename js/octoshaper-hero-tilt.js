(function () {
  var stage = document.querySelector('.hero-graph-stage');
  var card = stage && stage.querySelector('.hero-graph-window');
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var frame;
  var pointerX;
  var pointerY;

  if (!stage || !card) {
    return;
  }

  function reset() {
    window.cancelAnimationFrame(frame);
    frame = null;
    stage.classList.remove('is-tilting');
    card.style.setProperty('--hero-tilt-x', '0deg');
    card.style.setProperty('--hero-tilt-y', '0deg');
  }

  function renderTilt() {
    var bounds = stage.getBoundingClientRect();
    var horizontal = Math.max(-1, Math.min(1, ((pointerX - bounds.left) / bounds.width - 0.5) * 2));
    var vertical = Math.max(-1, Math.min(1, ((pointerY - bounds.top) / bounds.height - 0.5) * 2));

    card.style.setProperty('--hero-tilt-x', (-vertical * 3.2).toFixed(2) + 'deg');
    card.style.setProperty('--hero-tilt-y', (horizontal * 4.2).toFixed(2) + 'deg');
    stage.classList.add('is-tilting');
    frame = null;
  }

  stage.addEventListener('pointermove', function (event) {
    if (!finePointer.matches || reducedMotion.matches) {
      reset();
      return;
    }

    pointerX = event.clientX;
    pointerY = event.clientY;
    if (!frame) {
      frame = window.requestAnimationFrame(renderTilt);
    }
  });

  stage.addEventListener('pointerleave', reset);
  finePointer.addEventListener('change', reset);
  reducedMotion.addEventListener('change', reset);
}());
