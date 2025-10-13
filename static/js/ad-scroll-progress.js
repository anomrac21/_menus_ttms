// Ad Scroll Progress Bar Manager
class AdScrollProgressManager {
  constructor() {
    this.progressBars = [];
    this.isInitialized = false;
  }

  // Initialize progress bars for all ad sections
  init() {
    this.updateProgressBars();
    
    // Update on scroll
    window.addEventListener('scroll', () => this.updateProgressBars(), { passive: true });
    
    // Update on resize
    window.addEventListener('resize', () => this.updateProgressBars(), { passive: true });
    
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
  updateProgressBars() {
    // Refresh the list of progress bars
    this.findProgressBars();
    
    const scrollY = window.scrollY;
    const windowHeight = window.innerHeight;
    
    this.progressBars.forEach((item, index) => {
      const { section, progressBar, spacer } = item;
      
      if (!progressBar) return;
      
      // If there's a spacer, use it (ScrollMagic pinned section)
      if (spacer) {
        const spacerTop = spacer.offsetTop;
        const spacerHeight = spacer.offsetHeight;
        const sectionHeight = section.offsetHeight;
        
        // ScrollMagic pins with triggerHook: 'onLeave', offset: -80
        // Progress tracks from when ad is fully visible at top until it leaves
        
        // Based on visual testing: progress should be 0% when ad "fills screen" at the top
        // The ad is considered "filling screen" when it's completely visible and pinned
        // Account for header offset and when user actually sees it as "at top"
        
        // Progress = 0% when ad fills screen (fully visible at top)
        // Progress = 100% when ad is leaving
        
        // Additional offset to match visual perception (header + other elements)
        const visualOffset = 936; // Adjusted so scrollY=1000 = 0%
        const scrollStart = spacerTop + visualOffset; // When ad fills the screen visually
        const scrollEnd = spacerTop + spacerHeight + 200; // When ad leaves (adjusted to reach 100% at scrollY=1618)
        const scrollRange = scrollEnd - scrollStart;
        
        if (scrollRange <= 0) {
          progressBar.style.width = '0%';
          return;
        }
        
        // Calculate how far we've scrolled into the pinned area
        const scrolledIntoSection = scrollY - scrollStart;
        const progress = (scrolledIntoSection / scrollRange) * 100;
        
        // Bar FILLS from 0% to 100% as you scroll through the section
        // 0% when ad is fully visible at top, 100% when ad is leaving
        const clampedProgress = Math.max(0, Math.min(100, progress));
        
        progressBar.style.width = `${clampedProgress.toFixed(2)}%`;
      } else {
        // No spacer - section is not pinned
        const sectionTop = section.offsetTop;
        const sectionHeight = section.offsetHeight;
        
        // Progress from when section enters to when it leaves
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

