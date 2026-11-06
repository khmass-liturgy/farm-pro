// Supabase 프로젝트의 Settings → API 에서 확인한 값입니다.
// 여기 담긴 URL/publishable key는 브라우저에 노출되도록 설계된 공개 값이라
// 저장소에 커밋되어 있습니다(실제 접근 제어는 supabase/schema.sql의 RLS가 담당).
// (템플릿은 js/config.example.js 참고)

window.SUPABASE_URL = 'https://rigoefdhnqazacdehgqg.supabase.co';
window.SUPABASE_ANON_KEY = 'sb_publishable_evs0gXiGRdQbYqVDMTie-w_EulUQUYf';

// 진료기록의 부검사진을 구글 드라이브(대한동물병원업무시스템 폴더)에도 자동 백업한다.
// poultry-consulting 프로젝트에 이 기능 전용으로 새로 만든 OAuth 웹 클라이언트다
// ("farm-pro 드라이브 백업"). 처음엔 그 프로젝트에 원래 있던, Google 서비스가 자동
// 생성해둔 클라이언트를 재사용했는데, 동의 절차를 다 거치고도 범위별 승인 화면
// 대신 일반 계정 접근 관리 페이지로 새서(그 클라이언트가 다른 용도로 이미 쓰이고
// 있었던 것으로 보임) 이 기능 전용 클라이언트를 새로 발급받았다.
window.GOOGLE_DRIVE_CLIENT_ID = '356503598433-8p8sl9fj1te19etlrrhk64kq01fbpp7r.apps.googleusercontent.com';
window.GOOGLE_DRIVE_FOLDER_ID = '1ol2X9FiViU3zZ6vGtd0HSrTWjAlv_eaU';

// 카카오톡 발송(js/kakao.js)에 쓰는 카카오 JavaScript 키. daehan 저장소의 "카카오톡 전송"과 같은 카카오 앱이다.
// JavaScript 키는 브라우저에 노출되도록 만들어진 공개 값이고, 카카오 개발자 콘솔 [플랫폼 → Web]에 등록한
// 도메인에서만 동작한다. 등록 도메인이 https://khmass-liturgy.github.io 라서 이 앱(/farm-pro/)도 같은 도메인이므로
// 따로 등록할 것이 없다. 단, 로컬(localhost)에서는 도메인 불일치로 전송이 거부된다.
window.KAKAO_JS_KEY = "671da3fb68e72269f3c3dbadabdf8c0f";
