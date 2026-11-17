import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { teamInviteLink, validTeamUid, PLC_SHARED_OWNER_UID, isGoogleIdentityAllowedForRole, normalizeEditorEmail, prepareBulkEditors, suggestBulkEditorEmails } from './teamWorkspace';

test('invitation links preserve the workspace route and carry the owner UID', () => {
  const owner = '18Js95RNBtfbWw0ln2XjGjdYGNn1';
  const invitation = teamInviteLink(owner, 'https://plc.example.test/Plc-Workspace---Notion/?utm_campaign=plc#page_home');
  const parsed = new URL(invitation);
  assert.equal(parsed.searchParams.get('team'), null);
  assert.equal(parsed.pathname, '/Plc-Workspace---Notion/');
  assert.equal(parsed.searchParams.get('utm_campaign'), 'plc');
  assert.equal(parsed.hash, '');
  assert.equal(validTeamUid(owner), owner);
  assert.equal(PLC_SHARED_OWNER_UID, owner);
  assert.equal(validTeamUid('../not-uid'), null);
});

test('Firestore approval cannot be self-granted by choosing the editor PIN', () => {
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  assert.match(rules, /function isApprovedEditor\(userId\)/);
  assert.match(rules, /members\/\$\(request\.auth\.uid\)/);
  assert.match(rules, /incoming\(\)\.role == 'editor'/);
  assert.match(rules, /match \/members\/\{memberId\}/);
  assert.match(rules, /allow create: if isValidId\(memberId\) && isOwner\(userId\)/);
});

test('Editor must be verified and authorized for the owner workspace', () => {
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  assert.match(rules, /function canReadWorkspace\(userId\)/);
  assert.match(rules, /function canEditWorkspace\(userId\)/);
  assert.match(rules, /allow list: if canReadWorkspace\(userId\) && existing\(\)\.ownerId == userId/);
  assert.doesNotMatch(rules, /allow read, write: if true/);
});

test('Admin approval is required and signup only creates an access request', () => {
  const source = readFileSync(new URL('./teamWorkspace.ts', import.meta.url), 'utf8');
  assert.match(source, /joinRequests/);
  assert.match(source, /export async function approveTeamMember/);
  assert.match(source, /export async function requestTeamMembership/);
  assert.match(source, /watchTeamMember/);
});

test('Rafly uses own verified Google identity even when Admin session was saved in this browser', () => {
  const owner = PLC_SHARED_OWNER_UID!;
  const raflyUid = 'rafly-google-identity';
  assert.equal(isGoogleIdentityAllowedForRole('admin', owner), true);
  assert.equal(isGoogleIdentityAllowedForRole('editor', owner), false);
  assert.equal(isGoogleIdentityAllowedForRole('editor', raflyUid), true);
  assert.equal(isGoogleIdentityAllowedForRole('admin', raflyUid), false);
  assert.equal(isGoogleIdentityAllowedForRole('editor', null), false);
});

test('direct editor email access is normalized and does not use approval requests', () => {
  assert.equal(normalizeEditorEmail(' Rafly@Example.Invalid '), 'rafly@example.invalid');
  assert.throws(() => normalizeEditorEmail('a/b@example.invalid'));
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(source, /watchEditorAccess\(/);
  assert.doesNotMatch(source, /requestTeamMembership\(/);
});

test('bulk editor enrollment validates and normalizes all addresses, skipping blanks', () => {
  assert.deepEqual(prepareBulkEditors([
    { name: 'Mala', email: ' MALA@example.invalid ' },
    { name: 'Rafly', email: 'rafly@example.invalid' },
    { name: 'Arif', email: '' },
  ]), [
    { name: 'Mala', email: 'mala@example.invalid', role: 'editor' },
    { name: 'Rafly', email: 'rafly@example.invalid', role: 'editor' },
  ]);
  assert.throws(() => prepareBulkEditors([{name:'Unknown', email:'unknown@example.invalid'}]));
  assert.throws(() => prepareBulkEditors([{name:'Mala', email:'a@example.invalid'}, {name:'Rafly', email:'A@example.invalid'}]));
  assert.throws(() => prepareBulkEditors([{name:'Mala', email:'a@example.invalid'}, {name:'Mala', email:'b@example.invalid'}]));
});
test('bulk enrollment suggests only unambiguous old request email addresses', () => {
  assert.deepEqual(suggestBulkEditorEmails([
    {uid:'r1',name:'Rafly',email:'rafly@example.invalid'},
    {uid:'m1',name:'Mala',email:'one@example.invalid'},
    {uid:'m2',name:'Mala',email:'two@example.invalid'},
    {uid:'x1',name:'Unknown',email:'x@example.invalid'},
  ]), { Rafly: 'rafly@example.invalid' });
});
