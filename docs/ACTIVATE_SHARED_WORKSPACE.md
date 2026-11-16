# Activate PLC Workspace shared cloud editing

**Current status:** This code is staged in pull request #11; the website should not be merged until Firestore rules are deployed to the **named database**, tested, and owner Cloud DB access is confirmed.

## What is implemented

- Admin/Editor select their role and sign into their own verified Google account once; Firebase Auth restores sessions on subsequent visits.
- Editor joins by opening the Admin-generated invite link and requests membership. Admin approves by email; only approved Firebase UIDs can read/write shared content.
- All workspace data is stored at `users/{ownerUid}`; no one has to click Connect Cloud DB after setup.
- Unapproved Editors cannot access live data and are shown a waiting screen, never an isolated "successful sync" workspace.

**Security note:** PINs `4511` / `1234` in client JS are public/UI-only. Access control comes from Google identity and Firestore membership security rules.

## Prerequisite

Firebase project `ordinal-shape-w5v9p`, Cloud Firestore **named** database
`ai-studio-plcworkspace-9eac181d-b756-4396-b3f7-81a5026ec8f7`.

1. Back up the existing Firestore data and current ruleset before deployment.
2. Run the Firebase emulator test workflow (`Verify Firebase Shared Workspace Rules`) and make sure it passes.
3. Using an account with permission to deploy Firestore Security Rules, run this command from the checked-out PR branch:

```bash
npx firebase-tools@14 login
npx firebase-tools@14 deploy --project ordinal-shape-w5v9p --only firestore:rules
```

The `firebase.json` in this branch **only configures the named PLC Workspace database**. The `--only firestore:rules` flag avoids deploying indexes or other services. Verify the ruleset is visible under the intended named database in Firebase/Google Cloud Console after publication. **Do not deploy to (default).**

4. Verify on a test account that (a) the owner can read data, (b) an unapproved editor cannot, (c) after approval that editor can read and edit content, (d) after revocation the editor cannot access data.
5. Only after checks pass, merge PR #11 into `main`; GitHub Pages will rebuild the frontend.
6. The Admin signs in and opens Settings → Akses Tim & Workspace Bersama to copy the invitation link.
7. Each editor opens that invitation URL, selects their name, signs into their own verified Google account, and requests access. Admin verifies the email before pressing Setujui.

The Firebase app/connector is not connected to this ChatGPT conversation; publishing rules remotely cannot be performed via the GitHub plugin alone.

### Rollback

If access fails, restore the previous named-database ruleset from Firebase/Google Cloud rules history. To restore the prior frontend, revert the merge commit of PR #11. Preserve the data documents and membership collections; do not delete them to roll back.

### Important limitations

- First-time Google consent and membership approval are unavoidable for secure sharing; subsequent visits reuse Firebase's persistent session.
- Cloud sync after loading is automatic; edits made without a network connection require appropriate offline synchronization behavior and are not guaranteed to be shared until upload succeeds.
- The current data import architecture is not fully transactional. Back up before bulk imports.
