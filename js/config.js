// Supabase 프로젝트의 Settings → API 에서 확인한 값입니다.
// 여기 담긴 URL/publishable key는 브라우저에 노출되도록 설계된 공개 값이라
// 저장소에 커밋되어 있습니다(실제 접근 제어는 supabase/schema.sql의 RLS가 담당).
// (템플릿은 js/config.example.js 참고)

window.SUPABASE_URL = 'https://rigoefdhnqazacdehgqg.supabase.co';
window.SUPABASE_ANON_KEY = 'sb_publishable_evs0gXiGRdQbYqVDMTie-w_EulUQUYf';

// 진료기록의 부검사진을 구글 드라이브(대한동물병원업무시스템 폴더)에도 자동 백업한다.
// 폴더는 이미 만들어져 있지만, CLIENT_ID는 Google Cloud Console에서 발급받아야 한다
// (js/googleDrive.js 상단 주석 참고) — 그 전까지는 이 기능이 조용히 꺼진 채로 동작한다.
window.GOOGLE_DRIVE_CLIENT_ID = ''; // TODO: Google Cloud Console에서 발급받은 OAuth 클라이언트 ID
window.GOOGLE_DRIVE_FOLDER_ID = '1ol2X9FiViU3zZ6vGtd0HSrTWjAlv_eaU';
