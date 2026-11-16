import test from 'node:test';
import assert from 'node:assert/strict';
import { safeImportError } from './UploadTemplateModal';

test('permission-denied Firebase JSON is redacted in uploader', () => {
  const original = JSON.stringify({
    error: 'Missing or insufficient permissions.',
    authInfo: { email: 'private.user@example.invalid', userId: 'privateUid' },
    path: 'users/privateUid/dbRows/row',
  });
  const message = safeImportError(new Error(original));
  assert.match(message, /Firebase menolak akses/);
  assert.equal(message.includes('private.user@example.invalid'), false);
  assert.equal(message.includes('privateUid'), false);
});

test('unexpected oversized error payload is never printed in uploader', () => {
  const message = safeImportError(new Error('Sensitive-' + 'S'.repeat(500)));
  assert.match(message, /Import belum berhasil/);
  assert.equal(message.includes('Sensitive-'), false);
});

test('normal CSV validation errors remain actionable', () => {
  assert.equal(
    safeImportError(new Error('Baris 2: tanggal tidak valid.')),
    'Baris 2: tanggal tidak valid.',
  );
});
