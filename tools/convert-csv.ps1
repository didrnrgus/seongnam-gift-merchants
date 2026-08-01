<#
.SYNOPSIS
  성남사랑상품권 가맹점 CSV를 웹페이지용 compact JSON으로 변환합니다.

.DESCRIPTION
  원본 CSV 컬럼: 번호,품목,상호,구,주소,전화번호,결제방법
  출력(data/merchants.json)은 카테고리 값을 사전(index)으로 치환해 용량을 줄인 형태입니다.

    {
      "source": "<원본 파일명>",
      "count":  <레코드 수>,
      "cat":    ["음식점업", ...],        // 품목 사전
      "gu":     ["분당구", ...],           // 구 사전
      "rows":   [[catIdx, gu, 상호, 주소, 전화, payMask], ...]
    }

  payMask 는 비트플래그: 1=지류, 2=모바일, 3=지류&모바일

.EXAMPLE
  pwsh -File tools/convert-csv.ps1 -Csv "C:\Users\me\Downloads\가맹점현황_20260706214002.xlsx - Sheet0.csv"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string] $Csv,

    [string] $Out = (Join-Path $PSScriptRoot '..\data\merchants.json')
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Csv)) {
    throw "CSV를 찾을 수 없습니다: $Csv"
}

Write-Host "읽는 중: $Csv"
$records = Import-Csv -LiteralPath $Csv -Encoding UTF8

$required = @('품목', '상호', '구', '주소', '전화번호', '결제방법')
$columns = $records[0].PSObject.Properties.Name
foreach ($col in $required) {
    if ($columns -notcontains $col) {
        throw "필수 컬럼 '$col' 이(가) 없습니다. 발견된 컬럼: $($columns -join ', ')"
    }
}

# 카테고리 사전. 등장 순서가 아니라 정렬 순서로 고정해 재생성 시 diff 를 안정적으로 유지합니다.
$catList = @($records.품목 | Sort-Object -Unique)
$guList = @($records.구   | Sort-Object -Unique)

$catIndex = @{}; for ($i = 0; $i -lt $catList.Count; $i++) { $catIndex[$catList[$i]] = $i }
$guIndex = @{}; for ($i = 0; $i -lt $guList.Count; $i++) { $guIndex[$guList[$i]] = $i }

$rows = [System.Collections.Generic.List[object]]::new()
$skipped = 0

foreach ($r in $records) {
    $name = ($r.상호 ?? '').Trim()
    $addr = ($r.주소 ?? '').Trim()

    # 상호나 주소가 비면 목록에서도 지도에서도 쓸모가 없으므로 버립니다.
    if (-not $name -or -not $addr) { $skipped++; continue }

    $pay = ($r.결제방법 ?? '')
    $mask = 0
    if ($pay -match '지류') { $mask = $mask -bor 1 }
    if ($pay -match '모바일') { $mask = $mask -bor 2 }

    $rows.Add(@(
            $catIndex[$r.품목],
            $guIndex[$r.구],
            $name,
            $addr,
        ($r.전화번호 ?? '').Trim(),
            $mask
        ))
}

$payload = [ordered]@{
    source = Split-Path -Leaf $Csv
    count  = $rows.Count
    cat    = $catList
    gu     = $guList
    rows   = $rows
}

$outDir = Split-Path -Parent $Out
if (-not (Test-Path -LiteralPath $outDir)) {
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null
}

# -Depth 5: rows 가 배열의 배열이라 기본 깊이(2)로는 잘립니다.
$json = $payload | ConvertTo-Json -Depth 5 -Compress
[System.IO.File]::WriteAllText((Resolve-Path -LiteralPath $outDir).Path + [System.IO.Path]::DirectorySeparatorChar + (Split-Path -Leaf $Out), $json, (New-Object System.Text.UTF8Encoding $false))

$sizeMb = [math]::Round((Get-Item -LiteralPath $Out).Length / 1MB, 2)
Write-Host "완료: $Out"
Write-Host "  레코드 $($rows.Count)건 (건너뜀 $($skipped)건), 품목 $($catList.Count)종, 구 $($guList.Count)곳, ${sizeMb}MB"
