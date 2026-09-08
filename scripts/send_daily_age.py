#!/usr/bin/env python3
"""매일 아침 프로그램에 입추일이 입력된 농장의 오늘 일령을 텔레그램으로 전송한다.
Supabase는 service_role 키로만 읽는다(RLS를 우회하는 키라 절대 클라이언트/커밋에 넣지 않고
GitHub Actions Secret으로만 전달됨 — .github/workflows/daily-age-notify.yml 참고).

── 알림에서 특정 농장을 빼거나 다시 넣는 방법 ──────────────────────────────
이 스크립트를 실행할 때마다(=매일 아침, 또는 GitHub Actions에서 수동으로 "Run workflow"
눌렀을 때) 먼저 같은 텔레그램 채팅방에 새로 온 메시지가 있는지 확인하고, 아래 형식의
메시지를 명령으로 처리한다. 명령을 처리한 뒤에는 그 결과를 답장으로 보낸다.

  농장명              그 농장을 알림 대상에서 뺀다 (제외/제거/삭제 를 앞에 붙여도 같음)
  포함 농장명          다시 알림을 받는다 (복원/재개 도 같은 뜻)
  목록                현재 제외된 농장 목록을 보여준다

한 메시지에 여러 줄을 적으면 줄마다 따로 처리한다(농장 여러 곳을 한 번에 빼고 싶을 때).
농장명은 programs.farm_name_snapshot과 정확히 같아야 매칭된다 — 다르게 적으면(오탈자 등)
일단 제외 목록에는 들어가지만 답장에 "오늘 알림 대상에는 없는 이름"이라고 표시해준다.

명령은 이 스크립트가 실행되는 시점(매일 07:00 KST, 또는 수동 실행)에만 처리된다 —
텔레그램 메시지를 보낸 즉시 반응하는 건 아니다. 바로 확인하고 싶으면 저장소의
Actions 탭 → "일령 알림" 워크플로 → Run workflow 버튼으로 즉시 실행할 수 있다.
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rigoefdhnqazacdehgqg.supabase.co")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
CHAT_ID = os.environ["TELEGRAM_CHAT_ID"]

KST = timezone(timedelta(hours=9))

EXCLUDE_KEYWORDS = ("제외 ", "제외:", "제거 ", "제거:", "삭제 ", "삭제:")
INCLUDE_KEYWORDS = ("포함 ", "포함:", "복원 ", "복원:", "재개 ", "재개:")
LIST_KEYWORDS = ("목록", "제외목록", "list", "/list")


def sb_headers():
    return {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }


def fetch_programs():
    url = (
        f"{SUPABASE_URL}/rest/v1/programs"
        "?select=farm_name_snapshot,placement_date,duration,species"
        "&placement_date=not.is.null"
    )
    req = urllib.request.Request(
        url,
        headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_exclusions():
    url = f"{SUPABASE_URL}/rest/v1/telegram_notify_exclusions?select=farm_name"
    req = urllib.request.Request(url, headers=sb_headers())
    with urllib.request.urlopen(req, timeout=30) as resp:
        rows = json.loads(resp.read().decode("utf-8"))
    return {r["farm_name"] for r in rows}


def add_exclusion(farm_name):
    url = f"{SUPABASE_URL}/rest/v1/telegram_notify_exclusions"
    headers = sb_headers()
    headers["Prefer"] = "resolution=ignore-duplicates"  # 이미 제외돼 있으면 조용히 무시
    data = json.dumps({"farm_name": farm_name}).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=30):
        pass


def remove_exclusion(farm_name):
    url = f"{SUPABASE_URL}/rest/v1/telegram_notify_exclusions?farm_name=eq.{urllib.parse.quote(farm_name)}"
    req = urllib.request.Request(url, headers=sb_headers(), method="DELETE")
    with urllib.request.urlopen(req, timeout=30):
        pass


def day_age(placement_date_str, today):
    y, m, d = map(int, placement_date_str.split("-"))
    placement = date(y, m, d)
    # js/batches.js computeDayAge()와 동일한 계산(입추일 = 1일령, 로컬 자정 기준 일수 차이 + 1).
    return (today - placement).days + 1


def send_telegram(text):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    data = urllib.parse.urlencode({"chat_id": CHAT_ID, "text": text}).encode("utf-8")
    req = urllib.request.Request(url, data=data)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            print(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"텔레그램 전송 실패: HTTP {e.code} {e.read().decode('utf-8')}", file=sys.stderr)
        sys.exit(1)


def get_telegram_updates(offset=None):
    params = {"timeout": 0}
    if offset is not None:
        params["offset"] = offset
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/getUpdates?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    if not body.get("ok"):
        raise RuntimeError(f"getUpdates 실패: {body}")
    return body.get("result", [])


def parse_command(line):
    """한 줄을 (종류, 농장명) 으로 해석한다. 종류는 'exclude' | 'include' | 'list'.
    아무 키워드도 없이 그냥 농장명만 적으면 'exclude'로 본다(가장 흔한 사용법이라
    별도 접두어를 안 붙여도 되게 하기 위함).

    먼저 줄 전체를 strip한 뒤에 키워드+공백("제외 ")을 찾으면 안 된다 — 원본에
    "제외 "처럼 키워드만 있고 농장명이 없는 줄은 strip으로 뒤 공백이 없어져
    "제외"만 남고, 그러면 keyword(공백 포함)와 더 이상 안 맞아 catch-all로 빠져
    "제외"라는 이름의 농장을 제외하려는 것처럼 잘못 해석된다. 그래서 여기서는
    키워드와 정확히 같은 경우(농장명 없음)를 먼저 걸러낸 뒤에 접두어를 뗀다.
    """
    line = line.strip()
    if not line:
        return None
    if line.lower() in LIST_KEYWORDS:
        return ("list", None)
    for kind, keywords in (("include", INCLUDE_KEYWORDS), ("exclude", EXCLUDE_KEYWORDS)):
        for kw in keywords:
            bare = kw.rstrip(" :")
            if line == bare:
                return None  # 키워드만 있고 농장명이 없음
            if line.startswith(kw):
                name = line[len(kw):].strip()
                return (kind, name) if name else None
    return ("exclude", line)


def process_telegram_commands(known_farm_names):
    """새로 들어온 제외/포함/목록 명령을 처리하고 답장을 보낸다. 처리한 메시지는
    Telegram 서버 쪽에 "확인됨"으로 표시해(offset 갱신) 다음 실행 때 또 처리하지
    않게 한다 — 이 스크립트는 매번 새 GitHub Actions 러너에서 실행되어 자체적으로
    상태를 들고 있지 않으므로, Telegram이 그 상태를 대신 들고 있게 하는 셈이다."""
    try:
        updates = get_telegram_updates()
    except Exception as e:
        print(f"텔레그램 업데이트 조회 실패(알림 명령 처리는 건너뜀): {e}", file=sys.stderr)
        return

    if not updates:
        return

    max_update_id = max(u["update_id"] for u in updates)
    replies = []

    for u in updates:
        msg = u.get("message") or u.get("edited_message")
        if not msg:
            continue
        if str(msg.get("chat", {}).get("id")) != str(CHAT_ID):
            continue  # 다른 채팅방/사용자가 봇에 보낸 메시지는 무시
        text = (msg.get("text") or "")
        for line in text.splitlines():
            cmd = parse_command(line)
            if not cmd:
                continue
            kind, name = cmd
            if kind == "list":
                current = fetch_exclusions()
                if current:
                    replies.append("🔕 현재 제외된 농장 (" + str(len(current)) + "곳)\n" + "\n".join(sorted(current)))
                else:
                    replies.append("🔕 현재 제외된 농장이 없습니다.")
            elif kind == "exclude":
                add_exclusion(name)
                note = "" if name in known_farm_names else "\n(참고: 오늘 알림 대상 목록엔 없는 이름입니다 — 오탈자가 아닌지 확인해보세요)"
                replies.append(f"✅ '{name}' 알림에서 제외했습니다.{note}")
            elif kind == "include":
                remove_exclusion(name)
                replies.append(f"✅ '{name}' 알림을 다시 받습니다.")

    # 여기까지 처리했다고 Telegram에 확인해준다(응답 내용은 안 쓴다 — 확인이 목적).
    try:
        get_telegram_updates(offset=max_update_id + 1)
    except Exception as e:
        print(f"텔레그램 업데이트 확인(offset 갱신) 실패: {e}", file=sys.stderr)

    for r in replies:
        send_telegram(r)


def main():
    today = datetime.now(KST).date()
    programs = fetch_programs()

    known_farm_names = {p["farm_name_snapshot"] for p in programs if p.get("farm_name_snapshot")}
    process_telegram_commands(known_farm_names)
    excluded = fetch_exclusions()

    lines = []
    for p in programs:
        pd = p.get("placement_date")
        if not pd:
            continue
        age = day_age(pd, today)
        if age < 1:
            continue  # 아직 입추 전인 프로그램은 제외
        # 육계는 보통 35일령 전후로 출하된다. js/batches.js의 computeBatchDisplayStatus()가
        # "출하완료"로 표시 전환하는 것과 같은 기준(육계 && 35일령 초과)으로, 이미 출하됐을
        # 프로그램은 매일 알림에서 제외한다(대시보드 표시와 달리 이 값은 DB 컬럼을 바꾸는
        # 게 아니라 알림 발송 여부만 결정하므로 status 컬럼과는 무관하다).
        if p.get("species") == "육계" and age > 35:
            continue
        farm_name = p.get("farm_name_snapshot") or "(농장명 미상)"
        if farm_name in excluded:
            continue  # 텔레그램으로 제외 요청된 농장
        lines.append((farm_name, age))

    lines.sort(key=lambda x: x[0])

    if not lines:
        text = f"📋 {today.isoformat()} 오늘 일령\n입추일이 지난 프로그램이 없습니다."
    else:
        body = "\n".join(f"{name} : {age}일령" for name, age in lines)
        text = f"📋 {today.isoformat()} 오늘 일령\n{body}"

    send_telegram(text)


if __name__ == "__main__":
    main()
