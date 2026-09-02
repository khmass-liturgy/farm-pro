# sms-relay — 알리고 고정 IP 중계 서버

## 이게 왜 필요한가

알리고는 관리자 페이지(발송 서버 IP 등록)에 미리 등록해둔 IP에서 온 요청만
허용합니다. 등록 안 된 IP로 호출하면 `인증오류입니다.-IP` 오류가 납니다.
Supabase Edge Function은 서버리스라 나가는 IP가 매번 달라질 수 있어, 알리고를
직접 호출할 수 없습니다.

그래서 고정 IP를 가진 이 작은 서버(`server.js`)를 알리고 앞에 하나 세우고,
알리고에는 **이 서버의 IP 하나만** 등록해둡니다.

```
브라우저 → Supabase Edge Function(로그인 확인) → 이 서버(고정 IP) → 알리고
```

알리고 인증키(`ALIGO_API_KEY`/`ALIGO_USER_ID`)는 이 서버의 환경변수에만
있고, Edge Function은 이 서버를 부르는 `SMS_RELAY_URL` / `SMS_RELAY_SECRET`
두 값만 압니다.

## 준비물

- Oracle Cloud 계정 (Always Free 티어로 충분, 카드 등록은 필요하지만 이 용도로는
  과금되지 않습니다)
- `server.js`를 올릴 서버 하나 (Ubuntu 기준으로 아래 설명)

## 1. VM 생성

Oracle Cloud 콘솔 → Compute → Instances → **Create instance**

- Image: **Ubuntu 22.04** (Always Free eligible로 표시된 것)
- Shape: Always Free eligible shape 아무거나 (E2.1.Micro 또는 Ampere A1)
- 나머지는 기본값으로 생성하고, **공인 IP 주소를 메모**해둡니다.

## 2. 방화벽 열기 (80, 443)

**두 군데 다 열어야 합니다** — Oracle 콘솔에서 하나, VM 안에서 하나. 하나만
열면 계속 접속이 안 됩니다.

**(1) Oracle 콘솔**: VM 상세 → Subnet → Security List (또는 VM에 연결된
Network Security Group) → Ingress Rules 추가:
- Source `0.0.0.0/0`, TCP, 대상 포트 `80`
- Source `0.0.0.0/0`, TCP, 대상 포트 `443`

**(2) VM 안 (SSH 접속 후)** — Oracle의 Ubuntu 이미지는 iptables가 기본으로
80/443을 막아둡니다:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

## 3. Node.js 설치

Ubuntu 22.04의 apt 기본 버전은 오래됐으므로 NodeSource로 최신 LTS를 받습니다
(내장 `fetch`를 쓰므로 Node 18 이상이 필요합니다):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # v20.x 확인
```

## 4. Caddy 설치 (자동 HTTPS)

도메인이 없어도 [nip.io](https://nip.io) 무료 매직 DNS로 인증서를 받을 수
있습니다. VM의 공인 IP가 `140.238.55.10`이라면 호스트명은
`140-238-55-10.nip.io` 처럼 IP를 대시(`-`)로 이어붙인 형태입니다.

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`을 열어(`sudo nano /etc/caddy/Caddyfile`) 전체 내용을
아래로 바꿉니다 (자기 IP로 바꿔서):

```
140-238-55-10.nip.io {
    reverse_proxy localhost:8080
}
```

```bash
sudo systemctl restart caddy
```

## 5. server.js 올리기

이 폴더의 `server.js`를 VM의 `/opt/sms-relay/server.js`로 복사합니다 (scp,
또는 `sudo nano /opt/sms-relay/server.js`로 붙여넣기 — 외부 npm 패키지가
없는 파일이라 그대로 붙여넣어도 됩니다).

```bash
sudo mkdir -p /opt/sms-relay
# server.js 내용을 /opt/sms-relay/server.js 에 붙여넣기
```

## 6. 환경변수 파일

알리고 관리자 페이지 → **API 연동 관리**에서 확인한 실제 값으로 채웁니다.
`RELAY_SECRET`은 아무 문자열이나 직접 만든 긴 무작위 값이면 됩니다(예:
`openssl rand -hex 32`로 생성).

```bash
sudo tee /etc/sms-relay.env > /dev/null <<'EOF'
ALIGO_API_KEY=실제_알리고_API_Key
ALIGO_USER_ID=실제_알리고_로그인_아이디
ALIGO_SENDER=발신번호(숫자만, 예:01091508844)
RELAY_SECRET=여기에_긴_무작위_문자열
PORT=8080
EOF
sudo chmod 600 /etc/sms-relay.env
```

## 7. systemd 서비스 등록 (재부팅해도 자동 실행)

```bash
sudo tee /etc/systemd/system/sms-relay.service > /dev/null <<'EOF'
[Unit]
Description=SMS relay for Aligo (fixed-IP proxy)
After=network.target

[Service]
EnvironmentFile=/etc/sms-relay.env
ExecStart=/usr/bin/node /opt/sms-relay/server.js
Restart=always
User=nobody

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now sms-relay
sudo systemctl status sms-relay   # active (running) 확인
```

## 8. 동작 확인

VM 안에서:
```bash
curl http://localhost:8080/health   # {"ok":true}
```

밖에서 (본인 PC에서):
```bash
curl https://140-238-55-10.nip.io/health
```
(IP는 실제 값으로 바꾸세요) — 여기서도 `{"ok":true}`가 나오면 Caddy까지
정상입니다.

## 9. 알리고에 이 서버의 IP 등록

알리고 관리자 페이지 → **API 연동 관리** → "발송 서버 IP"에서, 지금까지
등록했던 PC IP 등이 있다면 삭제하고 **이 VM의 공인 IP**를 새로 추가합니다.

## 10. Supabase 시크릿 갱신

Supabase 대시보드 → Edge Functions → Secrets에서:
- `SMS_RELAY_URL` = `https://140-238-55-10.nip.io/send-sms` (실제 IP로)
- `SMS_RELAY_SECRET` = 6번에서 `/etc/sms-relay.env`에 넣은 `RELAY_SECRET`과
  **정확히 같은 값**
- 기존에 있던 `ALIGO_API_KEY`, `ALIGO_USER_ID`는 삭제(이제 이 함수가 아니라
  sms-relay 서버 쪽에만 있으면 됨)

그리고 Edge Functions → `send-sms` → Code 탭에서 `supabase/functions/send-sms/index.ts`의
최신 코드(중계 서버로 전달하는 버전)를 붙여넣고 다시 배포합니다.

## 11. 최종 테스트

farm-pro 앱에서 Ctrl+F5 → **💬 문자 발송** → 본인 번호로 테스트 발송.

## 운영 중 참고

- **코드 수정 후**: `/opt/sms-relay/server.js`를 고치고 `sudo systemctl restart sms-relay`
- **로그 보기**: `sudo journalctl -u sms-relay -f`
- **VM의 공인 IP가 바뀌면** (재시작 등으로): 알리고 IP 등록, Caddyfile의
  호스트명, Supabase의 `SMS_RELAY_URL` 세 곳을 모두 새 IP로 맞춰야 합니다.
  Oracle Cloud는 인스턴스를 중지했다가 다시 켜면 공인 IP가 바뀔 수 있으니,
  가능하면 **예약 공인 IP(Reserved Public IP)**를 할당해 고정해두세요.
