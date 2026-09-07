// ─── 구글 드라이브 연동 (진료기록 부검사진 자동 백업) ──────────────────────
// 부검사진의 원본 저장소는 여전히 Supabase Storage(necropsy-photos 버킷)다.
// 이 파일은 그 위에 "같은 사진을 구글 드라이브 폴더에도 한 부 더 남긴다"만 더한다
// — 원본 저장이 이미 끝난 뒤에 하는 부가 작업이라, 여기서 실패해도 진료기록
// 저장 자체는 막지 않는다(아래 backupPhotosToGoogleDrive 참고).
//
// ── 처음 연결하는 방법 (Google Cloud Console, 1회) ──────────────────────
//   1. https://console.cloud.google.com 에서 새 프로젝트를 만든다(무료).
//   2. "API 및 서비스 → 라이브러리"에서 Google Drive API를 사용 설정한다.
//   3. "API 및 서비스 → OAuth 동의 화면"을 구성한다 — User Type은 외부(External),
//      게시 상태는 테스트(Testing)로 둔다. 이 앱을 실제로 쓸 직원 구글 계정을
//      "테스트 사용자"로 추가해야 그 계정으로 로그인했을 때 동의 화면이 뜬다
//      (추가 안 하면 "확인되지 않은 앱" 오류로 막힌다).
//   4. "API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID"
//      → 애플리케이션 유형: 웹 애플리케이션 → 승인된 자바스크립트 원본에
//      https://khmass-liturgy.github.io 추가(로컬 확인용이면 http://localhost:5173도).
//   5. 발급된 클라이언트 ID를 js/config.js의 GOOGLE_DRIVE_CLIENT_ID에 넣는다.
//      (클라이언트 ID는 비밀값이 아니다 — Supabase anon key와 같은 성격의 공개 값.
//      실제 권한은 매번 그 사용자가 브라우저에서 동의해야만 나온다.)
//
// 권한 범위는 drive.file(이 앱이 만든 파일만 건드릴 수 있는 최소 범위)만 요청한다.
// 그래서 구글의 "민감한 범위" 심사 없이도 테스트 사용자 목록에 있는 계정으로 바로 쓸 수 있다.

const GDRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

let gDriveTokenClient = null;
let gDriveAccessToken = null; // { token, expiresAt }
const gDriveFolderCache = {}; // 농장명 -> 그 아래 만든 드라이브 하위폴더 id

function googleDriveEnabled() {
  return !!(window.GOOGLE_DRIVE_CLIENT_ID && window.GOOGLE_DRIVE_FOLDER_ID);
}

// Google Identity Services(accounts.google.com/gsi/client)는 index.html에서 <script
// async defer>로 불러온다. 페이지 로드 시점에 아직 안 끝났을 수 있어 그때그때 확인한다.
function ensureGDriveTokenClient() {
  if (gDriveTokenClient) return gDriveTokenClient;
  if (!googleDriveEnabled()) return null;
  if (typeof google === 'undefined' || !google.accounts?.oauth2) return null;
  gDriveTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: window.GOOGLE_DRIVE_CLIENT_ID,
    scope: GDRIVE_SCOPE,
    callback: () => {}, // getGDriveAccessToken()이 요청마다 콜백을 새로 지정해서 쓴다
  });
  return gDriveTokenClient;
}

// 액세스 토큰을 받는다. 같은 브라우저 세션에서 이미 동의했으면 팝업 없이 조용히
// 갱신되고, 처음이거나 만료됐으면 구글 동의 창이 뜬다(prompt:''는 필요할 때만
// 구글이 알아서 창을 띄우는 GIS의 표준 방식이다 — 매번 강제로 띄우지 않는다).
function getGDriveAccessToken() {
  return new Promise((resolve, reject) => {
    const client = ensureGDriveTokenClient();
    if (!client) { reject(new Error('구글 드라이브 연동이 아직 설정되지 않았습니다.')); return; }
    if (gDriveAccessToken && gDriveAccessToken.expiresAt > Date.now() + 30000) {
      resolve(gDriveAccessToken.token);
      return;
    }
    client.callback = (resp) => {
      if (resp.error) { reject(new Error(resp.error)); return; }
      gDriveAccessToken = { token: resp.access_token, expiresAt: Date.now() + resp.expires_in * 1000 };
      resolve(resp.access_token);
    };
    client.error_callback = (err) => reject(new Error(err?.message || '구글 로그인이 취소되었습니다.'));
    client.requestAccessToken({ prompt: '' });
  });
}

// 농장명으로 하위 폴더를 찾고, 없으면 만든다(폴더당 한 번만 검색하도록 캐시).
async function gDriveFindOrCreateFolder(name, parentId, token) {
  const key = `${parentId}/${name}`;
  if (gDriveFolderCache[key]) return gDriveFolderCache[key];
  const escaped = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const q = encodeURIComponent(
    `name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`
  );
  const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const listData = await listRes.json();
  if (!listRes.ok) throw new Error(listData.error?.message || '드라이브 폴더 조회 실패');
  if (listData.files && listData.files.length) {
    gDriveFolderCache[key] = listData.files[0].id;
    return listData.files[0].id;
  }
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const created = await createRes.json();
  if (!createRes.ok) throw new Error(created.error?.message || '드라이브 폴더 생성 실패');
  gDriveFolderCache[key] = created.id;
  return created.id;
}

async function gDriveUploadFile(file, folderId, token, filename) {
  const metadata = { name: filename || file.name, parents: [folderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || '드라이브 업로드 실패');
  return data;
}

// 진료기록에 새로 첨부한 부검사진 File[]을 "대한동물병원업무시스템 폴더 → 농장명" 아래에
// 올린다. files가 비어 있거나 연동이 아직 설정 안 됐으면 조용히 넘어간다.
// 실패해도 예외를 던지지 않는다 — 이 시점엔 Supabase Storage 저장이 이미 끝나 있어서,
// 여기서 막으면 "사진은 저장됐는데 알 수 없는 이유로 진료기록 저장 실패"처럼 보이게 된다.
//
// tokenPromise: 이미 시작해 둔 getGDriveAccessToken() 호출이 있으면 그걸 넘긴다.
// 구글 동의 팝업은 반드시 사용자 클릭 이벤트 핸들러 안에서 지연 없이 요청해야
// 브라우저가 막지 않으므로(호출부인 saveMedicationLog() 참고), 이 함수 안에서
// 새로 요청하면 이미 여러 await를 거친 뒤라 팝업이 조용히 차단된다.
async function backupPhotosToGoogleDrive(files, farmName, logDate, tokenPromise) {
  if (!googleDriveEnabled() || !files || !files.length) return { ok: true, skipped: true };
  try {
    const token = tokenPromise ? await tokenPromise : await getGDriveAccessToken();
    if (!token) throw new Error('구글 드라이브 인증 토큰을 받지 못했습니다.');
    const folderId = await gDriveFindOrCreateFolder(farmName || '농장미상', window.GOOGLE_DRIVE_FOLDER_ID, token);
    for (const file of files) {
      const filename = `${logDate || ''}_${sanitizeFileNameForStorage(file.name)}`.replace(/^_/, '');
      await gDriveUploadFile(file, folderId, token, filename);
    }
    return { ok: true };
  } catch (e) {
    console.warn('구글 드라이브 백업 실패(진료기록 저장 자체는 정상 처리됨):', e);
    return { ok: false, error: e.message };
  }
}
