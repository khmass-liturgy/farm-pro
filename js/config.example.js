// 이 파일을 js/config.js 로 복사한 뒤, Supabase 프로젝트의
// Settings → API 에서 확인한 값을 채워 넣으세요.
// js/config.js는 여기 담긴 값이 전부 브라우저에 노출되도록 설계된 공개 값이라
// (Supabase는 RLS가, 구글 OAuth 클라이언트 ID는 그 자체로 비밀이 아님) 저장소에
// 커밋됩니다 — .gitignore 대상이 아닙니다.

window.SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
window.SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';

// 진료기록의 부검사진을 구글 드라이브에도 자동 백업하는 기능(js/googleDrive.js)에 쓴다.
// CLIENT_ID를 비워두면 이 기능은 조용히 꺼진 채로 동작한다(부검사진 저장 자체는
// Supabase Storage로 항상 정상 동작). 설정 방법은 js/googleDrive.js 상단 주석 참고.
window.GOOGLE_DRIVE_CLIENT_ID = '';
window.GOOGLE_DRIVE_FOLDER_ID = '';

// 카카오톡 발송(js/kakao.js)에 쓰는 카카오 JavaScript 키 (공개 값, 등록한 도메인에서만 동작).
// developers.kakao.com → 내 애플리케이션 → 앱 키 → JavaScript 키, [플랫폼 → Web]에 사이트 도메인 등록,
// [제품 설정 → 카카오톡 공유(메시지)] 사용 설정. 비워두면 카카오톡 발송을 누를 때 "앱 키가 설정되지 않았습니다"
// 안내만 뜬다(다른 기능에는 영향 없음).
window.KAKAO_JS_KEY = '';
