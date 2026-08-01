<#
.SYNOPSIS
  이 저장소의 git 훅을 활성화합니다.

.DESCRIPTION
  tools/hooks 를 훅 경로로 지정해, 커밋할 때마다 version.json 의 빌드 번호가
  자동으로 올라가게 합니다. 저장소를 새로 클론했다면 한 번 실행하세요.
  (.git/hooks 는 버전 관리 대상이 아니라 클론에 따라오지 않습니다.)
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
git -C $repo config core.hooksPath tools/hooks

$hook = Join-Path $repo 'tools/hooks/pre-commit'
if (Test-Path -LiteralPath $hook) {
    # Windows 에서는 파일 모드가 무의미하지만, WSL/맥에서 클론했을 때를 위해 맞춰둡니다.
    git -C $repo update-index --chmod=+x tools/hooks/pre-commit 2>$null | Out-Null
}

Write-Host "훅 설치 완료: core.hooksPath = tools/hooks"
Write-Host "이제 커밋할 때마다 version.json 의 build 가 1씩 올라갑니다."
