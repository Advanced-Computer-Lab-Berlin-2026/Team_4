# API Contract (Sprint 1)

Auto-generated from the team manifest. Routes are mounted automatically from `server/src/routes/<name>.routes.js` at `/api/<kebab-name>`.
Success responses are JSON objects (`{ user }`, `{ item }`, `{ items, total, page, limit, pages }`). Errors: `{ message, errors? }` with the right HTTP status.
Access: **public** = anyone, **auth** = any logged-in user, **member**, **lender** = verified lender, **admin**.

## /api/auth — Member 1

| Method | Path | Handler | Access | Req | Description |
|---|---|---|---|---|---|
| POST | `/api/auth/register` | `register` | public | 1 | Create a member account; hash password with user.setPassword() |
| POST | `/api/auth/login` | `login` | public | 4 | Verify credentials, reject suspended accounts, set auth cookie |
| POST | `/api/auth/logout` | `logout` | public | 5 | Clear auth cookie |
| GET | `/api/auth/me` | `me` | auth | 4 | Return the logged-in user (PRE-IMPLEMENTED in foundation) |

## /api/admins — Member 1

| Method | Path | Handler | Access | Req | Description |
|---|---|---|---|---|---|
| POST | `/api/admins` | `createAdmin` | admin | 6 | Create another admin account |

## /api/account — Member 2

| Method | Path | Handler | Access | Req | Description |
|---|---|---|---|---|---|
| PUT | `/api/account/password` | `changePassword` | auth | 10 | Change own password (member or admin) |
| PUT | `/api/account/profile` | `updateProfile` | member | 12 | Edit phone number / address |
| GET | `/api/account/wallet` | `getWallet` | member | 36 | Return wallet balance |

## /api/password-reset — Member 2

| Method | Path | Handler | Access | Req | Description |
|---|---|---|---|---|---|
| POST | `/api/password-reset/request` | `requestOtp` | public | 11 | Generate OTP, store its hash, email it |
| POST | `/api/password-reset/confirm` | `confirmReset` | public | 11 | Verify OTP and set the new password |

## /api/lender-applications — Member 3

| Method | Path | Handler | Access | Req | Description |
|---|---|---|---|---|---|
| GET | `/api/lender-applications/mine` | `getMyApplication` | member | 2, 3 | Current user's application (draft/pending/approved/rejected) |
| POST | `/api/lender-applications/documents` | `uploadDocument` | member | 3 | Upload a document (multipart: type + file) (multipart) |
| GET | `/api/lender-applications/documents/:docId` | `previewDocument` | member | 3 | Owner previews one of their own documents |
| DELETE | `/api/lender-applications/documents/:docId` | `removeDocument` | member | 3 | Remove an uploaded document |
| POST | `/api/lender-applications/submit` | `submitApplication` | member | 2 | Submit the application (requires ID + proof of address) |

## /api/admin-lender-applications — Member 3

| Method | Path | Handler | Access | Req | Description |
|---|---|---|---|---|---|
| GET | `/api/admin-lender-applications` | `listApplications` | admin | 9 | List applications (filter by status) |
| GET | `/api/admin-lender-applications/:id` | `getApplication` | admin | 8 | One application with applicant info + document list |
| GET | `/api/admin-lender-applications/:id/documents/:docId` | `downloadDocument` | admin | 8 | Stream a private document file to the admin |
| PATCH | `/api/admin-lender-applications/:id/decision` | `decideApplication` | admin | 9 | Accept/reject; accept sets user.lenderStatus='verified' |

## /api/admin-users — Member 4

| Method | Path | Handler | Access | Req | Description |
|---|---|---|---|---|---|
| GET | `/api/admin-users` | `listUsers` | admin | 28, 29 | List/search users (q=name, role, lenderStatus, status, page) |
| GET | `/api/admin-users/:id` | `getUser` | admin | 22 | Basic information for one user |
| PATCH | `/api/admin-users/:id/status` | `setUserStatus` | admin | 39 | Suspend or reinstate an account |
| DELETE | `/api/admin-users/:id` | `removeUser` | admin | 7 | Remove a member/lender/admin (+ cascade cleanup) |

## /api/items — Member 5

| Method | Path | Handler | Access | Req | Description |
|---|---|---|---|---|---|
| GET | `/api/items/mine` | `listMyItems` | lender | 21 | All items owned by the current lender (incl. archived) |
| POST | `/api/items` | `createItem` | lender | 13 | Create a listing (multipart: fields + photos[]) (multipart) |
| GET | `/api/items/:id` | `getMyItem` | lender | 14 | One of my items for the edit form |
| PUT | `/api/items/:id` | `updateItem` | lender | 14 | Edit details, deposit amount, category |
| POST | `/api/items/:id/photos` | `addPhotos` | lender | 13, 14 | Add photos to an existing listing (multipart) |
| DELETE | `/api/items/:id/photos/:photoId` | `removePhoto` | lender | 14 | Remove one photo |
| PATCH | `/api/items/:id/archive` | `archiveItem` | lender | 15 | Archive (hidden from search, history kept) |
| PATCH | `/api/items/:id/unarchive` | `unarchiveItem` | lender | 15 | Unarchive |

## /api/item-policies — Member 6

| Method | Path | Handler | Access | Req | Description |
|---|---|---|---|---|---|
| PUT | `/api/item-policies/:itemId/pickup` | `setPickup` | lender | 30 | Set pickup location + instructions |
| PUT | `/api/item-policies/:itemId/rules` | `setRules` | lender | 31 | Set maxBorrowDays / minTrustScore |
| POST | `/api/item-policies/:itemId/manual` | `uploadManual` | lender | 32 | Upload usage manual (multipart: file) (multipart) |
| DELETE | `/api/item-policies/:itemId/manual` | `removeManual` | lender | 32 | Remove the manual |

## /api/categories — Member 6

| Method | Path | Handler | Access | Req | Description |
|---|---|---|---|---|---|
| GET | `/api/categories` | `listCategories` | public | 18, 34 | All active categories (PRE-IMPLEMENTED in foundation) |
| GET | `/api/categories/:slug` | `getCategory` | public | 34 | One category by slug (PRE-IMPLEMENTED in foundation) |
| PATCH | `/api/categories/:id/deposit-multiplier` | `setDepositMultiplier` | admin | 40 | Set the category deposit multiplier |

## /api/catalog — Member 7

| Method | Path | Handler | Access | Req | Description |
|---|---|---|---|---|---|
| GET | `/api/catalog` | `listItems` | public | 16, 17, 18, 35 | Public list: q (name), category, page, limit, sort. Use Item.publicFilter() |
| GET | `/api/catalog/:id` | `getItem` | public | 19, 20, 35 | Item details + owner name + category |

## /api/household — Member 8

| Method | Path | Handler | Access | Req | Description |
|---|---|---|---|---|---|
| GET | `/api/household` | `listLinks` | member | 26 | My links (incoming + outgoing) with status |
| POST | `/api/household/requests` | `sendRequest` | member | 24 | Send request by email/phone + relation |
| PATCH | `/api/household/requests/:id/respond` | `respondToRequest` | member | 25 | Accept or decline an incoming request |
| DELETE | `/api/household/:id` | `removeLink` | member | 27 | Unlink |

## /api/favorites — Member 9

| Method | Path | Handler | Access | Req | Description |
|---|---|---|---|---|---|
| GET | `/api/favorites` | `listFavorites` | member | 38 | My favorites with item data |
| GET | `/api/favorites/ids` | `listFavoriteIds` | member | 37 | Only item ids (for heart-button state) |
| POST | `/api/favorites/:itemId` | `addFavorite` | member | 37 | Add to favorites |
| DELETE | `/api/favorites/:itemId` | `removeFavorite` | member | 38 | Remove from favorites |

## /api/notices — Member 9

| Method | Path | Handler | Access | Req | Description |
|---|---|---|---|---|---|
| GET | `/api/notices` | `listNotices` | auth | 42 | Notice board (newest first) |
| POST | `/api/notices` | `createNotice` | admin | 41 | Post a community notice |

## /api/admin-items — Member 9

| Method | Path | Handler | Access | Req | Description |
|---|---|---|---|---|---|
| GET | `/api/admin-items` | `listAllItems` | admin | 23 | All item listings on the platform (paginated) |

## Dev helpers (disabled when NODE_ENV=production)

| Method | Path | Description |
|---|---|---|
| POST | `/api/dev/login-as` | `{ role: admin\|member\|member2\|lender\|applicant }` — sets the auth cookie for a seeded user |
| POST | `/api/dev/logout` | Clears the auth cookie |
| GET | `/api/health` | Health check |
