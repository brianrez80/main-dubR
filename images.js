// Image handling utilities

// Parse recipe images from various sources
function parseRecipeImages(...values) {
  for (const value of values) {
    if (!value) continue;
    if (Array.isArray(value)) return value.filter(Boolean);
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch (error) {}
    return [value];
  }
  return [];
}

// Get all images for a recipe
function getRecipeImages(recipe) {
  return parseRecipeImages(recipe.imageUrl, recipe.images, recipe.image);
}

// Compress image file for storage
async function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = function(event) {
      const img = new Image();

      img.onload = function() {
        const canvas = document.createElement('canvas');
        const maxWidth = 900;
        const scale = Math.min(1, maxWidth / img.width);

        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };

      img.onerror = reject;
      img.src = event.target.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Upload multiple images and return URLs
async function uploadSelectedImages(recipeId, files) {
  const imageUrls = [];
  
  for (const file of files) {
    try {
      const uploaded = await uploadImage(recipeId, file);
      if (!uploaded || !uploaded.publicUrl) {
        console.error('Image upload failed for:', file.name);
        return null;
      }
      imageUrls.push(uploaded.publicUrl);
    } catch (err) {
      console.error('Error uploading image:', err);
      return null;
    }
  }
  
  return imageUrls;
}

// Render image HTML
function renderImageHtml(images, recipeName, galleryClass = '') {
  if (!images || images.length === 0) return '';
  const imageHtml = images.map((imageUrl, index) => {
    const image = `<img
      src="${imageUrl}"
      alt="${recipeName}${images.length > 1 ? ` image ${index + 1}` : ''}"
      loading="lazy"
      onerror="this.style.display='none'"
    >`;

    if (!galleryClass) return image;

    return `<a class="recipe-image-link" href="${imageUrl}" target="_blank" rel="noopener noreferrer" aria-label="View full-size ${recipeName}${images.length > 1 ? ` image ${index + 1}` : ''}">${image}</a>`;
  }).join('');

  if (!galleryClass) return imageHtml;

  return `<div class="${galleryClass} ${galleryClass}--${images.length}">${imageHtml}</div>`;
}
