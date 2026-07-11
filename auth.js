// PIN Authentication and Session Management

let isUnlocked = false;

function initializeAuth() {
  try {
    if (sessionStorage.getItem(UNLOCK_KEY) === 'true') {
      unlockSite();
    } else {
      if (ui.pinInput) {
        ui.pinInput.focus();
      }
    }
  } catch (error) {
    console.error('Error checking session:', error);
    if (ui.pinInput) {
      ui.pinInput.focus();
    }
  }

  setupAuthEventListeners();
}

function setupAuthEventListeners() {
  if (ui.pinForm) {
    ui.pinForm.addEventListener('submit', (e) => {
      e.preventDefault();
      verifyPin();
    });
  }

  if (ui.pinInput) {
    ui.pinInput.addEventListener('input', (e) => {
      // Only allow numeric input
      ui.pinInput.value = ui.pinInput.value.replace(/\D/g, '').slice(0, 4);
      if (ui.pinError) {
        ui.pinError.textContent = '';
      }
      
      // Auto-submit when 4 digits entered
      if (ui.pinInput.value.length === 4 && ui.pinInput.value === APP_PIN) {
        unlockSite();
      }
    });
  }
}

function verifyPin() {
  if (!ui.pinInput) return false;
  
  const typedPin = ui.pinInput.value.replace(/\D/g, '').trim();
  
  if (typedPin === APP_PIN) {
    unlockSite();
    return true;
  }
  
  if (ui.pinError) {
    ui.pinError.textContent = 'Wrong PIN. Try again.';
  }
  if (ui.pinInput) {
    ui.pinInput.value = '';
    ui.pinInput.focus();
  }
  
  return false;
}

function unlockSite() {
  try {
    sessionStorage.setItem(UNLOCK_KEY, 'true');
  } catch (error) {
    console.error('Error setting session storage:', error);
  }
  
  isUnlocked = true;
  
  if (ui.pinScreen) {
    ui.pinScreen.classList.add('hidden');
    ui.pinScreen.style.display = 'none';
  }
  
  document.body.classList.remove('locked');
}

function isUserAuthenticated() {
  return isUnlocked;
}
