# 성남사랑상품권 가맹점 찾기

성남시가 공개하는 성남사랑상품권 가맹점 현황(24,000여 건)을 브라우저에서 필터링하고,
선택한 가맹점의 위치를 지도로 확인하는 정적 웹페이지입니다.

## 기능

- **필터** — 상호 검색, 품목, 구, 결제방법(지류 / 모바일)
- **선택** — 결과 목록에서 가맹점 하나를 고르면 하단에 상세 + 지도 표시
- **지도** — API 키 없이 동작하는 구글맵 임베드. 네이버지도 · 카카오맵 · 구글지도 새 탭 열기 버튼 제공
- **공유** — 필터와 선택 상태가 URL 쿼리에 반영되므로 링크로 그대로 공유·복원 가능

## 구조

```
index.html            페이지 마크업
style.css             스타일 (라이트/다크 자동)
app.js                필터 · 목록 · 지도 로직 (의존성 없음, ES 모듈)
data/merchants.json   변환된 가맹점 데이터
tools/convert-csv.ps1 원본 CSV → merchants.json 변환기
```

빌드 스텝이 없습니다. 파일을 그대로 서빙하면 동작합니다.

## 데이터 갱신

성남시에서 새 CSV(`가맹점현황_*.csv`)를 받은 뒤:

```powershell
pwsh -File tools/convert-csv.ps1 -Csv "C:\경로\가맹점현황_YYYYMMDDHHMMSS.xlsx - Sheet0.csv"
```

`data/merchants.json` 이 새로 생성됩니다. 커밋 후 push 하면 배포에 반영됩니다.

원본 CSV 컬럼은 `번호,품목,상호,구,주소,전화번호,결제방법` 이며, 스크립트는 이 컬럼이
없으면 실패합니다. 결제방법 문자열(`지류`, `모바일`, `지류&모바일`)은 비트플래그
(1=지류, 2=모바일)로 변환됩니다.

## 로컬 실행

`fetch` 로 JSON을 읽기 때문에 `file://` 로는 열리지 않습니다. 정적 서버가 필요합니다.

```powershell
python -m http.server 8000
# http://localhost:8000
```

## 배포 (GitHub Pages)

빌드가 없으므로 브랜치를 그대로 서빙합니다.

1. GitHub 저장소 → **Settings → Pages**
2. **Source** 를 `Deploy from a branch` 로 두고, 브랜치 `main` / 폴더 `/ (root)` 선택 후 Save
3. 몇 분 뒤 `https://didrnrgus.github.io/seongnam-gift-merchants/` 에서 확인

이후에는 `main` 에 push 할 때마다 자동으로 반영됩니다.

## 주의

공개자료 기반이므로 실제 상품권 사용 가능 여부는 매장에 확인하세요.
