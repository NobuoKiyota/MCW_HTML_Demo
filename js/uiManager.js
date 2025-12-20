/**
 * UI Manager
 * Handles Global Navigation, Menu Toggling, and Section Switching (SPA behavior)
 */
class UIManager {
    constructor() {
        this.menuButton = document.getElementById('menuButton');
        this.navOverlay = document.getElementById('globalNav');
        this.navLinks = document.querySelectorAll('.nav-link');
        this.sections = document.querySelectorAll('.page-section');

        this.isMenuOpen = false;

        this.init();
    }

    init() {
        if (!this.menuButton || !this.navOverlay) {
            console.warn('UIManager: Menu elements not found.');
            return;
        }

        // Menu Toggle
        this.menuButton.addEventListener('click', () => this.toggleMenu());

        // Navigation Links
        this.navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = link.getAttribute('data-target');
                this.navigateTo(targetId);
                this.closeMenu();
            });
        });
    }

    toggleMenu() {
        this.isMenuOpen = !this.isMenuOpen;
        if (this.isMenuOpen) {
            this.menuButton.classList.add('open');
            this.navOverlay.classList.add('active');
        } else {
            this.closeMenu();
        }
    }

    closeMenu() {
        this.isMenuOpen = false;
        this.menuButton.classList.remove('open');
        this.navOverlay.classList.remove('active');
    }

    navigateTo(sectionId) {
        // 1. Hide all sections & Stop Media
        this.sections.forEach(section => {
            if (section.classList.contains('active')) {
                // Pause any videos/audio playing in the section being hidden
                const mediaElements = section.querySelectorAll('video, audio');
                mediaElements.forEach(media => {
                    if (!media.paused) {
                        media.pause();
                        // Optional: Reset time? media.currentTime = 0;
                    }
                });

                // Stop YouTube iframes
                const iframes = section.querySelectorAll('iframe');
                iframes.forEach(iframe => {
                    // Resetting the src forces the iframe to reload and stop playing
                    const currentSrc = iframe.src;
                    iframe.src = currentSrc;
                });
            }

            section.classList.remove('active');
            // Optional: slightly delay display:none for fade out effects if managed by CSS
            setTimeout(() => {
                if (!section.classList.contains('active')) {
                    section.classList.add('hidden');
                }
            }, 500); // 0.5s transition matches CSS
        });

        // 2. Show target section
        const target = document.getElementById(sectionId);
        if (target) {
            target.classList.remove('hidden');
            // Small delay to allow CSS transition to trigger after removing hidden (display:none)
            requestAnimationFrame(() => {
                target.classList.add('active');
            });
        }

        // Special handling for Home (Interactive Field)
        // If leaving home, maybe pause heavy rendering? 
        // For now, we keep it running in background as requested for "blur" effect later.
        if (sectionId === 'section-home') {
            // Restore Interactive State if needed
        }
    }
}
