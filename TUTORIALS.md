# Adding Tutorials to Curious Trove

This guide explains how to add new tutorials to the website.

## Quick Start

### 1. Add Tutorial Metadata

Edit `data/tutorials.json` and add a new entry:

```json
{
  "id": "your-tutorial-slug",
  "title": "Your Tutorial Title",
  "description": "Brief description of what users will learn",
  "category": "OctoShaper",
  "difficulty": "Beginner",
  "duration": "20 min",
  "thumbnail": "res/tutorials/your-thumbnail.jpg",
  "url": "tutorials/your-tutorial-slug.html",
  "tags": ["unity", "procedural"],
  "publishDate": "2026-03-29",
  "featured": true
}
```

### 2. Create Tutorial Page

Create a new HTML file in the `tutorials/` directory. Use `tutorials/getting-started-octoshaper.html` as a template.

**Important:** Tutorial pages are in a subdirectory, so adjust paths:
- Use `../` prefix for links: `../octoshaper.html`, `../res/logo.svg`
- Components are loaded with adjusted paths (already handled in template)

### 3. Add Thumbnail (Optional)

Place tutorial thumbnail images in `res/tutorials/`. If no thumbnail is provided, a placeholder with the category name will be shown.

## Tutorial Metadata Fields

- **id**: Unique identifier (slug format: lowercase-with-hyphens)
- **title**: Tutorial title displayed on cards and page
- **description**: Short description (1-2 sentences)
- **category**: Category tag (e.g., "OctoShaper", "Unity Tips")
- **difficulty**: One of: "Beginner", "Intermediate", "Advanced"
- **duration**: Estimated completion time (e.g., "15 min", "1 hour")
- **thumbnail**: Path to thumbnail image (optional)
- **url**: Relative URL to tutorial page
- **tags**: Array of searchable tags
- **publishDate**: ISO date format (YYYY-MM-DD)
- **featured**: Boolean - if true, appears on homepage

## Where Tutorials Appear

- **Homepage**: Only tutorials with `"featured": true` are shown
- **Future tutorials page**: Can show all tutorials with filtering

## Testing

After adding a tutorial:
1. Check that it appears on the homepage (if featured)
2. Verify the card links to the correct page
3. Ensure thumbnail loads or placeholder displays
4. Test all links within the tutorial content

## Tutorial Page Structure

Your tutorial HTML should include:
- Page header with category, difficulty, and duration badges
- Clear section headings (h2, h3)
- Step-by-step instructions with numbered lists
- "Next Steps" or "Need Help?" call-to-action at the end
- Links back to products or blog

See `tutorials/getting-started-octoshaper.html` for a complete example.
