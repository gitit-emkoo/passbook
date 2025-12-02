# WiFi 무선 디버깅 자동 연결 스크립트 (자동 IP 감지)
# Android 11+ 무선 디버깅 또는 기존 연결 정보 사용

$ADB_PATH = "C:\Users\cns83\platform-tools\adb.exe"

Write-Host "=== WiFi 무선 디버깅 자동 연결 ===" -ForegroundColor Cyan

# ADB 경로 확인
if (-not (Test-Path $ADB_PATH)) {
    Write-Host "오류: ADB를 찾을 수 없습니다. 경로를 확인해주세요: $ADB_PATH" -ForegroundColor Red
    exit 1
}

# 저장된 IP 주소 파일
$IP_FILE = "$env:USERPROFILE\.android_device_ip"

# 저장된 IP 주소 읽기
$savedIp = $null
if (Test-Path $IP_FILE) {
    $savedIp = Get-Content $IP_FILE -Raw | ForEach-Object { $_.Trim() }
    Write-Host "`n저장된 IP 주소: $savedIp" -ForegroundColor Gray
}

# 현재 연결된 기기 확인
Write-Host "`n현재 연결 상태 확인 중..." -ForegroundColor Yellow
$devices = & $ADB_PATH devices
$connectedDevices = $devices | Select-String -Pattern "device$"

if ($connectedDevices) {
    Write-Host "`n이미 연결된 기기:" -ForegroundColor Green
    $connectedDevices | ForEach-Object { Write-Host "  - $($_.Line)" }
    
    $wifiDevice = $connectedDevices | Where-Object { $_.Line -match ":5555" }
    if ($wifiDevice) {
        Write-Host "`nWiFi로 연결된 기기가 이미 있습니다." -ForegroundColor Green
        & $ADB_PATH devices
        exit 0
    }
}

# USB로 연결된 기기가 있으면 TCP/IP 모드로 전환
$usbDevice = $devices | Select-String -Pattern "device$" | Where-Object { $_.Line -notmatch ":5555" }

if ($usbDevice) {
    Write-Host "`nUSB로 연결된 기기를 찾았습니다. TCP/IP 모드로 전환합니다..." -ForegroundColor Green
    & $ADB_PATH tcpip 5555
    Start-Sleep -Seconds 2
    
    # USB 연결된 기기에서 IP 주소 가져오기 시도
    Write-Host "기기 IP 주소 확인 중..." -ForegroundColor Yellow
    $ipResult = & $ADB_PATH shell "ip -f inet addr show wlan0 | grep -oP 'inet \K[\d.]+'" 2>&1
    
    if ($ipResult -and $ipResult -match "^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$") {
        $deviceIp = $ipResult.Trim()
        Write-Host "기기 IP 주소: $deviceIp" -ForegroundColor Green
        
        # IP 주소 저장
        $deviceIp | Out-File -FilePath $IP_FILE -Encoding utf8 -NoNewline
    } else {
        Write-Host "IP 주소를 자동으로 가져올 수 없습니다." -ForegroundColor Yellow
        if ($savedIp) {
            $deviceIp = $savedIp
            Write-Host "저장된 IP 주소 사용: $deviceIp" -ForegroundColor Gray
        } else {
            $deviceIp = Read-Host "`n기기 IP 주소를 입력해주세요 (예: 192.168.0.100)"
            if ($deviceIp) {
                $deviceIp | Out-File -FilePath $IP_FILE -Encoding utf8 -NoNewline
            }
        }
    }
} else {
    # USB 연결이 없으면 저장된 IP 또는 입력받기
    if ($savedIp) {
        Write-Host "`n저장된 IP 주소 사용: $savedIp" -ForegroundColor Gray
        $deviceIp = $savedIp
    } else {
        Write-Host "`n기기 IP 주소를 입력해주세요." -ForegroundColor Cyan
        Write-Host "확인 방법: 설정 > Wi-Fi > 연결된 네트워크 정보" -ForegroundColor Gray
        $deviceIp = Read-Host "IP 주소 (예: 192.168.0.100)"
        
        if ($deviceIp) {
            $deviceIp | Out-File -FilePath $IP_FILE -Encoding utf8 -NoNewline
        }
    }
}

if ([string]::IsNullOrWhiteSpace($deviceIp)) {
    Write-Host "IP 주소가 입력되지 않았습니다." -ForegroundColor Red
    exit 1
}

# IP 주소 형식 검증
if ($deviceIp -notmatch "^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$") {
    Write-Host "올바른 IP 주소 형식이 아닙니다." -ForegroundColor Red
    exit 1
}

# 기존 WiFi 연결 해제 (있는 경우)
$existingWifi = $devices | Select-String -Pattern ":5555"
if ($existingWifi) {
    $existingWifi | ForEach-Object {
        $ip = ($_.Line -split "\s+")[0]
        Write-Host "기존 연결 해제: $ip" -ForegroundColor Yellow
        & $ADB_PATH disconnect $ip 2>&1 | Out-Null
    }
    Start-Sleep -Seconds 1
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

