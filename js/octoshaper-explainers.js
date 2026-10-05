/* Step-based animated explainers for the OctoShaper docs.
   Markup: <figure class="ct-explainer" data-steps="4" data-interval="3400" data-step="4">…
   Without JavaScript (or with reduced motion) the figure shows its final step and
   every step caption is readable; captions are buttons that jump to a step. */
(function () {
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var figures = document.querySelectorAll('.ct-explainer[data-steps]');
  if (!figures.length) return;

  function setup(figure) {
    var steps = Number(figure.getAttribute('data-steps')) || 1;
    var interval = Number(figure.getAttribute('data-interval')) || 3400;
    var toggle = figure.querySelector('.ct-explainer__toggle');
    var captions = figure.querySelectorAll('.ct-explainer__steps [data-step]');
    var state = { step: steps, playing: !reduced.matches, visible: false, timer: null };

    figure.style.setProperty('--ex-interval', interval + 'ms');

    function show(step) {
      state.step = step;
      figure.setAttribute('data-step', String(step));
      for (var i = 1; i <= steps; i += 1) {
        figure.classList.toggle('is-s' + i, i <= step);
      }
      Array.prototype.forEach.call(captions, function (caption) {
        var current = Number(caption.getAttribute('data-step')) === step;
        caption.classList.toggle('is-current', current);
        var button = caption.querySelector('button');
        if (button) button.setAttribute('aria-current', current ? 'step' : 'false');
      });
      // restart the per-step progress bar
      figure.classList.remove('is-ticking');
      void figure.offsetWidth;
      if (state.playing && state.visible) figure.classList.add('is-ticking');
    }

    function schedule() {
      clearTimeout(state.timer);
      if (!state.playing || !state.visible) {
        figure.classList.remove('is-ticking');
        return;
      }
      figure.classList.add('is-ticking');
      state.timer = setTimeout(function () {
        show(state.step >= steps ? 1 : state.step + 1);
        schedule();
      }, state.step >= steps ? interval * 1.5 : interval);
    }

    function setPlaying(playing) {
      state.playing = playing;
      figure.classList.toggle('is-paused', !playing);
      if (toggle) {
        toggle.setAttribute('aria-pressed', String(!playing));
        toggle.setAttribute('aria-label', playing ? 'Pause animation' : 'Play animation');
        toggle.querySelector('span').textContent = playing ? 'Pause' : 'Play';
      }
      schedule();
    }

    Array.prototype.forEach.call(captions, function (caption) {
      var button = caption.querySelector('button');
      if (!button) return;
      button.addEventListener('click', function () {
        show(Number(caption.getAttribute('data-step')));
        schedule();
      });
    });

    if (toggle) {
      toggle.hidden = false;
      toggle.addEventListener('click', function () {
        setPlaying(!state.playing);
      });
    }

    figure.classList.add('is-ready');
    show(state.playing ? 1 : steps);
    setPlaying(state.playing);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          state.visible = entry.isIntersecting;
          figure.classList.toggle('is-visible', entry.isIntersecting);
          schedule();
        });
      }, { threshold: 0.35 }).observe(figure);
    } else {
      state.visible = true;
      schedule();
    }
  }

  Array.prototype.forEach.call(figures, setup);
}());
