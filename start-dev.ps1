# Starts PostgreSQL, the Django backend (port 8000) and the Vite frontend (port 5173).
$ErrorActionPreference = 'Stop'
$project = $PSScriptRoot
$backend = Join-Path $project 'backend'
$frontend = Join-Path $project 'frontend'
$python = Join-Path $backend 'venv\Scripts\python.exe'
$pgRoot = if ($env:CAMPUS_PG_ROOT) { $env:CAMPUS_PG_ROOT } else { Join-Path $env:LOCALAPPDATA 'CampusParking' }
$pgBin = Join-Path $pgRoot 'pgsql\bin'
$pgData = Join-Path $pgRoot 'data'

function Test-Port([int]$Port) {
    $client = New-Object Net.Sockets.TcpClient
    try { $client.Connect('localhost', $Port); return $true } catch { return $false } finally { $client.Close() }
}

if (Test-Port 5432) {
    Write-Host 'PostgreSQL is already running.'
} else {
    Write-Host 'Starting PostgreSQL...'
    & (Join-Path $pgBin 'pg_ctl.exe') start -D $pgData -l (Join-Path $pgRoot 'postgres.log') -w -t 60 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL did not start. See $pgRoot\postgres.log" }
}

Write-Host 'Applying database migrations...'
Push-Location $backend
try {
    & $python manage.py migrate --noinput
    if ($LASTEXITCODE -ne 0) { throw 'Database migration failed.' }
} finally { Pop-Location }

if (Test-Port 8000) {
    Write-Host 'Backend is already running on port 8000.'
} else {
    Start-Process -FilePath $python -ArgumentList 'manage.py', 'runserver', '127.0.0.1:8000' -WorkingDirectory $backend
}
if (Test-Port 5173) {
    Write-Host 'Frontend is already running on port 5173.'
} else {
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', 'npm run dev' -WorkingDirectory $frontend
}

Write-Host 'Waiting for the backend...'
foreach ($i in 1..30) {
    if (Test-Port 8000) {
        Write-Host 'Ready: http://localhost:5173'
        Start-Process 'http://localhost:5173'
        exit 0
    }
    Start-Sleep -Seconds 1
}
throw 'The backend did not start. Check its window for errors.'
