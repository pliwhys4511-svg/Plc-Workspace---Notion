# Firestore Security Specification — PLC Workspace

## 1. Data Invariants
1. **User Workspace Ownership**: Every document inside `/users/{userId}` and its subcollections (`meta`, `pages`, `blocks`, `databases`, `dbRows`, `comments`) requires `request.auth != null`, `request.auth.token.email_verified == true`, and `request.auth.uid == userId`, with `ownerId == request.auth.uid`.
2. **Master Gate Parent Existence**: No subcollection document can be created, read directly via `get`, updated, or deleted unless the parent user root `/users/{userId}` exists (checked via `exists()` or `existsAfter()` during atomic batch creation).
3. **Referential Integrity**: Every `Block` and `PageComment` must reference an existing `Page` (`pageId`) under the same owner, and every `DatabaseRow` must reference an existing `Database` (`databaseId`).
4. **Temporal & Identity Immutability**: `createdAt` equals `request.time` on creation and never changes; `updatedAt` equals `request.time` on every write; `ownerId`, `id`, `pageId`, `databaseId`, and `author` cannot be reassigned after creation.
5. **Strict Key & Size Enforcement**: All document payloads pass `hasAll` + `hasOnly` on creation and action-scoped `affectedKeys().hasOnly(...)` on updates, with bounded string lengths and array sizes to prevent shadow fields and Denial-of-Wallet payloads.

## 2. The "Dirty Dozen" Attack Payloads (Expected: `PERMISSION_DENIED`)
1. **Cross-Tenant Read/Write**: User B (`uid_b`) attempts `get` or `create` on `/users/uid_a/pages/page_home`.
2. **Unverified Email Bypass**: Authenticated user with `request.auth.token.email_verified == false` attempts to write `/users/{uid}/pages/p1`.
3. **OwnerId Spoofing on Create**: User A writes `/users/uid_a/pages/p1` with `ownerId: "uid_b"`.
4. **Shadow Field Injection**: User A creates a `Page` with extra ghost field `isAdmin: true` or `role: "superuser"`.
5. **ID Poisoning**: User A writes `/users/uid_a/pages/../../other` or a 1,500-character document ID.
6. **Denial-of-Wallet Oversized Content**: User A creates a `Block` with `content.size() > 50000` or `tableRows.size() > 100`.
7. **Client Timestamp Forgery**: User A creates or updates a `Page` with a backdated `createdAt` or `updatedAt` != `request.time`.
8. **Immutable Field Mutation**: User A updates a `Page` attempting to modify `createdAt`, `id`, or `ownerId`.
9. **Orphaned Block Creation**: User A creates a `Block` referencing `pageId: "nonexistent_page"`.
10. **Orphaned Database Row**: User A creates a `DatabaseRow` referencing `databaseId: "nonexistent_db"`.
11. **Invalid Enum State Injection**: User A sets `Database.activeView` to `"raw_sql"` or `Page.font` to `"comic_sans"`.
12. **Blanket List Query Scraping**: User B queries `/users/uid_a/pages` without owning `resource.data.ownerId == request.auth.uid`.
