# Sudoku Pilot article schema

Each article lives at:

```text
content/articles/<slug>.json
```

## Required fields

```json
{
  "path": "example-article",
  "title": "A direct article title",
  "description": "A concise search description.",
  "published": "2026-07-12",
  "updated": "2026-07-12",
  "eyebrow": "Short category",
  "intro": "A direct answer to the article's search intent.",
  "related": ["related-one", "related-two"],
  "sections": []
}
```

Images are optional. Add `image`, `imageAlt`, and `imageCaption` together only when the screenshot proves or clarifies something in the article. Omit all three fields when an image would be decorative, repetitive, or unrelated to the article's main claim.

`path` must use lowercase letters, numbers, and hyphens. `related` values reference other article paths.

## Sections and blocks

Each section needs a heading and one or more blocks:

```json
{
  "heading": "How the feature works",
  "blocks": [
    {
      "type": "paragraph",
      "text": "State one concrete idea."
    },
    {
      "type": "list",
      "items": ["First item", "Second item"]
    },
    {
      "type": "ordered-list",
      "items": ["First step", "Second step"]
    },
    {
      "type": "link",
      "label": "Open the coach",
      "href": "/"
    }
  ]
}
```

Paragraph and list text is escaped by the renderer. Links accept root-relative paths and `https://` URLs.

## Shared rendering

`scripts/build-content.mjs` owns:

- page HTML;
- header, navigation, and footer;
- metadata and canonical URLs;
- Article structured data;
- image dimensions;
- related-article rendering;
- sitemap and robots output;
- schema and copy validation.

`public/content.css` owns article presentation and responsive behavior.

The shared renderer supplies `Admin` as the public byline and `Sudoku Pilot Admin` as the structured-data author. Article files must remain free of personal names, usernames, and identifying details.

## Images

Store published images under `public/images/`. Use a focused filename such as:

```text
sudoku-pilot-hidden-pair-hint-v2.png
```

Add the image's intrinsic width and height to `imageDimensions` in `scripts/build-content.mjs`.
