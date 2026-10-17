# PP Queen Shop

Online shop with pink and black theme, your logo, header and footer.

- Customers do **not** log in: they browse, add to cart, check out and pay as guests. Only the **admin** logs in (open `/login.html`).
- Customer chat box on every page; the admin answers in **Admin > Chat**
- Admin: add, edit, delete products with many images, see orders, confirm payment, dashboard
- Customer: browse, search, product detail with image gallery, cart, checkout, pay by QR, upload payment screenshot, my orders, chat
- Telegram alerts: new order, **payment screenshot (the picture itself)**, new chat message, status change, low stock
- Payment screenshot upload waits for the Telegram result and tells the customer if the shop alert could not be delivered; both `TELEGRAM_*` and `TG_*` environment names are supported.
- Guest-first navigation: customers can browse, buy, pay, view orders and chat without creating/logging into a customer account.
- Typography: Manrope is used for clean English/numeric UI and prices, while Kantumruy Pro/Noto Sans Khmer is used for Khmer text.
- Stack: Node.js + Express, PostgreSQL, vanilla HTML/CSS/JS


## PP Queen v2 catalog and multilingual upgrade

The existing system is preserved and upgraded incrementally.

- **Languages:** English, Khmer, and Chinese (`EN | ខ្មែរ | 中文`).
- **Localized catalog:** products support English/Khmer/Chinese names and descriptions with safe English fallback.
- **Language-specific logos:** `public/images/logo-en.png`, `logo-km.png`, and `logo-zh.png`. These are initialized from the current logo so the existing branding is preserved; replace each file with the final localized artwork when ready.
- **Managed categories:** Admin > Categories lets you add, edit, hide, and safely delete categories. Products select from managed categories instead of requiring frontend changes.
- **Customer menu:** PP Queen logo → Shampoo → Bags → All Products.
- **Product form workflow:** View is read-only; Edit enables fields; Save commits changes; Close exits without saving.
- **Security hardening:** admin authorization is checked against the database, product/category inputs are validated server-side, image uploads remain restricted to image MIME types and 5 MB/8 files, product images are capped at 8 total, and login attempts are rate-limited.
- **Existing database compatibility:** existing `products.category` and English product fields remain in place. New multilingual fields/categories are added with `IF NOT EXISTS`, so the migration does not intentionally delete or rebuild existing records.

### Existing database upgrade

You do **not** need to delete your PostgreSQL database or Docker volume.

Just start the server normally:

```bash
npm install
npm start
```

`src/migrate.js` runs `db/schema.sql` on startup. The new fields/tables are added automatically.

### Adding a product

In Admin > Products:

1. Click **Add product**.
2. Enter English, Khmer, and Chinese product names.
3. Add the three language descriptions when needed.
4. Select an existing category.
5. Upload up to 8 images.
6. Click **Save**.

Use **View** when you only want to inspect a product. Use **Edit** to change it.

### Adding a category

In Admin > Categories:

1. Click **Add category**.
2. Enter English, Khmer, and Chinese category names.
3. Set the sort order.
4. Save.

The customer catalog and category filter automatically pick up the new category. No frontend redesign is required.

## 1. Set up (first time)

1. Install **Node.js 18 or newer** and **PostgreSQL**.
2. In **pgAdmin**, create an empty database named `ppqueen`.
3. In this folder, copy `.env.example` to `.env` and fill it in:
   - the `DB_*` lines with your PostgreSQL host, user, password and database name
   - `JWT_SECRET` with a long random text
   - `ADMIN_EMAIL` and `ADMIN_PASSWORD` for your first admin
4. Run:

```
npm install
npm run db:init
npm start
```

5. Open http://localhost:3000
6. Admin: open http://localhost:3000/login.html and log in with your admin email and password. You are sent to the Admin page.

The database tables are created or updated automatically every time the server starts (new tables for chat and guest orders are added without touching your data).

## 2. Add your payment QR

Put the QR image from your bank app at:

```
public/images/payment-qr.png
```

Customers see it on the payment page with the exact amount. The customer then uploads a payment screenshot (big phone screenshots are shrunk in the browser first). The screenshot is sent to your Telegram bot as a picture right away, and you click **Confirm payment** in Admin > Orders.

Note: this is a normal (static) QR, so the customer types the amount themselves. Automatic payment checking needs a merchant account and API from your bank or payment provider.

## 3. Telegram alerts

1. Open Telegram, talk to **@BotFather**, send `/newbot`, copy the token into `TELEGRAM_BOT_TOKEN`.
2. Add the bot to your chat or group and send a message.
3. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy the `chat` `id` into `TELEGRAM_CHAT_ID`.
4. Restart the server. Leave both empty to turn alerts off.

## 4. Shop info and logo

- Footer contact and the currency symbol come from `.env` (`SHOP_PHONE`, `SHOP_EMAIL`, `SHOP_ADDRESS`, `CURRENCY`).
- Logo files are in `public/images/` (`logo.png`, `logo-mark.png`, `favicon.png`). Replace them to change the logo.
- Colors are at the top of `public/css/style.css`.

## 5. English, Khmer and Chinese

The header has an **EN | ខ្មែរ | 中文** switch. The choice is saved in the browser. Khmer and Chinese UI translations are in `public/js/i18n.js`. Product names, descriptions and category labels come from the corresponding language fields in PostgreSQL, with English fallback when a translation is empty. Telegram alerts stay in English.

## 3b. Chat

Customers click the pink chat button (bottom right). No login: the browser keeps a private chat id. Admin sees every conversation in **Admin > Chat** with a red number for unread messages. If Telegram is set up, a new customer message also sends you a Telegram alert (at most once a minute per customer).

## 3c. Guest orders

Each order gets a secret link (the `t=` part of the payment page address). The customer's browser remembers it, so **My orders** works without an account. A different browser cannot open the order without that link.

## Folder map

```
server.js              start of the app
db/schema.sql          tables
db/init.js             creates tables and the first admin
src/routes/            auth, products, orders, chat (API)
src/middleware/auth.js login check and admin check
src/telegram.js        Telegram sender
public/                pages, css, js, images, uploads
public/admin/index.html  admin page (Dashboard, Products, Orders)
```

## Important before going live

- Use a strong `JWT_SECRET` and a strong admin password.
- Use HTTPS (for example behind Nginx or a hosting service).
- Back up the database and the `public/uploads` folder.


## PP Queen v3 update
- Order statuses are `waiting_pay`, `paid`, `success`, `done`, `reject`.
- Payment screenshot upload changes `waiting_pay` to `paid`; only admin can confirm `paid` to `success`.
- Customer-facing order codes are unique values such as `PP001`, `PP002`.
- Admin dashboard no longer shows total paid sales or Manage Products/Manage Orders shortcut buttons.
- Product add actions are only `Add Shampoo` and `Add Bag`.
- Customer header uses `Shop` instead of `All Products` and has no Chat menu item.
- Product cards show product name and price without repeating the category as a second title.
- Admin category table shows Name, Product, Status, Action; sort order is no longer exposed in the form.
- Admin can delete customer chat conversations.


## PP Queen multilingual/contact setup

The website language selector supports English (`en`), Khmer (`km`), and Chinese (`zh`). Product names and descriptions can be entered in English, Khmer, and Chinese from the optional, collapsed translation area in the admin product form.

To show the real Facebook Page, Telegram Group, and phone number on the customer contact card, set these values in `.env` and restart the server:

```env
SHOP_PHONE=your-shop-phone-number
SHOP_FACEBOOK_URL=https://www.facebook.com/your-page
SHOP_TELEGRAM_URL=https://t.me/your-group
```

Use your actual public links; the site does not invent or guess them. The payment QR is loaded from `public/images/payment-qr.png`.

## PP Queen pagination and contact-banner update (October 2026)

- The large promotional hero above the home contact panel was removed so the contact panel is the first main section.
- The right side of the home contact panel now uses the language-matched PP Queen logo instead of the payment QR. The payment QR remains available on the checkout payment page at `public/images/payment-qr.png`.
- Customer-facing product cards are shown 20 per page, with page navigation after the filters.
- Admin Bags and Shampoo product lists show 20 products per category page; order lists and the product rows in the admin order detail show 20 per page.
- My Orders shows 20 orders per page. Cart items, checkout order summaries, and products shown on the payment/order status page are also limited to 20 entries per page.
- Pagination labels support the existing English, Khmer, and Chinese language selector.


## PP Queen UI refresh and reliable Excel product import

The October UI refresh keeps the existing guest checkout, admin login, orders, payment confirmation, and chat flows while applying a shared soft-pink, white, rounded-card visual style to customer and admin pages.

### Import products from Excel (without images)

1. In Admin → Products, click the import icon and select an `.xlsx` or `.xls` workbook.
2. The import runs directly without asking you to select image files. Imported products have no image unless you add one later through product management.
3. Supported columns include `Product Name`, `Category`, `Description`, `Price`, `Stock Quantity`, and `Status`. Image columns are not required and are ignored by the simple import workflow.
4. Required product fields and category names are validated. The import summary reports how many products were created and how many rows were skipped.
