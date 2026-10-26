# PP Queen / EK Shop feature update (2026-10-23)

## Included in this feature patch

- Added an admin-only DELETE endpoint for orders and Delete buttons in the order list/detail view.
- When deleting an order that is not confirmed, the reserved quantity is returned to stock. Confirmed orders do not return stock. Order deletion is transactional and related order items follow the database cascade.
- Customer chat requires a name before a new conversation can begin.
- Telegram now attempts to notify for every customer message instead of suppressing messages for one minute. Messages use the requested format: New chat message / From / Message / Reply in Admin > Chat.
- Telegram's reply link opens Admin > Chat and requests the specific conversation.
- Added emoji pickers to customer chat and the admin reply box. Messages remain editable before Send.
- Product image hover in order items enlarges the image without displaying the product ID over it.
- Added browser cache headers for uniquely named uploaded images and short caching for static assets, while HTML is revalidated.
- Slightly reduced background chat polling frequency to reduce unnecessary requests.

## Validation

- Node syntax checks passed for server.js, src/routes/orders.js, src/routes/chat.js, src/telegram.js, public/js/chat.js, public/js/app.js, and the inline JavaScript in public/admin/index.html.
- Database/API integration and live Render behavior still need to be tested after deployment.

## Performance note

This source archive contains 108 files in public/uploads totaling about 49.34 MB, including 18 files larger than 1 MB. Large product images are a likely contributor to slow page loads. Browser caching helps repeat visits, but actual image resizing/compression and a persistent image-storage migration are separate tasks. No live performance benchmark was run.

## Important source-version warning

The source archive used for this patch did not contain Supabase storage implementation or SUPABASE_URL references, while the live website has displayed a Supabase permanent-storage configuration error. Confirm this archive matches the current GitHub/Render source before deploying; do not use it to overwrite a newer source version that already contains storage changes.

## Customer chat redesign update (2026-10-24)
- Refined the existing Admin Chat layout with a customer search field, All/Unread/Read filters, improved conversation cards, clearer customer header, Full Chat focus toggle, and Delete Chat placement.
- Added contextual icon-only Edit/Delete controls for admin-authored messages and customer-authored messages.
- Added API routes that allow customers to edit/delete only their own messages using their private chat token, and allow admins to edit/delete only admin-authored messages in the selected chat.
- Added customer Delete Chat behavior that clears chat messages while preserving the chat/customer row; orders and payment records are not touched.
- Updated chat CSS for the approved pink-and-white design and responsive layout.
- Validation performed: `node --check` passed for `src/routes/chat.js` and `public/js/chat.js`; the inline JavaScript from `public/admin/index.html` also passed `node --check`.
- Deployment note: deploy the updated project files. No database reset or schema migration is required for these chat changes.

## Chat attachments and admin action update (2026-10-24)

- Added a customer chat image attachment control and an admin reply image attachment control. Both accept JPG, PNG, WEBP and GIF, with a 5 MB maximum and server-side MIME plus file-signature validation.
- Chat images are uploaded to Supabase Storage and the permanent public image URL is saved in `chat_messages.image_url`. Chat image uploads do not write to Render's temporary filesystem.
- Customer and admin chat responses now include `image_url`; image messages display in both compact and Full Chat layouts and can be clicked to open the original image.
- Telegram customer-message alerts include the persistent image URL for image messages, retain the actual customer name, and link to the selected admin conversation. A Telegram failure is logged and does not undo the saved message.
- The product detail page shares its product code with the chat widget so customer-message alerts can include the product ID when chat starts from a product page.
- Orders table Open/Delete text buttons are now icon-only view/trash controls with accessible labels, tooltips and the existing delete confirmation. Product actions already used the shared icon style.
- Added an idempotent `image_url` column migration to `db/schema.sql`; existing conversations and records are not reset.

### New deployment configuration

Set these server-side Render environment variables (never expose the service-role key in frontend code):

- `SUPABASE_URL`: project URL from Supabase.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only service role key.
- `CHAT_IMAGE_BUCKET`: optional; defaults to `ppqueen-chat-images`.
- `CHAT_IMAGE_MAX_BYTES`: documented default is 5242880 (the upload is capped at 5 MB).

Create the storage bucket named `ppqueen-chat-images` as a public bucket, or set `CHAT_IMAGE_BUCKET` to an existing public bucket that allows server-side service-role uploads. Existing `TELEGRAM_BOT_TOKEN` / `TG_TOKEN`, `TELEGRAM_CHAT_ID` / `TG_CHAT_ID`, and `APP_BASE_URL` / `RENDER_EXTERNAL_URL` settings are reused. No database reset is required; the server's existing startup migration adds the column safely.

### Validation boundary

Syntax checks are performed on the changed JavaScript files and inline admin script. A live Supabase upload, real Telegram delivery, database-backed authorization test, and deployed Render workflow require the deployment's database, storage bucket, and credentials; these cannot be truthfully marked as passed from this source archive alone.


## Superseding update — text-only chat (2026-10-24)

- Removed image attachment buttons and file inputs from customer and admin chat composers. Existing historical image messages remain readable if present.
- Both composers now send text-only JSON payloads; the server rejects empty messages.
- Customer messages are saved and acknowledged before Telegram notification is attempted, so Telegram connectivity cannot make a successfully saved message look unsent.
- Admin replies use the existing authenticated API helper with a JSON body.
- Customer name remains required before first message and is saved with the existing chat token/conversation.
- Product, Orders, Waiting Payment, and Waiting Confirm tables retain consistent icon-only view/edit/delete actions where applicable, with accessible labels and confirmation for deletes.
- Supabase Storage environment variables are no longer required for chat because image sending is disabled.
