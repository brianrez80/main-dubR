// OCR Recipe Upload and Processing Workflow

// Initialize OCR OCR module
let ocrState = {
  contributorName: '',
  uploadedFiles: [],
  processingRecipes: []
};

// Simple OCR simulation - in production, integrate with actual OCR service (e.g., Tesseract.js, Google Vision API)
async function performOCR(imageFile) {
  // For now, return a mock response
  // In production, you would:
  // 1. Use Tesseract.js (client-side) or
  // 2. Send to backend for server-side OCR (Google Cloud Vision, AWS Textract, etc.)
  
  console.log('Performing OCR on:', imageFile.name);
  
  // Simulate OCR results - these would come from actual OCR API
  return {
    title: 'Recipe from ' + imageFile.name,
    ingredients: 'Ingredients detected from image...',
    instructions: 'Instructions extracted from image...',
    cookTime: '45 min',
    categories: {
      main: 'Chicken',
      ethnicity: 'American'
    },
    confidence: 0.85
  };
}

// Create draft recipe from OCR data
async function createDraftFromOCR(images, ocrData, contributorName) {
  const recipe = {
    id: generateId(),
    name: ocrData.title || 'Untitled Recipe',
    time: ocrData.cookTime || '',
    mainCategory: ocrData.categories?.main || '',
    ethnicity: ocrData.categories?.ethnicity || '',
    notes: ocrData.ingredients + '\n\n' + ocrData.instructions,
    status: 'draft',
    ocrText: JSON.stringify(ocrData),
    contributorName: contributorName || 'Anonymous',
    reviewedBy: null,
    reviewedAt: null,
    images: images
  };

  return recipe;
}

// Submit OCR recipe for review
async function submitOCRRecipe(recipe) {
  try {
    await saveNewRecipe(recipe);
    console.log('Recipe submitted for review:', recipe.id);
    return recipe.id;
  } catch (error) {
    console.error('Error submitting OCR recipe:', error);
    throw error;
  }
}

// Approve and publish draft recipe
async function approveDraftRecipe(recipeId, editorName, updates) {
  try {
    const now = new Date().toISOString();
    const updatedRecipe = {
      ...updates,
      status: 'approved',
      reviewedBy: editorName,
      reviewedAt: now
    };

    await updateRecipe(recipeId, updatedRecipe);
    console.log('Recipe approved and published:', recipeId);
    return true;
  } catch (error) {
    console.error('Error approving recipe:', error);
    throw error;
  }
}

// Render OCR upload form
function renderOCRUploadForm() {
  if (!ui.ocrUploadPanel) return;

  const form = ui.ocrUploadPanel.querySelector('[data-ocr-form]');
  if (!form) return;

  form.innerHTML = `
    <form id="ocrUploadForm" class="form">
      <div class="form-section full">
        <label for="contributorName">Your Name (for credit)</label>
        <input type="text" id="contributorName" name="contributorName" 
               placeholder="Optional" maxlength="100">
      </div>

      <div class="form-section full">
        <label for="ocrImages">Upload Recipe Images (JPG, PNG)</label>
        <input type="file" id="ocrImages" name="ocrImages" 
               accept="image/*" multiple required>
        <small>Upload one or more recipe images. OCR will extract text from these.</small>
      </div>

      <div class="form-actions full">
        <button type="button" class="btn secondary" data-cancel-ocr>Cancel</button>
        <button type="submit" class="btn save">Upload & Process with OCR</button>
      </div>
    </form>

    <div id="ocrProgress" class="hidden">
      <div class="progress-bar">
        <div class="progress-fill" style="width: 0%"></div>
      </div>
      <p id="ocrStatus">Processing images...</p>
    </div>
  `;

  const ocrForm = document.getElementById('ocrUploadForm');
  if (ocrForm) {
    ocrForm.addEventListener('submit', handleOCRUpload);
  }

  const cancelBtn = form.querySelector('[data-cancel-ocr]');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      hideAllPanels();
      showPanel(ui.homeView);
    });
  }
}

// Handle OCR upload
async function handleOCRUpload(event) {
  event.preventDefault();

  const contributorNameInput = document.getElementById('contributorName');
  const ocrImagesInput = document.getElementById('ocrImages');
  
  if (!contributorNameInput || !ocrImagesInput) return;

  const contributorName = contributorNameInput.value.trim() || 'Anonymous';
  const files = Array.from(ocrImagesInput.files);

  if (files.length === 0) {
    alert('Please select at least one image.');
    return;
  }

  // Show progress
  const progressDiv = document.getElementById('ocrProgress');
  const statusText = document.getElementById('ocrStatus');
  if (progressDiv) {
    progressDiv.classList.remove('hidden');
  }

  try {
    const recipeId = generateId();
    
    // Upload images
    if (statusText) statusText.textContent = 'Uploading images...';
    const imageUrls = await uploadSelectedImages(recipeId, files);
    
    if (!imageUrls) {
      throw new Error('Failed to upload images.');
    }

    // Process with OCR
    if (statusText) statusText.textContent = 'Processing with OCR...';
    
    // For now, use the first image for OCR
    const ocrResults = await performOCR(files[0]);

    // Create draft recipe
    if (statusText) statusText.textContent = 'Creating recipe...';
    const draftRecipe = await createDraftFromOCR(imageUrls, ocrResults, contributorName);

    // Submit for review
    await submitOCRRecipe(draftRecipe);

    if (statusText) statusText.textContent = 'Recipe submitted for review!';
    
    alert('Recipe submitted for review! An editor will review and approve it shortly.');

    // Reset and go back to home
    setTimeout(() => {
      if (progressDiv) progressDiv.classList.add('hidden');
      hideAllPanels();
      showPanel(ui.homeView);
      ocrImagesInput.value = '';
      if (contributorNameInput) contributorNameInput.value = '';
    }, 2000);

  } catch (error) {
    console.error('OCR upload error:', error);
    if (statusText) {
      statusText.textContent = `Error: ${error.message}`;
    }
    alert(`Error processing recipe: ${error.message}`);
  }
}
