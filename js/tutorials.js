// Load and render tutorial cards
(function() {
  const tutorialsContainer = document.getElementById('tutorials-container');
  
  if (!tutorialsContainer) return;

  fetch('data/tutorials.json')
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to load tutorials');
      }
      return response.json();
    })
    .then(tutorials => {
      // Filter for featured tutorials or show all
      const showFeatured = tutorialsContainer.dataset.featured === 'true';
      const tutorialsToShow = showFeatured 
        ? tutorials.filter(t => t.featured) 
        : tutorials;

      if (tutorialsToShow.length === 0) {
        tutorialsContainer.innerHTML = '<p class="text-center text-brand-gray col-span-full">No tutorials available yet. Check back soon!</p>';
        return;
      }

      tutorialsContainer.innerHTML = tutorialsToShow.map(tutorial => 
        createTutorialCard(tutorial)
      ).join('');
    })
    .catch(error => {
      console.error('Error loading tutorials:', error);
      tutorialsContainer.innerHTML = '<p class="text-center text-brand-gray col-span-full">Unable to load tutorials. Please try refreshing the page.</p>';
    });

  function createTutorialCard(tutorial) {
    const difficultyColors = {
      'Beginner': 'bg-green-100 text-green-800',
      'Intermediate': 'bg-yellow-100 text-yellow-800',
      'Advanced': 'bg-red-100 text-red-800'
    };

    const difficultyClass = difficultyColors[tutorial.difficulty] || 'bg-gray-100 text-gray-800';

    // Create a placeholder for missing thumbnails
    const thumbnailContent = tutorial.thumbnail 
      ? `<img src="${tutorial.thumbnail}" alt="${tutorial.title}" class="w-full h-full object-cover" onerror="this.parentElement.innerHTML='<span class=\\'text-white text-xl font-bold\\'>${tutorial.category}</span>'">`
      : `<span class="text-white text-xl font-bold">${tutorial.category}</span>`;

    return `
      <div class="bg-white border-2 border-brand-border rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow">
        <div class="aspect-video bg-gradient-to-br from-[#8a74d8ff] to-[#8ce2b8] relative flex items-center justify-center">
          ${thumbnailContent}
        </div>
        <div class="p-6">
          <div class="flex items-center gap-2 mb-3">
            <span class="${difficultyClass} text-xs font-bold px-2 py-1 rounded-md">${tutorial.difficulty}</span>
            <span class="text-xs text-brand-gray">⏱️ ${tutorial.duration}</span>
          </div>
          <h3 class="text-xl font-bold text-brand-dark mb-2">${tutorial.title}</h3>
          <p class="text-sm text-brand-gray mb-4 leading-relaxed">${tutorial.description}</p>
          <a href="${tutorial.url}" class="inline-flex items-center text-[#8a74d8ff] font-bold text-sm hover:text-[#5a358c] transition-colors">
            Start Tutorial
            <svg class="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path>
            </svg>
          </a>
        </div>
      </div>
    `;
  }
})();
