# PP Queen update notes (2026-10-14)

## Changes applied
- Added a safe schema migration for permanent `product_code` values and an `audience` field. Existing product primary keys and rows are preserved; codes are backfilled from existing IDs and assigned automatically to new products.
- Changed product recommendations to show alternatives across categories, excluding the current product and prioritizing other categories with similar prices.
- Added product IDs and audience labels to homepage cards, product detail, recommendation cards, and the admin product list/form.
- Made recommendation images link directly to their product detail pages.
- Reworked the admin product list into one Product column containing thumbnail, code, and name; centered the Bags/Shampoo creation controls around a shorter search field.
- Reordered admin navigation so Products follows Waiting Confirm.
- Added clickable low-stock entries with product image, ID, name, stock count, and status, backed by the live database query.
- Added responsive card hover transitions, reduced-motion support, light-gray page background, and image hover previews for key product/order thumbnails.
- Added PDF payment-proof support alongside JPG/JPEG/PNG/WebP. Server validates file type and file signatures, enforces an 8 MB limit, keeps the uploaded proof attached to the order, and does not mark the order `success` automatically. PDF proofs open as links in customer/admin views and can be sent as Telegram documents.
- Kept existing order-code generation, order relations, and guest checkout flow intact.

## Validation performed
- `node --check` passed for updated backend route/upload/Telegram JavaScript.
- Inline JavaScript syntax checks passed for `index.html`, `product.html`, `payment.html`, and `admin/index.html`.
- Database integration tests and browser end-to-end tests could not be run in this environment because no configured PostgreSQL service or browser test runner is included.

## Still outstanding from the full requirements
- Excel `.xlsx`/`.xls` import and validation preview are not implemented; the downloadable template is included, but the Import Products action remains a placeholder.
- Interactive manual image crop/zoom/rotate editor is not implemented; the existing image upload/preview remains.
- Category-specific navigation/filter behavior, contact-icon refresh, banner resizing/transition, and consistent product/order IDs on every historical order-list surface still need a full browser pass.
- Touch-specific tap-to-preview behavior and a complete audit of every product image list remain to be tested.

## Upgrade
Back up the database before deploying. The app runs `db/schema.sql` on startup and adds columns/indexes/trigger without dropping existing product or order data. Keep your real `.env` local; this package includes only `.env.example`.
- Added persistent customer-side unread chat counts: admin replies increment `customer_unread`; the customer chat launcher shows a badge while the chat is closed; opening the chat marks messages read. The unread count is scoped to the visitor's existing random chat token and does not require customer login. Admin unread counts remain admin-only behind authentication.


## October 2026 UI and product import update
- Applied a consistent soft-pink/white design refresh across shared site components and admin product management.
- Added a direct Excel template download and clearer import instructions.
- Excel import accepts the template's exact headers, flexible capitalization, status, and image filename column.
- Import accepts matching image files in the same request and links them to the created product without changing the existing database workflow.
