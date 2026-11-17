# Member 4 — Sprint 2 Contract & Architecture
**Owner:** Member 4  
**Requirements:** 93, 94, 95, 96, 105, 109, 110, 111

## 1. Backend Endpoints

### Moderation (`/api/moderation`) — Admin Only (`protect`, `requireRole('admin')`)
| Method | Path | Req | Description | Query / Body | Response |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/moderation/reports` | 93 | List reported users/listings | `?status=open\|flagged\|removed\|dismissed&targetType=item\|user&page=1&limit=20` | `{ success, items, total, page, totalPages }` |
| `POST` | `/api/moderation/reports` | 93 | Create moderation report (e.g., linked from support ticket) | `{ targetType, targetId, reason, details, supportTicketId? }` | `{ success, entity }` |
| `PATCH` | `/api/moderation/reports/:id/action` | 93 | Flag, remove/archive/suspend, or dismiss target (preserves history) | `{ action: 'flag'\|'remove'\|'dismiss', adminNotes? }` | `{ success, entity }` |

### Analytics & Exports (`/api/analytics`) — Admin Only (`protect`, `requireRole('admin')`)
| Method | Path | Req | Description | Query | Response |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/analytics/usage` | 94, 95 | Monthly usage report by item/category | `?month=YYYY-MM&itemId=&category=&startDate=&endDate=` | `{ success, summary, items, total }` |
| `GET` | `/api/analytics/damage` | 96 | Damage & dispute resolution report | `?status=&resolution=&startDate=&endDate=` | `{ success, summary, items, total }` |
| `GET` | `/api/analytics/usage/export` | 105 | Export filtered usage report | `?format=csv\|pdf&month=&itemId=&category=&startDate=&endDate=` | Binary `text/csv` or `application/pdf` |
| `GET` | `/api/analytics/damage/export` | 105 | Export filtered damage report | `?format=csv\|pdf&status=&resolution=&startDate=&endDate=` | Binary `text/csv` or `application/pdf` |

### Support Tickets (`/api/support-tickets`) — Authenticated (`protect`)
| Method | Path | Req | Access | Body / Query | Response |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/support-tickets` | 109 | Member/Lender | `{ subject, category, description, relatedTargetType?, relatedTargetId? }` | `{ success, entity }` |
| `GET` | `/api/support-tickets/mine` | 111 | Member/Lender | `?status=open\|in_progress\|resolved\|closed` | `{ success, items, total }` |
| `GET` | `/api/support-tickets` | 110 | Admin | `?status=&category=&q=` | `{ success, items, total }` |
| `GET` | `/api/support-tickets/:id` | 110, 111 | Owner or Admin | — | `{ success, entity }` |
| `POST` | `/api/support-tickets/:id/messages` | 110, 111 | Owner or Admin | `{ body }` | `{ success, entity }` |
| `PATCH` | `/api/support-tickets/:id/resolve` | 110 | Admin | `{ status: 'resolved'\|'in_progress'\|'closed', resolutionNote?, linkReport? }` | `{ success, entity, report? }` |

## 2. Historical Preservation Guarantee
Moderating or removing a user or item via `/api/moderation` or `/api/admin-users` sets `status: 'suspended'` / `isArchived: true` / `isFlagged: true` and never cascades deletions into `Reservation`, `DamageReport`, or `WalletTransaction`.