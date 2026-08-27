(function() {
  var desktopContainer = document.getElementById('roadmap-desktop');
  var mobileContainer = document.getElementById('roadmap-mobile');

  if (!desktopContainer || !mobileContainer) {
    return;
  }

  var items = [
    {
      date: 'Summer 2026',
      title: 'Unity Release',
      description: 'The full Unity package release with a stable feature set',
      theme: 'green',
      icon: 'unity'
    },
    {
      date: 'September',
      title: 'Colourful Update',
      description: 'Improved Colour support and attribute sync with shader properties',
      theme: 'neutral',
      icon: 'colourful'
    },
    {
      date: 'Fall',
      title: 'The billions update',
      description: 'Mixed instanciation support, and async GPU renders for maximum performance',
      theme: 'purple',
      icon: 'bolt'
    },
    {
      date: '2027',
      title: 'Godot Release',
      description: "Expanding beyond Unity, bring OctoShaper's graph-driven procedural workflow to the Godot engine",
      theme: 'godot',
      icon: 'godot'
    }
  ];

  function unitySvg(cls) {
    return '<svg class="' + cls + '" viewBox="0 0 19 22" fill="none"><path d="M10.3305 3.93605L13.7281 5.94619C13.8503 6.01676 13.8547 6.21254 13.7281 6.28311L9.69098 8.67343C9.56884 8.74627 9.4245 8.74172 9.31124 8.67343L5.27408 6.28311C5.14972 6.21482 5.1475 6.01449 5.27408 5.94619L8.66947 3.93605V0L0 5.13121V15.3936L3.32433 13.4267V9.40646C3.32211 9.26304 3.48644 9.1606 3.60858 9.238L7.64575 11.6283C7.76788 11.7012 7.83672 11.8309 7.83672 11.9652V16.7436C7.83894 16.887 7.67461 16.9894 7.55248 16.912L4.15486 14.9019L0.830529 16.8688L9.5 22L18.1695 16.8688L14.8451 14.9019L11.4475 16.912C11.3276 16.9872 11.1588 16.8893 11.1633 16.7436V11.9652C11.1633 11.8218 11.241 11.6943 11.3543 11.6283L15.3914 9.238C15.5113 9.16287 15.6801 9.25849 15.6757 9.40646V13.4267L19 15.3936V5.13121L10.3305 0V3.93605Z" fill="white"/></svg>';
  }

  function colourfulSvg(cls) {
    return '<svg class="' + cls + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2"/><circle cx="17.5" cy="10.5" r="2"/><circle cx="8.5" cy="7.5" r="2"/><circle cx="6.5" cy="12.5" r="2"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.5-.6 1.5-1.5 0-.4-.1-.7-.3-1-.2-.3-.3-.7-.3-1 0-.8.7-1.5 1.5-1.5H16c3.3 0 6-2.7 6-6 0-5.5-4.5-10-10-10z"/></svg>';
  }

  function boltSvg(cls) {
    return '<svg class="' + cls + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>';
  }

  function godotIcon(cls) {
    return '<img src="../res/godot-icon.png" alt="Godot" class="' + cls + '"/>';
  }

  var themes = {
    green: {
      cardBg: 'unity-roadmap-card',
      cardBorder: 'unity-roadmap-card',
      iconBg: 'unity-roadmap-icon',
      badgeBg: 'unity-roadmap-badge',
      badgeText: 'unity-roadmap-badge',
      badgeBorder: 'unity-roadmap-badge',
      dotBg: 'unity-roadmap-dot',
      ringBorder: 'unity-roadmap-ring'
    },
    neutral: {
      cardBg: 'bg-gradient-to-b from-white to-[#f8f9fa]',
      cardBorder: 'border-brand-border',
      iconBg: 'bg-gradient-to-br from-[#8ce2b8] to-[#8a74d8ff]',
      badgeBg: 'bg-[#f8f9fa]',
      badgeText: 'text-brand-dark',
      badgeBorder: 'border-brand-border',
      dotBg: 'bg-[#8a74d8ff]',
      ringBorder: 'border-[#8a74d8ff]/30'
    },
    purple: {
      cardBg: 'bg-gradient-to-b from-white to-[#f8f9fa]',
      cardBorder: 'border-brand-border',
      iconBg: 'bg-[#8a74d8ff]',
      badgeBg: 'bg-[#f8f9fa]',
      badgeText: 'text-brand-dark',
      badgeBorder: 'border-brand-border',
      dotBg: 'bg-[#8a74d8ff]',
      ringBorder: 'border-[#8a74d8ff]/30'
    },
    godot: {
      cardBg: 'godot-roadmap-card',
      cardBorder: 'godot-roadmap-card',
      iconBg: 'godot-roadmap-icon',
      badgeBg: 'godot-roadmap-badge',
      badgeText: 'godot-roadmap-badge',
      badgeBorder: 'godot-roadmap-badge',
      dotBg: 'godot-roadmap-dot',
      ringBorder: 'godot-roadmap-ring'
    }
  };

  function iconHtml(icon, iconSize, iconBg, hasTextWhite) {
    var textWhite = hasTextWhite ? ' text-white' : '';
    switch (icon) {
      case 'unity':
        return '<div class="flex-shrink-0 ' + iconSize + ' rounded-xl ' + iconBg + ' flex items-center justify-center shadow-sm">' + unitySvg((iconSize === 'w-11 h-11' ? 'w-7 h-7' : 'w-6 h-6') + textWhite) + '</div>';
      case 'colourful':
        return '<div class="flex-shrink-0 ' + iconSize + ' rounded-xl ' + iconBg + ' flex items-center justify-center shadow-sm">' + colourfulSvg((iconSize === 'w-11 h-11' ? 'w-6 h-6' : 'w-5 h-5') + ' text-white') + '</div>';
      case 'bolt':
        return '<div class="flex-shrink-0 ' + iconSize + ' rounded-xl ' + iconBg + ' flex items-center justify-center shadow-sm">' + boltSvg((iconSize === 'w-11 h-11' ? 'w-6 h-6' : 'w-5 h-5') + ' text-white') + '</div>';
      case 'godot':
        return '<div class="flex-shrink-0 ' + iconSize + ' rounded-xl ' + iconBg + ' flex items-center justify-center shadow-sm">' + godotIcon(iconSize === 'w-11 h-11' ? 'w-7 h-7' : 'w-6 h-6') + '</div>';
      default:
        return '';
    }
  }

  function desktopCard(item) {
    var t = themes[item.theme];
    return '<article class="roadmap-card ' + t.cardBg + ' border-2 ' + t.cardBorder + ' rounded-2xl p-5 shadow-md">' +
      '<div class="flex items-center gap-3 mb-4">' +
        iconHtml(item.icon, 'w-11 h-11', t.iconBg, false) +
        '<span class="' + t.badgeBg + ' ' + t.badgeText + ' text-xs font-bold px-3 py-1 rounded-md border ' + t.badgeBorder + '">' + item.date + '</span>' +
      '</div>' +
      '<h3 class="text-lg font-extrabold mb-2">' + item.title + '</h3>' +
      '<p class="text-brand-gray font-medium leading-relaxed text-sm">' + item.description + '</p>' +
    '</article>';
  }

  function desktopDot(item, isFirst) {
    var t = themes[item.theme];
    if (isFirst) {
      return '<div class="flex justify-center items-center">' +
        '<div class="relative">' +
          '<div class="absolute inset-[-5px] rounded-full border-2 ' + t.ringBorder + '"></div>' +
          '<div class="relative z-10 w-5 h-5 rounded-full ' + t.dotBg + ' border-[3px] border-white shadow-md"></div>' +
        '</div>' +
      '</div>';
    }
    return '<div class="flex justify-center items-center">' +
      '<div class="relative z-10 w-4 h-4 rounded-full ' + t.dotBg + ' border-[3px] border-white shadow-md"></div>' +
    '</div>';
  }

  function mobileCard(item, isFirst) {
    var t = themes[item.theme];
    var outerRing = isFirst
      ? '<div class="absolute -left-[calc(2.15rem+5px)] top-[3px] w-[32px] h-[32px] rounded-full border-2 ' + t.ringBorder + '"></div>'
      : '';
    return '<div class="relative">' +
      '<div class="absolute -left-[2.15rem] top-3 w-[22px] h-[22px] rounded-full ' + t.dotBg + ' border-[3px] border-white shadow-md"></div>' +
      outerRing +
      '<article class="roadmap-card ' + t.cardBg + ' border-2 ' + t.cardBorder + ' rounded-2xl p-5 shadow-md">' +
        '<div class="flex items-center gap-3 mb-3">' +
          iconHtml(item.icon, 'w-10 h-10', t.iconBg, false) +
          '<span class="' + t.badgeBg + ' ' + t.badgeText + ' text-xs font-bold px-3 py-1 rounded-md border ' + t.badgeBorder + '">' + item.date + '</span>' +
        '</div>' +
        '<h3 class="text-lg font-extrabold mb-2">' + item.title + '</h3>' +
        '<p class="text-brand-gray font-medium leading-relaxed text-sm">' + item.description + '</p>' +
      '</article>' +
    '</div>';
  }

  // Desktop
  desktopContainer.innerHTML =
    '<div class="grid grid-cols-4 gap-5 mb-0">' +
      items.map(function(item) { return desktopCard(item); }).join('') +
    '</div>' +
    '<div class="relative mt-1 h-10">' +
      '<div class="absolute top-1/2 left-8 right-8 h-1.5 -translate-y-1/2 rounded-full bg-gradient-to-r from-[#8ce2b8] via-[#8a74d8ff] to-[#8a74d8ff]"></div>' +
      '<div class="grid grid-cols-4 gap-5 h-full relative">' +
        items.map(function(item, i) { return desktopDot(item, i === 0); }).join('') +
      '</div>' +
    '</div>';

  // Mobile
  mobileContainer.innerHTML =
    '<div class="absolute left-[11px] top-3 bottom-3 w-1.5 rounded-full bg-gradient-to-b from-[#8ce2b8] via-[#8a74d8ff] to-[#8a74d8ff]"></div>' +
    '<div class="flex flex-col gap-6">' +
      items.map(function(item, i) { return mobileCard(item, i === 0); }).join('') +
    '</div>';
})();
