#!/usr/bin/env python3
"""매일 아침 프로그램에 입추일이 입력된 농장의 오늘 일령을 텔레그램으로 전송한다.
Supabase는 service_role 키로만 읽는다(RLS를 우회하는 키라 절대 클라이언트/커밋에 넣지 않고
GitHub Actions Secret으로만 전달됨 — .github/workflows/daily-age-notify.yml 참고).

── 알림에서 특정 계군을 빼거나 다시 넣는 방법 ──────────────────────────────
이 스크립트를 실행할 때마다(=매일 아침, 또는 GitHub Actions에서 수동으로 "Run workflow"
눌렀을 때) 먼저 같은 텔레그램 채팅방에 새로 온 메시지가 있는지 확인하고, 아래 형식의
메시지를 명령으로 처리한다. 명령을 처리한 뒤에는 그 결과를 답장으로 보낸다.

  농장명               그 농장을 알림 대상에서 뺀다(계군이 하나뿐일 때만 이렇게 써도 됨)
  농장명+일령          (예: 풍천27) 그 순간 그 일령인 계군을 콕 집어서 뺀다 — 한 농장에
                       계군이 여럿(같은 농장명으로 여러 곳 운영하는 경우)일 때 이렇게 쓴다
  제외 농장명[일령]     위 둘과 같음(제거/삭제 도 같은 뜻)
  포함 농장명[일령]     다시 알림을 받는다(복원/재개 도 같은 뜻) — 뺀 계군이 하나뿐이면
                       일령 없이 이름만 보내도 된다
  목록                 현재 제외된 계군 목록을 보여준다

제외는 농장명이 아니라 그 시점의 특정 계군(program)에 건다 — 한 농장주가 같은 농장명으로
계군을 여러 개(평사/부화/오골계 등) 동시에 운영하는 경우가 있어서, 이름만으로는 어느
계군을 빼려는 건지 알 수 없기 때문이다. 후보가 여러 개면 봇이 목록을 보여주며 일령을
붙여 다시 보내달라고 답장한다. 한 메시지에 여러 줄을 적으면 줄마다 따로 처리한다.

명령은 이 스크립트가 실행되는 시점(매일 07:00 KST, 또는 수동 실행)에만 처리된다 —
텔레그램 메시지를 보낸 즉시 반응하는 건 아니다. 바로 확인하고 싶으면 저장소의
Actions 탭 → "일령 알림" 워크플로 → Run workflow 버튼으로 즉시 실행할 수 있다.
"""
import json
import os
import re
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

# 끝이 숫자(1~3자리)면 그 숫자를 일령으로, 앞부분을 이름(또는 이름의 접두어)으로 본다.
# 실제 농장명은 전부 "농장"/"축산" 등 문자로 끝나 숫자로 끝나는 경우가 없어 안전하다.
COMPACT_RE = re.compile(r"^(.+?)(\d{1,3})$")


def sb_headers():
    return {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }


def fetch_programs():
    url = (
        f"{SUPABASE_URL}/rest/v1/programs"
        "?select=id,farm_name_snapshot,placement_date,duration,species"
        "&placement_date=not.is.null"
    )
    req = urllib.request.Request(
        url,
        headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_exclusions():
    """{program_id: farm_name_snapshot(등록 당시 이름)} 형태로 돌려준다."""
    url = f"{SUPABASE_URL}/rest/v1/telegram_notify_exclusions?select=program_id,farm_name_snapshot"
    req = urllib.request.Request(url, headers=sb_headers())
    with urllib.request.urlopen(req, timeout=30) as resp:
        rows = json.loads(resp.read().decode("utf-8"))
    return {r["program_id"]: r["farm_name_snapshot"] for r in rows}


def add_exclusion(program_id, farm_name):
    url = f"{SUPABASE_URL}/rest/v1/telegram_notify_exclusions"
    headers = sb_headers()
    headers["Prefer"] = "resolution=merge-duplicates"  # 이미 있으면 이름만 최신으로 갱신
    data = json.dumps({"program_id": program_id, "farm_name_snapshot": farm_name}).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=30):
        pass


def remove_exclusion(program_id):
    url = f"{SUPABASE_URL}/rest/v1/telegram_notify_exclusions?program_id=eq.{program_id}"
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


def extract_name_and_age(text):
    """"풍천27"처럼 끝이 숫자면 (이름/접두어, 일령)으로, 아니면 (전체, None)으로 나눈다."""
    text = text.strip()
    m = COMPACT_RE.match(text)
    if m:
        name = m.group(1).strip()
        if name:
            return name, int(m.group(2))
    return text, None


def parse_command(line):
    """한 줄을 (종류, 이름/접두어, 일령 또는 None) 으로 해석한다. 종류는
    'exclude' | 'include' | 'list'. 아무 키워드도 없이 이름(+숫자)만 적으면
    'exclude'로 본다(가장 흔한 사용법이라 접두어를 안 붙여도 되게 하기 위함).

    먼저 줄 전체를 strip한 뒤에 키워드+공백("제외 ")을 찾으면 안 된다 — 원본에
    "제외 "처럼 키워드만 있고 이름이 없는 줄은 strip으로 뒤 공백이 없어져 "제외"만
    남고, 그러면 keyword(공백 포함)와 더 이상 안 맞아 catch-all로 빠져 "제외"라는
    이름을 제외하려는 것처럼 잘못 해석된다. 그래서 키워드와 정확히 같은 경우(이름
    없음)를 먼저 걸러낸 뒤에 접두어를 뗀다.
    """
    line = line.strip()
    if not line:
        return None
    if line.lower() in LIST_KEYWORDS:
        return ("list", None, None)
    for kind, keywords in (("include", INCLUDE_KEYWORDS), ("exclude", EXCLUDE_KEYWORDS)):
        for kw in keywords:
            bare = kw.rstrip(" :")
            if line == bare:
                return None  # 키워드만 있고 이름이 없음
            if line.startswith(kw):
                rest = line[len(kw):].strip()
                if not rest:
                    return None
                name, age = extract_name_and_age(rest)
                return (kind, name, age)
    name, age = extract_name_and_age(line)
    return ("exclude", name, age)


def find_candidates(name_query, day_age_hint, entries):
    """entries: {"farm_name_snapshot": str, "age": int|None, ...} 형태의 딕셔너리 목록에서
    이름이 정확히 같은 것을 우선 찾고, 없으면 이름이 그 접두어로 시작하는 것을 찾는다.
    일령이 주어졌으면 그 일령인 것만 남긴다."""
    exact = [e for e in entries if e["farm_name_snapshot"] == name_query]
    candidates = exact if exact else [e for e in entries if e["farm_name_snapshot"].startswith(name_query)]
    if day_age_hint is not None:
        candidates = [e for e in candidates if e.get("_age") == day_age_hint]
    return candidates


def candidate_line(e):
    age = e.get("_age")
    return f"- {e['farm_name_snapshot']} {age}일령" if age is not None else f"- {e['farm_name_snapshot']} (일령 확인 불가)"


def process_telegram_commands(programs_today):
    """새로 들어온 제외/포함/목록 명령을 처리하고 답장을 보낸다. 처리한 메시지는
    Telegram 서버 쪽에 "확인됨"으로 표시해(offset 갱신) 다음 실행 때 또 처리하지
    않게 한다 — 이 스크립트는 매번 새 GitHub Actions 러너에서 실행되어 자체적으로
    상태를 들고 있지 않으므로, Telegram이 그 상태를 대신 들고 있게 하는 셈이다.

    programs_today: fetch_programs() 결과에 오늘 기준 일령(_age)을 계산해 붙인 것.
    (일일 알림 본문과 달리, 육계 35일령 컷·최소 1일령 같은 필터 없이 placement_date가
    있는 모든 계군을 대상으로 한다 — 컷 근처 계군도 이름/일령으로 정확히 찾을 수 있어야
    한다.)"""
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
        text = msg.get("text") or ""
        for line in text.splitlines():
            cmd = parse_command(line)
            if not cmd:
                continue
            kind, name, age = cmd

            if kind == "list":
                exclusions = fetch_exclusions()
                if not exclusions:
                    replies.append("🔕 현재 제외된 계군이 없습니다.")
                    continue
                by_id = {p["id"]: p for p in programs_today}
                items = []
                for pid, fname in exclusions.items():
                    p = by_id.get(pid)
                    items.append({"farm_name_snapshot": fname, "_age": p["_age"] if p else None})
                items.sort(key=lambda e: e["farm_name_snapshot"])
                replies.append("🔕 현재 제외된 계군 (" + str(len(items)) + "곳)\n" + "\n".join(candidate_line(e) for e in items))
                continue

            if kind == "exclude":
                candidates = find_candidates(name, age, programs_today)
                if not candidates:
                    hint = f"{name}{age}" if age is not None else name
                    replies.append(f"❌ '{hint}'에 해당하는 계군을 찾지 못했습니다. 오늘 알림 대상 농장명·일령을 확인해주세요.")
                elif len(candidates) > 1:
                    listing = "\n".join(candidate_line(p) for p in candidates)
                    replies.append(f"⚠️ '{name}'에 해당하는 계군이 여러 곳입니다. 일령을 붙여 다시 보내주세요(예: {candidates[0]['farm_name_snapshot']}{candidates[0]['_age']}):\n{listing}")
                else:
                    p = candidates[0]
                    add_exclusion(p["id"], p["farm_name_snapshot"])
                    replies.append(f"✅ '{p['farm_name_snapshot']} {p['_age']}일령' 알림에서 제외했습니다.")
                continue

            if kind == "include":
                exclusions = fetch_exclusions()
                by_id = {p["id"]: p for p in programs_today}
                entries = []
                for pid, fname in exclusions.items():
                    p = by_id.get(pid)
                    entries.append({"id": pid, "farm_name_snapshot": fname, "_age": p["_age"] if p else None})
                candidates = find_candidates(name, age, entries)
                if not candidates:
                    hint = f"{name}{age}" if age is not None else name
                    replies.append(f"ℹ️ '{hint}'은(는) 현재 제외 목록에 없습니다.")
                elif len(candidates) > 1:
                    listing = "\n".join(candidate_line(e) for e in candidates)
                    replies.append(f"⚠️ '{name}'에 해당하는 제외 계군이 여러 곳입니다. 일령을 붙여 다시 보내주세요:\n{listing}")
                else:
                    e = candidates[0]
                    remove_exclusion(e["id"])
                    replies.append(f"✅ '{e['farm_name_snapshot']}' 알림을 다시 받습니다.")
                continue

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
    for p in programs:
        p["_age"] = day_age(p["placement_date"], today)

    process_telegram_commands(programs)
    excluded_ids = set(fetch_exclusions().keys())

    lines = []
    for p in programs:
        age = p["_age"]
        if age < 1:
            continue  # 아직 입추 전인 프로그램은 제외
        # 육계는 보통 35일령 전후로 출하된다. js/batches.js의 computeBatchDisplayStatus()가
        # "출하완료"로 표시 전환하는 것과 같은 기준(육계 && 35일령 초과)으로, 이미 출하됐을
        # 프로그램은 매일 알림에서 제외한다(대시보드 표시와 달리 이 값은 DB 컬럼을 바꾸는
        # 게 아니라 알림 발송 여부만 결정하므로 status 컬럼과는 무관하다).
        if p.get("species") == "육계" and age > 35:
            continue
        if p["id"] in excluded_ids:
            continue  # 텔레그램으로 제외 요청된 계군
        farm_name = p.get("farm_name_snapshot") or "(농장명 미상)"
        lines.append((farm_name, age))

    lines.sort(key=lambda x: x[1])  # 일령 어린(작은) 순

    if not lines:
        text = f"📋 {today.isoformat()} 오늘 일령\n입추일이 지난 프로그램이 없습니다."
    else:
        body = "\n".join(f"{name} : {age}일령" for name, age in lines)
        text = f"📋 {today.isoformat()} 오늘 일령\n{body}"

    send_telegram(text)


if __name__ == "__main__":
    main()
