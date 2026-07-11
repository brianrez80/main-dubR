# Testing & Deployment Guide

## Quick Start Testing

### 1. Automated Test Suite
```bash
cd /workspaces/cheryls-recipe-box
node test.js
```
Expected output: ✅ All tests passed! (56/56)

### 2. Browser Test Console
```bash
python3 -m http.server 8000
# Visit: http://localhost:8000/test-console.html
```
Click "Run All Tests" for comprehensive browser-based validation

### 3. Live App Testing
```bash
# Visit: http://localhost:8000/index.html
# PIN: 4912
```

## Manual Testing Checklist

### Authentication
- [ ] App shows PIN screen on first load
- [ ] Wrong PIN shows error message
- [ ] Correct PIN (4912) unlocks app
- [ ] Unlock persists after page refresh
- [ ] Close browser tab clears unlock

### Existing Recipe Features (MUST NOT BREAK)
- [ ] "All Recipes" shows default recipes
- [ ] "Browse by Meat" shows category chips
- [ ] "Browse by Ethnicity" shows cuisine chips
- [ ] Can add new manual recipe
- [ ] Can edit existing recipe
- [ ] Can delete recipe
- [ ] Images upload and display
- [ ] Recipe appears in all relevant searches

### OCR Workflow (New Feature)

#### Upload Phase
- [ ] "Upload Recipe Photo" button visible
- [ ] Form shows contributor name field
- [ ] Multiple image selection works
- [ ] Progress bar appears during upload
- [ ] Upload completes without errors
- [ ] Success message shows
- [ ] Modal closes, returns to home

#### Review Queue
- [ ] "Review Queue" button visible
- [ ] Shows pending draft recipes
- [ ] Shows contributor name
- [ ] Shows original images in thumbnails
- [ ] Shows extracted recipe data

#### Review & Edit
- [ ] "Review & Edit" button accessible
- [ ] Shows original images
- [ ] All fields editable
- [ ] Can modify recipe details
- [ ] "Approve & Publish" moves to published
- [ ] "Delete" removes draft
- [ ] "Cancel" returns to queue
- [ ] Published recipe appears in collection

### UI/UX
- [ ] All buttons are clickable
- [ ] Form validation prevents blank fields
- [ ] Error messages are clear
- [ ] Success messages appear
- [ ] Back-to-top button works (scroll down)
- [ ] Mobile responsive (shrink browser)
- [ ] No layout breaks

### Performance
- [ ] Page loads in < 2 seconds
- [ ] No console errors (F12)
- [ ] Images load without errors
- [ ] Scrolling is smooth
- [ ] No memory leaks

### Browser Compatibility
- [ ] Chrome/Chromium ✅
- [ ] Firefox ✅
- [ ] Safari ✅
- [ ] Edge ✅
- [ ] Mobile browsers (optional)

## Console Testing (F12 → Console tab)

### Check for Errors
Should see NO red errors, only these INFO/SUCCESS messages:
```
[Timestamp] ✓ Initializing Cheryl's Recipe Box...
[Timestamp] ✓ App initialized successfully
[Timestamp] ✓ Loaded X recipes
```

### Manual Debug Commands
```javascript
// Check auth status
console.log(isUnlocked); // Should be: true

// Check loaded recipes
console.log(recipes.length); // Should be: 2+

// Check Supabase connection
const client = getSupabase();
console.log(client); // Should show client object

// Manually test function
await fetchAllRecipes()

// Check UI cache
console.log(ui.homeView); // Should show DOM element

// Check config
console.log(SUPABASE_CONFIG);
```

## Debugging Common Issues

### "Supabase not initialized"
**Fix:** Ensure CDN script loads first before other scripts
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<!-- Then local scripts -->
```

### "Can't read property 'xxx' of undefined"
**Fix:** Check element IDs in HTML match `ui.js`
- Search for element in browser DevTools (Ctrl+Shift+C)
- Verify `id=` matches the cache name in `ui.js`

### Images not uploading
**Fix:** Check browser console for specific error
```javascript
// Test storage access
const client = getSupabase();
const { data } = client.storage.from('recipe-images').getPublicUrl('test');
```

### Review queue empty
**Fix:** Ensure recipes have `status: 'draft'`
```javascript
// Check in console:
console.log(recipes.filter(r => r.status === 'draft'));
```

## Performance Testing

### Load Time
```bash
# Time page load
time curl -s http://localhost:8000/index.html > /dev/null
```
Target: < 1 second

### Network Performance
1. Open DevTools (F12)
2. Go to Network tab
3. Reload page
4. Check:
   - All resources load
   - No 404 errors
   - Total size < 50KB
   - Load time < 2 seconds

### Memory Usage
1. Open DevTools → Performance tab
2. Click record
3. Perform actions (add recipe, upload image)
4. Stop recording
5. Check for memory leaks
6. Should return to baseline after closing modals

## Security Testing

### XSS Prevention
```javascript
// Try entering HTML in recipe name field
// Type: <img src=x onerror=alert('XSS')>
// Should NOT execute - text should be escaped
```

### Storage Security
- Verify Supabase key in config.js is publishable (starts with `sb_publishable_`)
- NO service_role key should be in code
- PIN is visible (OK - not used for security, just UX)

## Deployment Checklist

### Before Production
- [ ] All tests pass
- [ ] No console errors
- [ ] All features work manually
- [ ] Mobile tested
- [ ] Images compress properly
- [ ] Database connection works
- [ ] Review workflow tested end-to-end

### Pre-Release Steps
1. Merge feature branch to main
2. Update version number (if applicable)
3. Create release notes
4. Tag release in Git

### Production Deployment
```bash
# Build (if using build tool)
npm run build

# Deploy to hosting
# Options:
#   - Vercel (git push)
#   - Netlify (git push)
#   - GitHub Pages (push to gh-pages)
#   - Traditional hosting (FTP/SSH)

# Verify
curl https://yourdomain.com/index.html | grep "DOCTYPE"
```

### Post-Deployment
- [ ] Visit live site
- [ ] Test all features
- [ ] Check browser console for errors
- [ ] Monitor error logs
- [ ] Backup database

## Known Limitations & Future Work

### Current Limitations
1. **OCR is placeholder** - Returns mock data, not real OCR
   - Fix: Integrate Tesseract.js or server-side API
2. **Single user workflow** - No multi-user authentication
   - Fix: Add user login, track reviewer
3. **No recipe search** - Only browse by category
   - Fix: Add full-text search
4. **Limited image handling** - No image resize/crop UI
   - Fix: Add image editor

### Performance Improvements
1. Add pagination for large recipe lists
2. Implement virtual scrolling for many items
3. Cache API responses
4. Lazy load recipe details

### Security Improvements
1. Add rate limiting for uploads
2. Scan images for malware
3. Implement CSRF protection
4. Add audit logging
5. Use environment variables for config

## Rollback Procedure

If issues arise after deployment:

### Option 1: Git Revert
```bash
git log --oneline
git revert <commit-hash>
git push
```

### Option 2: Restore Backup
```bash
git checkout main
# Re-deploy from main branch
```

### Option 3: Restore Files
```bash
# Restore original files
cp index-old.html index.html
cp styles-old.css styles.css
# Commit and push
git add .
git commit -m "Rollback to original"
git push
```

## Monitoring & Maintenance

### Daily
- Check error logs
- Monitor database usage
- Test key features

### Weekly
- Review user feedback
- Check performance metrics
- Update dependencies

### Monthly
- Security audit
- Backup database
- Performance optimization

### Quarterly
- Major updates
- New features
- Infrastructure review

## Support & Documentation

### For End Users
1. See [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) for feature overview
2. PIN is provided separately

### For Developers
1. See [ARCHITECTURE.md](./ARCHITECTURE.md) for code organization
2. Check module comments for detailed documentation
3. Run `node test.js` for validation
4. Use `test-console.html` for browser debugging

### API Documentation
- [Supabase JS Client](https://supabase.com/docs/reference/javascript)
- [Supabase Storage](https://supabase.com/docs/guides/storage)
- [Tesseract.js](https://tesseract.projectnaptha.com/) (if integrating OCR)

## Contact & Issues

Report issues with:
1. Description of problem
2. Steps to reproduce
3. Browser/OS info
4. Console error messages (F12)
5. Screenshot if applicable
