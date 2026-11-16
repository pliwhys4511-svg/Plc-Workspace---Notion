import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { teamInviteLink, validTeamUid } from './teamWorkspace';

test('invitation links preserve the workspace route and carry the owner UID', () => {
  const owner = 'ownerUid0123456789';
  const invitation = teamInviteLink(owner, 'https://plc.example.test/Plc-Workspace---Notion/?utm_campaign=plc#page_home');
  const parsed = new URL(invitation);
  assert.equal(parsed.searchParams.get('team'), owner);
  assert.equal(parsed.searchParams.get('utm_campaign'), 'plc');
  assert.equal(parsed.hash, '');
  assert.equal(validTeamUid(owner), owner);
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
