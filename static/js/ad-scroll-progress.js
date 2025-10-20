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
    const sections = document.querySelectorAll('#clientad');
    this.progressBars = Array.from(sections).map(section => {
      const progressBar = section.querySelector('.scroll-progress-fill');
      return {
        section,
        progressBar,
        spacer: section.closest('.scrollmagic-pin-spacer')
      };
    });
    
    return this.progressBars;
  }

  // Update all progress bars based on scroll position
  // Optimized to batch DOM reads and writes to prevent forced reflows
  updateProgressBars() {
    // Refresh the list of progress bars
    this.findProgressBars();
    
    // BATCH READ PHASE - Read all layout properties first
    const scrollY = window.scrollY;
    const windowHeight = window.innerHeight;
    
    const measurements = this.progressBars.map((item) => {
      const { section, progressBar, spacer } = item;
      
      if (!progressBar) return null;
      
      if (spacer) {
        return {
          progressBar,
          spacerTop: spacer.offsetTop,
          spacerHeight: spacer.offsetHeight,
          sectionHeight: section.offsetHeight,
          hasSpace: true
        };
      } else {
        return {
          progressBar,
          sectionTop: section.offsetTop,
          sectionHeight: section.offsetHeight,
          hasSpace: false
        };
      }
    });
    
    // BATCH WRITE PHASE - Update all styles at once
    measurements.forEach((measurement) => {
      if (!measurement) return;
      
      const { progressBar, hasSpace } = measurement;
      
      if (hasSpace) {
        const { spacerTop, spacerHeight } = measurement;
        const visualOffset = 936;
        const scrollStart = spacerTop + visualOffset;
        const scrollEnd = spacerTop + spacerHeight + 200;
        const scrollRange = scrollEnd - scrollStart;
        
        if (scrollRange <= 0) {
          progressBar.style.width = '0%';
          return;
        }
        
        const scrolledIntoSection = scrollY - scrollStart;
        const progress = (scrolledIntoSection / scrollRange) * 100;
        const clampedProgress = Math.max(0, Math.min(100, progress));
        
        progressBar.style.width = `${clampedProgress.toFixed(2)}%`;
      } else {
        const { sectionTop, sectionHeight } = measurement;
        const scrollStart = sectionTop - windowHeight;
        const scrollEnd = sectionTop + sectionHeight;
        const scrollRange = scrollEnd - scrollStart;
        
        if (scrollRange <= 0) {
          progressBar.style.width = '0%';
          return;
        }
        
        const progress = ((scrollY - scrollStart) / scrollRange) * 100;
        const clampedProgress = Math.max(0, Math.min(100, progress));
        
        progressBar.style.width = `${clampedProgress.toFixed(2)}%`;
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
  setTimeout(() => {
    if (window.adScrollProgressManager) {
      window.adScrollProgressManager.refresh();
    }
  }, 500);
});

