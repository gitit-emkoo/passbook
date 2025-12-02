# WiFi 무선 디버깅 자동 연결 스크립트
# USB 케이블 없이 휴대폰을 WiFi로 연결합니다

$ADB_PATH = "C:\Users\cns83\platform-tools\adb.exe"

Write-Host "=== WiFi 무선 디버깅 연결 ===" -ForegroundColor Cyan

# ADB 경로 확인
if (-not (Test-Path $ADB_PATH)) {
    Write-Host "오류: ADB를 찾을 수 없습니다. 경로를 확인해주세요: $ADB_PATH" -ForegroundColor Red
    exit 1
}

# 현재 연결된 기기 확인
Write-Host "`n현재 연결된 기기 확인 중..." -ForegroundColor Yellow
$devices = & $ADB_PATH devices
Write-Host $devices

# USB로 연결된 기기가 있는지 확인
$usbDevice = $devices | Select-String -Pattern "device$" | Where-Object { $_.Line -notmatch "5555" }

if ($usbDevice) {
    Write-Host "`nUSB로 연결된 기기를 찾았습니다. TCP/IP 모드로 전환합니다..." -ForegroundColor Green
    & $ADB_PATH tcpip 5555
    Start-Sleep -Seconds 2
} else {
    Write-Host "`nUSB로 연결된 기기가 없습니다." -ForegroundColor Yellow
}

# WiFi로 이미 연결된 기기 확인
$wifiDevices = $devices | Select-String -Pattern ":5555"

if ($wifiDevices) {
    Write-Host "`n이미 WiFi로 연결된 기기가 있습니다:" -ForegroundColor Green
    $wifiDevices | ForEach-Object { Write-Host "  - $($_.Line)" }
    
    $reconnect = Read-Host "`n다시 연결하시겠습니까? (y/n)"
    if ($reconnect -eq "y" -or $reconnect -eq "Y") {
        $wifiDevices | ForEach-Object {
            $ip = ($_.Line -split "\s+")[0]
            Write-Host "연결 해제: $ip" -ForegroundColor Yellow
            & $ADB_PATH disconnect $ip
        }
        Start-Sleep -Seconds 1
    } else {
        Write-Host "`n현재 연결을 유지합니다." -ForegroundColor Green
        & $ADB_PATH devices
        exit 0
    }
}

# 기기 IP 주소 입력
Write-Host "`n기기의 IP 주소를 입력해주세요." -ForegroundColor Cyan
Write-Host "확인 방법: 설정 > Wi-Fi > 연결된 네트워크 정보" -ForegroundColor Gray
$deviceIp = Read-Host "IP 주소 (예: 192.168.0.100)"

if ([string]::IsNullOrWhiteSpace($deviceIp)) {
    Write-Host "IP 주소가 입력되지 않았습니다." -ForegroundColor Red
    exit 1
}

# IP 주소 형식 검증
if ($deviceIp -notmatch "^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$") {
    Write-Host "올바른 IP 주소 형식이 아닙니다." -ForegroundColor Red
    exit 1
}

# WiFi로 연결 시도
Write-Host "`nWiFi로 연결 시도 중: $deviceIp:5555" -ForegroundColor Yellow
$connectResult = & $ADB_PATH connect "$deviceIp:5555" 2>&1

if ($LASTEXITCODE -eq 0 -or $connectResult -match "connected") {
    Write-Host "연결 성공!" -ForegroundColor Green
    Start-Sleep -Seconds 1
    
    # 연결 확인
    Write-Host "`n연결된 기기 목록:" -ForegroundColor Cyan
    & $ADB_PATH devices
} else {
    Write-Host "연결 실패: $connectResult" -ForegroundColor Red
    Write-Host "`n문제 해결 방법:" -ForegroundColor Yellow
    Write-Host "1. 기기와 PC가 같은 WiFi 네트워크에 연결되어 있는지 확인" -ForegroundColor Gray
    Write-Host "2. 기기의 IP 주소가 올바른지 확인" -ForegroundColor Gray
    Write-Host "3. 처음 한 번은 USB로 연결하여 'adb tcpip 5555' 실행 필요" -ForegroundColor Gray
    Write-Host "4. Android 11+ 사용 시: 설정 > 개발자 옵션 > 무선 디버깅 사용" -ForegroundColor Gray
    exit 1
}

Write-Host "`n완료!" -ForegroundColor Green

