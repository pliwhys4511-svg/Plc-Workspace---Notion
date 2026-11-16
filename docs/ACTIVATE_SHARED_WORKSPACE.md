# Activate PLC Workspace shared cloud editing

**Activation states:** The website frontend can deploy first with a clearly labeled browser-local fallback if Firebase production rules deny access. **Real-time shared editing remains unavailable** until this repository's tested Firestore rules are published to the **named database** and approved editors complete onboarding.

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
5. The frontend may be deployed first with the safe local fallback; note that this does **not** enable shared edits. After checks pass, verify the existing GitHub Pages deployment uses the team-authenticated frontend.
6. Every team member can open the **same** PLC Workspace website URL. Admin signs in with the original Firebase owner Google account.
7. Each editor selects their editor name, signs into their own verified Google account, and requests access. Admin verifies the email in Settings → Akses Tim before pressing Setujui.

Publishing rules remotely requires an authenticated Firebase CLI, Firebase Console, or a connected Firebase integration. The GitHub plugin alone cannot deploy these rules.

### Rollback

If access fails, restore the previous named-database ruleset from Firebase/Google Cloud rules history. To restore the prior frontend, revert the merge commit of PR #11. Preserve the data documents and membership collections; do not delete them to roll back.

### Important limitations

- First-time Google consent and membership approval are unavoidable for secure sharing; subsequent visits reuse Firebase's persistent session.
- Cloud sync after loading is automatic; edits made without a network connection require appropriate offline synchronization behavior and are not guaranteed to be shared until upload succeeds.
- The current data import architecture is not fully transactional. Back up before bulk imports.
