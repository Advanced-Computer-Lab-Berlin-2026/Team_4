# File Ownership (who edits what)

Rule: **only the owner edits a file.** New files inside your own feature folders are always fine. If you need a change in someone else's file, message the owner (or open a tiny PR they review).

## Member 1 — Authentication, Sessions & Admin Accounts  (workload 9 pts)

**Requirements:** 1, 4, 5, 6

**Backend**
- `server/src/controllers/auth.controller.js`
- `server/src/controllers/admins.controller.js`
- `server/src/routes/auth.routes.js`
- `server/src/routes/admins.routes.js`

**Models**
- `server/src/models/User.js`

**Pages**
- `client/src/pages/auth/RegisterPage.jsx`
- `client/src/pages/auth/LoginPage.jsx`
- `client/src/pages/admin/AdminAddAdminPage.jsx`

**Components**
- `client/src/components/auth/AuthFormLayout.jsx`

**API clients**
- `client/src/api/auth.api.js`
- `client/src/api/admins.api.js`

## Member 2 — Account, Passwords & Wallet  (workload 11 pts)

**Requirements:** 10, 11, 12, 36

**Backend**
- `server/src/controllers/account.controller.js`
- `server/src/controllers/passwordReset.controller.js`
- `server/src/routes/account.routes.js`
- `server/src/routes/passwordReset.routes.js`

**Models**
- `server/src/models/PasswordResetOtp.js`

**Pages**
- `client/src/pages/auth/ForgotPasswordPage.jsx`
- `client/src/pages/auth/ResetPasswordPage.jsx`
- `client/src/pages/account/ChangePasswordPage.jsx`
- `client/src/pages/account/ProfilePage.jsx`
- `client/src/pages/account/WalletPage.jsx`

**Components**
- `client/src/components/account/PasswordInput.jsx`

**API clients**
- `client/src/api/account.api.js`
- `client/src/api/passwordReset.api.js`

## Member 3 — Verified-Lender Application & Review  (workload 13 pts)

**Requirements:** 2, 3, 8, 9

**Backend**
- `server/src/controllers/lenderApplications.controller.js`
- `server/src/controllers/adminLenderApplications.controller.js`
- `server/src/routes/lenderApplications.routes.js`
- `server/src/routes/adminLenderApplications.routes.js`

**Models**
- `server/src/models/LenderApplication.js`

**Pages**
- `client/src/pages/lender/LenderApplyPage.jsx`
- `client/src/pages/admin/AdminLenderApplicationsPage.jsx`
- `client/src/pages/admin/AdminLenderApplicationDetailPage.jsx`

**Components**
- `client/src/components/lender/DocumentUploader.jsx`
- `client/src/components/admin/DocumentViewer.jsx`

**API clients**
- `client/src/api/lenderApplications.api.js`
- `client/src/api/adminLenderApplications.api.js`

## Member 4 — Admin User Management  (workload 11 pts)

**Requirements:** 7, 22, 28, 29, 39

**Backend**
- `server/src/controllers/adminUsers.controller.js`
- `server/src/routes/adminUsers.routes.js`

**Pages**
- `client/src/pages/admin/AdminUsersPage.jsx`
- `client/src/pages/admin/AdminUserDetailPage.jsx`

**Components**
- `client/src/components/admin/UserSearchBar.jsx`
- `client/src/components/admin/UserTable.jsx`

**API clients**
- `client/src/api/adminUsers.api.js`

## Member 5 — Lender Item Listing Management  (workload 12 pts)

**Requirements:** 13, 14, 15, 21

**Backend**
- `server/src/controllers/items.controller.js`
- `server/src/routes/items.routes.js`

**Models**
- `server/src/models/Item.js`

**Pages**
- `client/src/pages/lender/MyItemsPage.jsx`
- `client/src/pages/lender/ItemEditorPage.jsx`

**Components**
- `client/src/components/lender/item-editor/ItemInfoTab.jsx`
- `client/src/components/lender/ItemRow.jsx`

**API clients**
- `client/src/api/items.api.js`

## Member 6 — Item Policies & Category Configuration  (workload 11 pts)

**Requirements:** 30, 31, 32, 33, 40

**Backend**
- `server/src/controllers/itemPolicies.controller.js`
- `server/src/controllers/categories.controller.js`
- `server/src/routes/itemPolicies.routes.js`
- `server/src/routes/categories.routes.js`

**Models**
- `server/src/models/Category.js`

**Pages**
- `client/src/pages/admin/AdminCategoriesPage.jsx`

**Components**
- `client/src/components/lender/item-editor/ItemPickupRulesTab.jsx`
- `client/src/components/lender/item-editor/ItemManualTab.jsx`
- `client/src/components/items/ManualViewer.jsx`
- `client/src/components/items/PickupInfo.jsx`

**API clients**
- `client/src/api/itemPolicies.api.js`
- `client/src/api/categories.api.js`

## Member 7 — Public Catalog, Search & Item Details  (workload 13 pts)

**Requirements:** 16, 17, 18, 19, 20, 35

**Backend**
- `server/src/controllers/catalog.controller.js`
- `server/src/routes/catalog.routes.js`

**Pages**
- `client/src/pages/HomePage.jsx`
- `client/src/pages/items/CatalogPage.jsx`
- `client/src/pages/items/ItemDetailsPage.jsx`

**Components**
- `client/src/components/catalog/SearchBar.jsx`
- `client/src/components/catalog/CategoryFilter.jsx`
- `client/src/components/catalog/ItemGallery.jsx`

**API clients**
- `client/src/api/catalog.api.js`

## Member 8 — Household Linking  (workload 11 pts)

**Requirements:** 24, 25, 26, 27

**Backend**
- `server/src/controllers/household.controller.js`
- `server/src/routes/household.routes.js`

**Models**
- `server/src/models/HouseholdLink.js`

**Pages**
- `client/src/pages/household/HouseholdPage.jsx`

**Components**
- `client/src/components/household/LinkRequestForm.jsx`
- `client/src/components/household/LinkList.jsx`

**API clients**
- `client/src/api/household.api.js`

## Member 9 — Favorites, Notices & Category/Admin Listing Views  (workload 11 pts)

**Requirements:** 23, 34, 37, 38, 41, 42

**Backend**
- `server/src/controllers/favorites.controller.js`
- `server/src/controllers/notices.controller.js`
- `server/src/controllers/adminItems.controller.js`
- `server/src/routes/favorites.routes.js`
- `server/src/routes/notices.routes.js`
- `server/src/routes/adminItems.routes.js`

**Models**
- `server/src/models/Favorite.js`
- `server/src/models/Notice.js`

**Pages**
- `client/src/pages/items/CategoryPage.jsx`
- `client/src/pages/favorites/FavoritesPage.jsx`
- `client/src/pages/notices/NoticeBoardPage.jsx`
- `client/src/pages/admin/AdminItemsPage.jsx`
- `client/src/pages/admin/AdminNoticesPage.jsx`

**Components**
- `client/src/components/favorites/FavoriteButton.jsx`
- `client/src/components/notices/NoticeCard.jsx`

**API clients**
- `client/src/api/favorites.api.js`
- `client/src/api/notices.api.js`
- `client/src/api/adminItems.api.js`

## Foundation / shared (change only via PR approved by Member 1)

- `server/src/config/*`, `server/src/middleware/*`, `server/src/utils/*`, `server/src/app.js`, `server/src/routes/index.js`
- `server/src/models/index.js` and all Sprint 2 models (until Sprint 2 planning)
- `client/src/App.jsx`, `client/src/main.jsx`, `client/src/routes/*`, `client/src/context/*`, `client/src/api/axios.js`
- `client/src/components/common/*`, `client/src/components/layout/*`, `client/src/components/items/ItemCard.jsx`, `client/src/styles/global.css`, `client/src/utils/*`

## Cross-member hand-offs (already wired in the skeleton)

- **Item editor tabs**: `ItemEditorPage` (M5) renders `ItemInfoTab` (M5) + `ItemPickupRulesTab` and `ItemManualTab` (M6).
- **Item details page** (M7) already renders `FavoriteButton` (M9), `PickupInfo` (M6) and `ManualViewer` (M6).
- **ItemCard** (shared) already renders `FavoriteButton` (M9).
- **Register → lender application**: M1's register form redirects to `/lender/apply` (M3) if the user ticks “I also want to lend”.
- **Suspension (Req 39, M4)** is enforced by the shared `protect` middleware; M1's login must also reject suspended users.
- **Category page (M9)** lists items via `GET /api/catalog?category=<id>` (M7) — M7 should ship the list endpoint with the `category` filter first.
- **Approving a lender (M3)** sets `user.lenderStatus = 'verified'`, which unlocks M5/M6 endpoints through `requireVerifiedLender`.
