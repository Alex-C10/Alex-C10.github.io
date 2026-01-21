// Theme toggle functionality - persists across pages via localStorage

(function() {
  // Apply saved theme immediately to prevent flash
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // Create and inject the toggle button once DOM is ready
  document.addEventListener('DOMContentLoaded', function() {
    const button = document.createElement('button');
    button.className = 'theme-toggle';
    button.setAttribute('aria-label', 'Toggle dark mode');
    button.innerHTML = `
      <span class="icon-sun">🌙</span>
      <span class="icon-moon">☀️</span>
    `;
    
    button.addEventListener('click', function() {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
    });
    
    document.body.appendChild(button);
  });
})();
