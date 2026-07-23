// OCR Recipe Upload and Processing Workflow

// Initialize OCR module
let ocrState = {
  contributorName: '',
  uploadedFiles: [],
  processingRecipes: []
};

const OCR_SECTION_HEADINGS = {
  ingredients: /^(?:ingredients?|what you(?:'|’)ll need)\s*:?\s*$/i,
  instructions: /^(?:directions?|instructions?|method|preparation)\s*:?\s*$/i
};

const OCR_METADATA_LABELS = [
  'main category',
  'category',
  'cuisine',
  'ethnicity',
  'prep time',
  'cook time',
  'cooking time',
  'total time',
  'servings',
  'yield'
];

function normalizeOCRText(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanOCRLine(line) {
  return String(line || '')
    .replace(/^[•·▪◦*-]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLabeledValue(text, labels) {
  const labelPattern = labels
    .map(label => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const match = text.match(
    new RegExp(`(?:^|\\n|\\|)\\s*(?:${labelPattern})\\s*[:\\-]\\s*([^\\n|]+)`, 'i')
  );

  if (!match) return '';

  const nextLabelPattern = OCR_METADATA_LABELS
    .map(label => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  return match[1]
    .split(new RegExp(`\\s+(?=(?:${nextLabelPattern})\\s*[:\\-])`, 'i'))[0]
    .trim();
}

function findSectionIndex(lines, section) {
  return lines.findIndex(line => OCR_SECTION_HEADINGS[section].test(line));
}

function getSectionLines(lines, startIndex, endIndex) {
  if (startIndex < 0) return [];
  const end = endIndex > startIndex ? endIndex : lines.length;
  return lines.slice(startIndex + 1, end).map(cleanOCRLine).filter(Boolean);
}

function formatInstructionLines(lines) {
  const steps = [];
  let numberedStep = '';

  lines.forEach(line => {
    const cleaned = cleanOCRLine(line);
    if (!cleaned) return;

    const numbered = cleaned.match(/^\d{1,2}[.)]\s*(.+)$/);
    if (numbered) {
      if (numberedStep) steps.push(numberedStep);
      numberedStep = numbered[1].trim();
      return;
    }

    if (numberedStep) {
      numberedStep += ` ${cleaned}`;
    } else {
      steps.push(cleaned);
    }
  });

  if (numberedStep) steps.push(numberedStep);

  return steps
    .map((step, index) => `${index + 1}. ${step}`)
    .join('\n');
}

function findRecipeTitle(lines, text) {
  const explicitTitle = extractLabeledValue(text, ['recipe title', 'title']);
  if (explicitTitle) return explicitTitle;

  const firstSectionIndex = [findSectionIndex(lines, 'ingredients'), findSectionIndex(lines, 'instructions')]
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0] ?? lines.length;

  const candidates = lines.slice(0, firstSectionIndex).filter(line => {
    if (!line || OCR_METADATA_LABELS.some(label =>
      new RegExp(`^${label.replace(/\s+/g, '\\s+')}\\s*[:\\-]`, 'i').test(line)
    )) {
      return false;
    }

    return !/^(?:test kitchen recipe|recipe card|family recipe|recipe)$/i.test(line);
  });

  const titleCandidate = candidates.find((line, index) => {
    const hasCandidateAfterIt = index < candidates.length - 1;
    const looksLikeRecipeKicker = (
      /\brecipe\b/i.test(line) &&
      /\b(?:test|verification|kitchen|family|cookbook|collection|card)\b/i.test(line)
    );
    return !(hasCandidateAfterIt && looksLikeRecipeKicker);
  });

  return cleanOCRLine(titleCandidate || candidates[0] || 'Untitled Recipe');
}

function normalizeMainCategory(explicitValue, text) {
  const direct = MAIN_CATEGORIES.find(
    category => category.toLowerCase() === String(explicitValue || '').toLowerCase()
  );
  if (direct) return direct;

  const haystack = `${explicitValue || ''}\n${text}`.toLowerCase();
  const categoryRules = [
    ['Chicken', /\b(?:chicken|turkey)\b/],
    ['Beef', /\b(?:beef|steak|hamburger|ground beef)\b/],
    ['Pork', /\b(?:pork|ham|bacon|sausage)\b/],
    ['Seafood', /\b(?:shrimp|prawn|crab|lobster|scallop|seafood)\b/],
    ['Fish', /\b(?:fish|salmon|tuna|cod|tilapia|trout)\b/],
    ['Salad', /\bsalad\b/],
    ['Soup', /\b(?:soup|stew|chowder|bisque)\b/],
    ['Breakfast', /\b(?:breakfast|pancake|waffle|omelet|omelette|french toast)\b/],
    ['Vegetarian', /\b(?:vegetarian|vegan|meatless)\b/],
    ['Dessert', /\b(?:dessert|cake|pie|tart|pudding|brownie|cheesecake)\b/],
    ['Sweets', /\b(?:cookie|candy|fudge|sweet)\b/],
    ['Appetizers', /\b(?:appetizer|starter|dip|canape|hors d'oeuvre)\b/],
    ['Side Dish', /\b(?:side dish|side|potatoes|rice|vegetables)\b/]
  ];

  return categoryRules.find(([, pattern]) => pattern.test(haystack))?.[0] || 'Other';
}

function normalizeEthnicity(explicitValue, text) {
  const direct = ETHNICITIES.find(
    ethnicity => ethnicity.toLowerCase() === String(explicitValue || '').toLowerCase()
  );
  if (direct) return direct;

  const haystack = `${explicitValue || ''}\n${text}`.toLowerCase();
  const ethnicityRules = [
    ['Mexican', /\b(?:mexican|taco|enchilada|burrito|salsa)\b/],
    ['Italian', /\b(?:italian|pasta|lasagna|risotto|parmesan)\b/],
    ['Mediterranean', /\b(?:mediterranean|greek|middle eastern|hummus|falafel)\b/],
    ['Asian', /\b(?:asian|chinese|japanese|korean|thai|vietnamese|indian|curry|teriyaki)\b/],
    ['American', /\b(?:american|southern|cajun|creole|barbecue|bbq)\b/]
  ];

  return ethnicityRules.find(([, pattern]) => pattern.test(haystack))?.[0] || 'Other';
}

function parseRecipeText(rawText, confidence = 0) {
  const text = normalizeOCRText(rawText);
  if (!text) {
    throw new Error('No readable text was found in the selected image.');
  }

  const lines = text.split('\n').map(cleanOCRLine).filter(Boolean);
  const ingredientsIndex = findSectionIndex(lines, 'ingredients');
  const instructionsIndex = findSectionIndex(lines, 'instructions');

  let ingredientLines = getSectionLines(lines, ingredientsIndex, instructionsIndex);
  let instructionLines = getSectionLines(lines, instructionsIndex, -1);

  if (ingredientLines.length === 0) {
    const ingredientPattern = /^(?:\d+(?:[ /.]\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])\s*(?:cups?|tablespoons?|tbsp|teaspoons?|tsp|ounces?|oz|pounds?|lb|grams?|g|kilograms?|kg|cloves?|cans?|packages?|large|medium|small)\b/i;
    ingredientLines = lines.filter(line => ingredientPattern.test(line));
  }

  if (instructionLines.length === 0) {
    const instructionPattern = /^(?:\d{1,2}[.)]\s*)?(?:add|bake|beat|blend|boil|combine|cook|fold|heat|mix|place|pour|preheat|serve|stir|whisk)\b/i;
    instructionLines = lines.filter(line => instructionPattern.test(line));
  }

  const categoryValue = extractLabeledValue(text, ['main category', 'category']);
  const ethnicityValue = extractLabeledValue(text, ['cuisine', 'ethnicity']);
  const cookTime = extractLabeledValue(text, ['cook time', 'cooking time', 'total time']);

  return {
    title: findRecipeTitle(lines, text),
    ingredients: ingredientLines.join('\n'),
    instructions: formatInstructionLines(instructionLines),
    cookTime,
    categories: {
      main: normalizeMainCategory(categoryValue, text),
      ethnicity: normalizeEthnicity(ethnicityValue, text)
    },
    confidence: Number.isFinite(confidence) ? Math.round(confidence) : 0,
    rawText: text
  };
}

function mergeParsedRecipePages(pages) {
  const uniqueIngredients = [];
  const instructionSteps = [];

  pages.forEach(page => {
    String(page.ingredients || '').split('\n').filter(Boolean).forEach(ingredient => {
      if (!uniqueIngredients.includes(ingredient)) uniqueIngredients.push(ingredient);
    });

    String(page.instructions || '').split('\n').filter(Boolean).forEach(instruction => {
      const step = instruction.replace(/^\d{1,2}[.)]\s*/, '').trim();
      if (step) instructionSteps.push(step);
    });
  });

  const firstMeaningfulTitle = pages.find(
    page => page.title && page.title !== 'Untitled Recipe'
  )?.title || 'Untitled Recipe';
  const firstKnownCategory = pages.find(
    page => page.categories?.main && page.categories.main !== 'Other'
  )?.categories?.main || 'Other';
  const firstKnownEthnicity = pages.find(
    page => page.categories?.ethnicity && page.categories.ethnicity !== 'Other'
  )?.categories?.ethnicity || 'Other';
  const confidenceValues = pages
    .map(page => page.confidence)
    .filter(Number.isFinite);

  return {
    title: firstMeaningfulTitle,
    ingredients: uniqueIngredients.join('\n'),
    instructions: instructionSteps
      .map((step, index) => `${index + 1}. ${step}`)
      .join('\n'),
    cookTime: pages.find(page => page.cookTime)?.cookTime || '',
    categories: {
      main: firstKnownCategory,
      ethnicity: firstKnownEthnicity
    },
    confidence: confidenceValues.length
      ? Math.round(confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length)
      : 0,
    rawText: pages.map(page => page.rawText).filter(Boolean).join('\n\n')
  };
}

async function performOCR(imageFiles, onProgress) {
  const files = Array.from(
    Array.isArray(imageFiles) ? imageFiles : [imageFiles]
  ).filter(Boolean);

  if (files.length === 0) {
    throw new Error('Please select at least one image.');
  }

  if (!window.Tesseract?.createWorker) {
    throw new Error('The OCR engine did not load. Check your connection and refresh the page.');
  }

  let currentImageIndex = 1;
  const reportProgress = typeof onProgress === 'function' ? onProgress : () => {};
  const oem = window.Tesseract.OEM?.LSTM_ONLY ?? 1;
  const worker = await window.Tesseract.createWorker('eng', oem, {
    logger(message) {
      reportProgress({
        status: message.status || 'Loading OCR engine',
        progress: Number.isFinite(message.progress) ? message.progress : 0,
        imageIndex: currentImageIndex,
        imageCount: files.length
      });
    }
  });

  const recognizedPages = [];

  try {
    for (let index = 0; index < files.length; index += 1) {
      currentImageIndex = index + 1;
      console.log(`Performing OCR on ${files[index].name}`);
      const { data } = await worker.recognize(files[index]);
      if (data?.text?.trim()) {
        recognizedPages.push(parseRecipeText(data.text, data.confidence));
      }
    }
  } finally {
    await worker.terminate();
  }

  if (recognizedPages.length === 0) {
    throw new Error('No readable text was found in the selected image.');
  }

  return mergeParsedRecipePages(recognizedPages);
}

// Create draft recipe from OCR data
async function createDraftFromOCR(images, ocrData, contributorName) {
  const noteSections = [];
  if (ocrData.ingredients) {
    noteSections.push(`Ingredients\n${ocrData.ingredients}`);
  }
  if (ocrData.instructions) {
    noteSections.push(`Instructions\n${ocrData.instructions}`);
  }
  if (noteSections.length === 0 && ocrData.rawText) {
    noteSections.push(ocrData.rawText);
  }

  const recipe = {
    id: generateId(),
    name: ocrData.title || 'Untitled Recipe',
    time: ocrData.cookTime || '',
    mainCategory: ocrData.categories?.main || '',
    ethnicity: ocrData.categories?.ethnicity || '',
    notes: noteSections.join('\n\n'),
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
        <label for="ocrImages">Upload Recipe Images (JPG, PNG, WebP)</label>
        <input type="file" id="ocrImages" name="ocrImages"
               accept="image/jpeg,image/png,image/webp" multiple required>
        <small>Upload up to 4 clear JPG, PNG, or WebP images. OCR runs privately in your browser.</small>
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
  const submitButton = event.submitter;

  if (files.length === 0) {
    alert('Please select at least one image.');
    return;
  }

  if (files.length > 4) {
    alert('Please upload no more than 4 recipe images at a time.');
    return;
  }

  const supportedImage = file => (
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    /\.(?:jpe?g|png|webp)$/i.test(file.name)
  );
  const unsupportedFile = files.find(file => !supportedImage(file));
  if (unsupportedFile) {
    alert(`${unsupportedFile.name} is not a supported image. Please use JPG, PNG, or WebP.`);
    return;
  }

  const oversizedFile = files.find(file => file.size > 12 * 1024 * 1024);
  if (oversizedFile) {
    alert(`${oversizedFile.name} is larger than 12 MB. Please use a smaller image.`);
    return;
  }

  // Show progress
  const progressDiv = document.getElementById('ocrProgress');
  const statusText = document.getElementById('ocrStatus');
  const progressFill = progressDiv?.querySelector('.progress-fill');
  if (progressDiv) {
    progressDiv.classList.remove('hidden');
  }
  if (progressFill) {
    progressFill.style.width = '0%';
  }
  if (submitButton) {
    submitButton.disabled = true;
  }

  try {
    const recipeId = generateId();

    // Extract text locally before uploading, so failed OCR does not leave orphaned images.
    if (statusText) statusText.textContent = 'Loading OCR engine...';
    const ocrResults = await performOCR(files, progress => {
      const overallProgress = (
        (progress.imageIndex - 1 + progress.progress) / progress.imageCount
      );
      const percent = Math.max(0, Math.min(100, Math.round(overallProgress * 100)));
      if (progressFill) progressFill.style.width = `${percent}%`;
      if (statusText) {
        statusText.textContent = `${progress.status} — image ${progress.imageIndex} of ${progress.imageCount} (${percent}%)`;
      }
    });

    // Store the original images after OCR succeeds.
    if (statusText) statusText.textContent = 'Uploading original images...';
    const imageUrls = await uploadSelectedImages(recipeId, files);

    if (!imageUrls) {
      throw new Error('Failed to upload images.');
    }

    // Create draft recipe
    if (statusText) statusText.textContent = 'Creating recipe...';
    const draftRecipe = await createDraftFromOCR(imageUrls, ocrResults, contributorName);

    // Submit for review
    await submitOCRRecipe(draftRecipe);
    if (Array.isArray(recipes)) {
      recipes.push(draftRecipe);
    }

    if (statusText) statusText.textContent = 'Recipe submitted for review!';
    if (progressFill) progressFill.style.width = '100%';
    
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
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
}
