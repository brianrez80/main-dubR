// Safe URL helpers for recipe videos and original recipe pages.
function normalizeRecipeUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return { url: '', error: '' };

  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
      throw new Error('unsupported protocol');
    }
    return { url: parsed.toString(), error: '' };
  } catch (error) {
    return { url: '', error: 'Please enter a valid link beginning with http:// or https://.' };
  }
}

function getYouTubeEmbedUrl(value) {
  const { url } = normalizeRecipeUrl(value);
  if (!url) return '';

  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  let videoId = '';

  if (host === 'youtu.be') {
    videoId = parsed.pathname.split('/').filter(Boolean)[0] || '';
  } else if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (parsed.pathname === '/watch') videoId = parsed.searchParams.get('v') || '';
    if (parsed.pathname.startsWith('/shorts/')) videoId = parsed.pathname.split('/')[2] || '';
  }

  return /^[A-Za-z0-9_-]{6,128}$/.test(videoId)
    ? `https://www.youtube-nocookie.com/embed/${videoId}`
    : '';
}

function isRecognizedVideoUrl(value) {
  if (getYouTubeEmbedUrl(value)) return true;
  const { url } = normalizeRecipeUrl(value);
  if (!url) return false;

  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const knownVideoHost = [
    'vimeo.com', 'tiktok.com', 'facebook.com', 'fb.watch',
    'instagram.com', 'pinterest.com'
  ].some(domain => host === domain || host.endsWith(`.${domain}`));
  return knownVideoHost || /\.(?:mp4|webm|mov)$/i.test(parsed.pathname) ||
    /\/(?:video|videos|reel|reels|shorts)(?:\/|$)/i.test(parsed.pathname);
}

function classifyRecipeLink(value) {
  const normalized = normalizeRecipeUrl(value);
  if (normalized.error) return { ...normalized, kind: '' };
  return { ...normalized, kind: isRecognizedVideoUrl(normalized.url) ? 'video' : 'source' };
}
