/* Curious Trove — lightweight motion layer.
   Progressive enhancement only: every page is complete without this file. */
(function () {
  var root = document.documentElement;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  root.classList.add('js');

  /* Light / dark theme switch (initial theme is set by an inline head script) */
  var storageKey = 'ct-theme';
  var systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  function storedTheme() {
    try {
      return window.localStorage.getItem(storageKey);
    } catch (error) {
      return null;
    }
  }

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    Array.prototype.forEach.call(document.querySelectorAll('[data-theme-toggle]'), function (button) {
      button.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      button.setAttribute('aria-pressed', String(theme === 'dark'));
    });
  }

  applyTheme(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

  document.addEventListener('click', function (event) {
    var button = event.target.closest && event.target.closest('[data-theme-toggle]');
    if (!button) {
      return;
    }
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch (error) {}
    if (window.umami) {
      window.umami.track('Theme Switched', { theme: next });
    }
  });

  if (systemDark.addEventListener) {
    systemDark.addEventListener('change', function (event) {
      var saved = storedTheme();
      if (saved !== 'light' && saved !== 'dark') {
        applyTheme(event.matches ? 'dark' : 'light');
      }
    });
  }

  /* Navbar: add depth once the page scrolls */
  var nav = document.querySelector('.ct-nav');
  if (nav) {
    var onScroll = function () {
      nav.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  var supportsObserver = 'IntersectionObserver' in window;

  /* Scroll reveal, with optional stagger via data-reveal-stagger on a parent */
  Array.prototype.forEach.call(document.querySelectorAll('[data-reveal-stagger]'), function (group) {
    Array.prototype.forEach.call(group.querySelectorAll(':scope > [data-reveal]'), function (item, index) {
      item.style.setProperty('--reveal-delay', Math.min(index * 90, 450) + 'ms');
    });
  });

  var revealTargets = document.querySelectorAll('[data-reveal], .ct-roadmap');
  if (!supportsObserver || reducedMotion.matches) {
    Array.prototype.forEach.call(revealTargets, function (target) {
      target.classList.add('is-in');
    });
  } else {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    Array.prototype.forEach.call(revealTargets, function (target) {
      revealObserver.observe(target);
    });
  }

  /* Showcase videos: load and play only while visible (they ship with
     preload="none" and native controls as the no-JS fallback). */
  var videos = document.querySelectorAll('video[data-autoplay]');
  if (videos.length && supportsObserver && !reducedMotion.matches) {
    var videoObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var video = entry.target;
        if (entry.isIntersecting) {
          var attempt = video.play();
          if (attempt && attempt.catch) {
            attempt.catch(function () {});
          }
        } else if (!video.paused) {
          video.pause();
        }
      });
    }, { rootMargin: '200px 0px', threshold: 0.2 });

    Array.prototype.forEach.call(videos, function (video) {
      video.muted = true;
      video.removeAttribute('controls');
      videoObserver.observe(video);
    });
  }

  /* Cursor spotlight on cards (fine pointers only) */
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches && !reducedMotion.matches) {
    document.addEventListener('pointermove', function (event) {
      var card = event.target.closest && event.target.closest('.ct-card');
      if (!card) {
        return;
      }
      var bounds = card.getBoundingClientRect();
      card.style.setProperty('--mx', (event.clientX - bounds.left) + 'px');
      card.style.setProperty('--my', (event.clientY - bounds.top) + 'px');
    }, { passive: true });
  }
}());
