// app.js - CediSmart Interactive JavaScript Logic

document.addEventListener('DOMContentLoaded', () => {
  
  // 1. Dynamic Copyright Year
  const yearElement = document.getElementById('current-year');
  if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
  }

  // 2. Interactive Privacy Balance Masking Simulator
  const toggleBtn = document.getElementById('preview-toggle-btn');
  const amountElement = document.getElementById('preview-amount');
  const incomeElement = document.getElementById('preview-income');
  const expenseElement = document.getElementById('preview-expense');
  let isMasked = false;

  if (toggleBtn && amountElement && incomeElement && expenseElement) {
    toggleBtn.addEventListener('click', () => {
      isMasked = !isMasked;
      
      if (isMasked) {
        // Mask values
        amountElement.textContent = '₵ ••••';
        incomeElement.textContent = '₵ ••••';
        expenseElement.textContent = '₵ ••••';
        
        // Update Button Icon & Label
        toggleBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path>
            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path>
            <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path>
            <line x1="2" y1="2" x2="22" y2="22"></line>
          </svg>
          Show
        `;
      } else {
        // Restore values
        amountElement.textContent = '₵ 24,850.00';
        incomeElement.textContent = '₵ 8,450.00';
        expenseElement.textContent = '₵ 3,120.00';
        
        // Update Button Icon & Label
        toggleBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          Hide
        `;
      }
    });
  }

  // 3. FAQ Accordion Logic
  const faqQuestions = document.querySelectorAll('.faq-question');
  
  faqQuestions.forEach(question => {
    question.addEventListener('click', () => {
      const item = question.parentElement;
      const answer = question.nextElementSibling;
      
      // Close other open items
      document.querySelectorAll('.faq-item').forEach(otherItem => {
        if (otherItem !== item && otherItem.classList.contains('active')) {
          otherItem.classList.remove('active');
          otherItem.querySelector('.faq-answer').style.maxHeight = null;
        }
      });
      
      // Toggle active status
      item.classList.toggle('active');
      
      if (item.classList.contains('active')) {
        answer.style.maxHeight = answer.scrollHeight + 'px';
      } else {
        answer.style.maxHeight = null;
      }
    });
  });

  // 4. Header Scroll styling
  const header = document.querySelector('header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      header.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.3)';
      header.style.padding = '12px 0';
    } else {
      header.style.boxShadow = 'none';
      header.style.padding = '20px 0';
    }
  });

  // 5. Mobile Navigation Menu Toggle
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const navMenu = document.querySelector('.nav-menu');
  const navLinks = document.querySelectorAll('.nav-link');

  if (hamburgerBtn && navMenu) {
    const toggleMenu = () => {
      hamburgerBtn.classList.toggle('open');
      navMenu.classList.toggle('open');
      // Prevent body scroll when menu is open
      document.body.style.overflow = navMenu.classList.contains('open') ? 'hidden' : 'auto';
    };

    hamburgerBtn.addEventListener('click', toggleMenu);

    // Close menu when a link is clicked
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        if (navMenu.classList.contains('open')) {
          toggleMenu();
        }
      });
    });
  }

});

