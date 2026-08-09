// 인증 관련 공용 헬퍼. login.html과 index.html이 함께 사용한다.
// js/supabaseClient.js가 먼저 로드되어 전역 `sb` 클라이언트가 존재해야 한다.

async function requireAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { location.href = 'login.html'; return null; }
  return session;
}

function watchAuthState() {
  sb.auth.onAuthStateChange((_event, session) => {
    if (!session) location.href = 'login.html';
  });
}

async function currentUserEmail() {
  const { data: { user } } = await sb.auth.getUser();
  return user?.email || '';
}

async function loginWithPassword(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

async function logout() {
  await sb.auth.signOut();
  location.href = 'login.html';
}
