# Adora's Grill website

Static page (`public/index.html`) plus one Vercel serverless function (`api/menu.js`) that reads the menu live from the Square catalog. Item names, descriptions, prices and images all come from Square, so menu changes in Square appear on the site within about a minute (60s cache).

## Environment variables (Vercel project settings)
- `SQUARE_ACCESS_TOKEN`: read-only Production token from the Square Developer Dashboard. Paste it into Vercel only.
- `SQUARE_MENU_CATEGORY_ID`: `EBYJTCNGNP3Z3PFMUFDD74VL` (Menu category).

## Deploy
Link this repo to the Vercel project `adoras-grill`. Pushes to `main` deploy automatically.

## Placeholders to fill
- Order Online link (Square Online URL)
- Street address
- Meal prep prices (Square item variation prices)
- Delivery and social links
