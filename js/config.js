// Supabase 프로젝트의 Settings → API 에서 확인한 값입니다.
// 여기 담긴 URL/publishable key는 브라우저에 노출되도록 설계된 공개 값이라
// 저장소에 커밋되어 있습니다(실제 접근 제어는 supabase/schema.sql의 RLS가 담당).
// (템플릿은 js/config.example.js 참고)

window.SUPABASE_URL = 'https://rigoefdhnqazacdehgqg.supabase.co';
window.SUPABASE_ANON_KEY = 'sb_publishable_evs0gXiGRdQbYqVDMTie-w_EulUQUYf';

// 진료기록의 부검사진을 구글 드라이브(대한동물병원업무시스템 폴더)에도 자동 백업한다.
// poultry-consulting 프로젝트의 기존 OAuth 웹 클라이언트를 재사용한다 — 승인된
// 자바스크립트 원본에 khmass-liturgy.github.io를 추가하고 drive.file 범위를
// 넣어야 실제로 동작한다(js/googleDrive.js 상단 주석 참고).
window.GOOGLE_DRIVE_CLIENT_ID = '356503598433-drudfdtl5e34kl0ajj3om82h0rbh2k6b.apps.googleusercontent.com';
window.GOOGLE_DRIVE_FOLDER_ID = '1ol2X9FiViU3zZ6vGtd0HSrTWjAlv_eaU';
