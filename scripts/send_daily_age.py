#!/usr/bin/env python3
"""매일 아침 프로그램에 입추일이 입력된 농장의 오늘 일령을 텔레그램으로 전송한다.
Supabase는 service_role 키로만 읽는다(RLS를 우회하는 키라 절대 클라이언트/커밋에 넣지 않고
GitHub Actions Secret으로만 전달됨 — .github/workflows/daily-age-notify.yml 참고).
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


def main():
    today = datetime.now(KST).date()
    programs = fetch_programs()

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
