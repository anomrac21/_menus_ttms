// Ad Scroll Progress Bar Manager
class AdScrollProgressManager {
  constructor() {
    this.progressBars = [];
    this.isInitialized = false;
  }

  // Initialize progress bars for all ad sections
  init() {
    this.ticking = false;
    this.updateProgressBars();
    
    // Update on scroll with requestAnimationFrame throttling
    window.addEventListener('scroll', () => {
      if (!this.ticking) {
        window.requestAnimationFrame(() => {
          this.updateProgressBars();
          this.ticking = false;
        });
        this.ticking = true;
      }
    }, { passive: true });
    
    // Update on resize with requestAnimationFrame throttling
    window.addEventListener('resize', () => {
      if (!this.ticking) {
        window.requestAnimationFrame(() => {
          this.updateProgressBars();
          this.ticking = false;
        });
        this.ticking = true;
      }
    }, { passive: true });
    
    this.isInitialized = true;
  }

  // Find all ad sections and their progress bars
  findProgressBars() {
    const sections = document.querySelectorAll('.ads');
    console.log(`[Progress] Found ${sections.length} ad sections`);
    
    this.progressBars = Array.from(sections).map(section => {
      const progressBar = section.querySelector('.scroll-progress-fill');
      if (!progressBar) {
        console.warn('[Progress] Section missing progress bar:', section.id);
      }
      return {
        section,
        progressBar
      };
    });
    
    console.log(`[Progress] Tracking ${this.progressBars.filter(p => p.progressBar).length} progress bars`);
    return this.progressBars;
  }

  // Update all progress bars based on scroll position
  updateProgressBars() {
    // Refresh the list of progress bars
    this.findProgressBars();
    
    const scrollY = window.scrollY;
    const windowHeight = window.innerHeight;
    
    this.progressBars.forEach((item) => {
      const { section, progressBar } = item;
      
      if (!progressBar || !section) return;
      
      // Get section position using bounding rect for accuracy
      const rect = section.getBoundingClientRect();
      
      // Progress should complete within 100vh (one viewport height)
      // Progress starts at 0% when section top is at bottom of viewport
      // Progress reaches 100% when section top reaches top of viewport
      let progress = 0;
      
      if (rect.top <= 0) {
        // Section top has reached or passed viewport top
        progress = 100;
      } else if (rect.top >= windowHeight) {
        // Section hasn't entered viewport yet
        progress = 0;
      } else {
        // Section is in viewport - calculate progress
        // Progress fills as section moves from bottom to top of viewport
        const distanceFromBottom = windowHeight - rect.top;
        progress = (distanceFromBottom / windowHeight) * 100;
      }
      
      const clampedProgress = Math.max(0, Math.min(100, progress));
      progressBar.style.width = `${clampedProgress.toFixed(2)}%`;
      
      // Debug logging (can remove after testing)
      if (section.id && clampedProgress > 0 && clampedProgress < 100) {
        console.log(`[Progress] ${section.id}: ${clampedProgress.toFixed(1)}% (rect.top: ${rect.top.toFixed(0)}px)`);
      }
    });
  }

  // Reinitialize after dynamic content changes (e.g., barba navigation)
  refresh() {
    this.findProgressBars();
    this.updateProgressBars();
  }
}

// Create global instance
window.adScrollProgressManager = new AdScrollProgressManager();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.adScrollProgressManager.init();
  });
} else {
  window.adScrollProgressManager.init();
}

// Refresh after a delay (for dynamically loaded ads)
setTimeout(() => {
  if (window.adScrollProgressManager) {
    window.adScrollProgressManager.refresh();
  }
}, 2000);

// Listen for custom event to refresh progress bars
window.addEventListener('adsPopulated', () => {
  console.log('[Progress] Ads populated event received, refreshing...');
  setTimeout(() => {
    if (window.adScrollProgressManager) {
      window.adScrollProgressManager.refresh();
      console.log('[Progress] Refresh complete after adsPopulated event');
    }
  }, 500);
});

