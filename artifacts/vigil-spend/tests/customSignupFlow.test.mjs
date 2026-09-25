import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const authSource = fs.readFileSync(new URL('../app/(auth)/sign-in.tsx', import.meta.url), 'utf8');

test('custom email/password signup uses SignUpFuture and leaves social auth flows untouched', () => {
  assert.match(authSource, /useSignUp\s*\}\s*from '@clerk\/expo'/);
  assert.match(authSource, /signUp\.password\(/);
  assert.match(authSource, /signUp\.verifications\.sendEmailCode\(\)/);
  assert.match(authSource, /signUp\.verifications\.verifyEmailCode\(/);
  assert.match(authSource, /signUp\.update\(profileUpdate\)/);
  assert.match(authSource, /signUp\.finalize\(\{ navigate: \(\) => \{\} \}\)/);
  assert.match(authSource, /emailVerificationCompletedRef\.current/);
  assert.doesNotMatch(authSource, /attemptEmailAddressVerification|prepareEmailAddressVerification/);
  assert.match(authSource, /useSignIn\s*\}\s*from '@clerk\/expo\/legacy'/);
});

test('profile names are retained locally and saved after password signup activation', () => {
  const passwordCallStart = authSource.indexOf('signUp.password({');
  const passwordCallEnd = authSource.indexOf('});', passwordCallStart);
  assert.notEqual(passwordCallStart, -1);
  assert.notEqual(passwordCallEnd, -1);
  const passwordCall = authSource.slice(passwordCallStart, passwordCallEnd);
  assert.match(passwordCall, /emailAddress:/);
  assert.match(passwordCall, /password,/);
  assert.doesNotMatch(passwordCall, /firstName|lastName/);
  assert.match(authSource, /profileUpdate\.firstName = firstName\.trim\(\)/);
  assert.match(authSource, /profileUpdate\.lastName = lastName\.trim\(\)/);

  const finalizeIndex = authSource.indexOf('signUp.finalize(');
  const saveNamesIndex = authSource.indexOf('await saveProfileNames()', finalizeIndex);
  assert.ok(finalizeIndex >= 0 && saveNamesIndex > finalizeIndex);
});

test('Production-required first and last names are present on the SignUpFuture before finalization', () => {
  const syncStart = authSource.indexOf('const syncCustomSignupNames');
  const finalizeStart = authSource.indexOf('const finalizeCustomSignup');
  const finalizeEnd = authSource.indexOf('const finishVerifiedSignup', finalizeStart);
  const nameSync = authSource.slice(syncStart, finalizeStart);
  const finalizer = authSource.slice(finalizeStart, finalizeEnd);
  assert.match(nameSync, /const cleanFirstName = firstName\.trim\(\)/);
  assert.match(nameSync, /const cleanLastName = lastName\.trim\(\)/);
  assert.match(nameSync, /if \(!cleanFirstName \|\| !cleanLastName\)/);
  assert.match(nameSync, /signUp\.firstName\?\.trim\(\) !== cleanFirstName/);
  assert.match(nameSync, /signUp\.lastName\?\.trim\(\) !== cleanLastName/);
  assert.match(nameSync, /signUp\.update\(profileUpdate\)/);
  assert.doesNotMatch(finalizer, /signUp\.update\(/);
  assert.match(finalizer, /signUp\.finalize\(\{ navigate: \(\) => \{\} \}\)/);
  assert.match(finalizer, /if \(verificationSessionActivatedRef\.current\) return true/);
  assert.equal((finalizer.match(/await signUp\.finalize\(/g) ?? []).length, 1);
  assert.equal((finalizer.match(/await activateClerk\(\)/g) ?? []).length, 1);
  assert.doesNotMatch(finalizer, /username/);

  const createStart = authSource.indexOf('const createAccount');
  const verifyStart = authSource.indexOf('const verifyAccount', createStart);
  const createFlow = authSource.slice(createStart, verifyStart);
  assert.ok(createFlow.indexOf('await syncCustomSignupNames()') < createFlow.indexOf('signUp.verifications.sendEmailCode()'));
  const verifyFlow = authSource.slice(verifyStart, authSource.indexOf('const signOutAndSwitchAccount', verifyStart));
  assert.ok(verifyFlow.indexOf('await syncCustomSignupNames()') < verifyFlow.indexOf('signUp.verifications.verifyEmailCode('));

  const finishStart = authSource.indexOf('const finishVerifiedSignup');
  const resendStart = authSource.indexOf('const resendVerificationCode', finishStart);
  const finishFlow = authSource.slice(finishStart, resendStart);
  assert.doesNotMatch(finishFlow, /username/);
});

test('verified signup recovers when Clerk has activated the session despite a finalization error', () => {
  const finalizeStart = authSource.indexOf('const finalizeCustomSignup');
  const finalizeEnd = authSource.indexOf('const finishVerifiedSignup', finalizeStart);
  const finalizer = authSource.slice(finalizeStart, finalizeEnd);

  assert.match(finalizer, /let finalizationError: unknown = null/);
  assert.match(finalizer, /await getToken\(\)\.catch\(\(\) => null\)/);
  assert.match(finalizer, /if \(!activeSessionToken\) throw finalizationError/);
  assert.match(finalizer, /code: 'session_already_active'/);
  assert.match(finalizer, /verificationSessionActivatedRef\.current = true/);
  assert.match(finalizer, /await saveProfileNames\(\)/);
  assert.match(finalizer, /continueAfterAuth\(firstName, themeMode\)/);
  assert.doesNotMatch(finalizer, /setActive\(\{\s*session:/);
});

test('custom email/password signup requires first and last names without collecting a username', () => {
  const createStart = authSource.indexOf('const createAccount');
  const verifyStart = authSource.indexOf('const verifyAccount', createStart);
  const createFlow = authSource.slice(createStart, verifyStart);
  assert.match(createFlow, /!firstName\.trim\(\) \|\| !lastName\.trim\(\)/);
  assert.match(authSource, /<TextInput value=\{firstName\} onChangeText=\{setFirstName\} placeholder=\{t\('firstName'\)\}/);
  assert.match(authSource, /<TextInput value=\{lastName\} onChangeText=\{setLastName\} placeholder=\{t\('lastName'\)\}/);
  assert.doesNotMatch(createFlow, /username/i);
  assert.doesNotMatch(authSource, /signupVerifiedUsernameRequired/);
});

test('sign-up cancellation awaits SignUpFuture reset before switching modes', () => {
  for (const [callbackName, nextCallback] of [
    ['returnToSignIn', 'returnToSignupDetails'],
    ['returnToSignupDetails', 'signInWithGoogle'],
  ]) {
    const start = authSource.indexOf(`const ${callbackName} = useCallback`);
    const end = authSource.indexOf(`const ${nextCallback} = useCallback`, start);
    assert.ok(start >= 0 && end > start, `${callbackName} callback should be present`);
    const callback = authSource.slice(start, end);
    assert.match(callback, /await signUp\.reset\(\)/);
    assert.match(callback, /setCustomLoading\(true\)/);
    assert.match(callback, /signupResetInFlightRef\.current/);
  }
});