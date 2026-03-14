# Migration Script for LiteDB VS Code Extension Optimization

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "LiteDB VS Code Extension - Migration" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Backup current files
Write-Host "[1/6] Creating backup..." -ForegroundColor Yellow
$backupDir = ".\backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
Copy-Item ".\src\*" -Destination "$backupDir\src\" -Recurse -Force
Copy-Item ".\backend\*" -Destination "$backupDir\backend\" -Recurse -Force
Write-Host "      Backup created at: $backupDir" -ForegroundColor Green

# Step 2: Replace main extension file
Write-Host "[2/6] Replacing extension.ts..." -ForegroundColor Yellow
if (Test-Path ".\src\extension_new.ts") {
    Copy-Item ".\src\extension_new.ts" -Destination ".\src\extension.ts" -Force
    Remove-Item ".\src\extension_new.ts" -Force
    Write-Host "      extension.ts updated" -ForegroundColor Green
} else {
    Write-Host "      WARNING: extension_new.ts not found!" -ForegroundColor Red
}

# Step 3: Replace backend Program.cs
Write-Host "[3/6] Replacing Program.cs..." -ForegroundColor Yellow
if (Test-Path ".\backend\LiteDbBridge\Program_new.cs") {
    Copy-Item ".\backend\LiteDbBridge\Program_new.cs" -Destination ".\backend\LiteDbBridge\Program.cs" -Force
    Remove-Item ".\backend\LiteDbBridge\Program_new.cs" -Force
    Write-Host "      Program.cs updated" -ForegroundColor Green
} else {
    Write-Host "      WARNING: Program_new.cs not found!" -ForegroundColor Red
}

# Step 4: Remove old files that have been reorganized
Write-Host "[4/6] Cleaning up old files..." -ForegroundColor Yellow
$filesToRemove = @(
    ".\src\dotnetBridgeManager.ts",
    ".\src\completionProvider.ts",
    ".\src\CollectionItem.ts",
    ".\src\LiteDbState.ts",
    ".\src\gridRenderer.ts",
    ".\src\queryHelpers.ts",
    ".\src\LiteDbCollectionsProvider.ts",
    ".\src\LiteDbResultViewProvider.ts"
)

foreach ($file in $filesToRemove) {
    if (Test-Path $file) {
        Remove-Item $file -Force
        Write-Host "      Removed: $file" -ForegroundColor Gray
    }
}
Write-Host "      Old files removed" -ForegroundColor Green

# Step 5: Compile TypeScript
Write-Host "[5/6] Compiling TypeScript..." -ForegroundColor Yellow
try {
    npm run compile
    if ($LASTEXITCODE -eq 0) {
        Write-Host "      Compilation successful" -ForegroundColor Green
    } else {
        Write-Host "      Compilation completed with warnings" -ForegroundColor Yellow
    }
} catch {
    Write-Host "      ERROR: Compilation failed!" -ForegroundColor Red
    Write-Host "      Please run 'npm run compile' manually to see errors" -ForegroundColor Red
}

# Step 6: Build backend
Write-Host "[6/6] Building .NET backend..." -ForegroundColor Yellow
Push-Location ".\backend\LiteDbBridge"
try {
    dotnet build --configuration Release
    if ($LASTEXITCODE -eq 0) {
        Write-Host "      Backend build successful" -ForegroundColor Green
    } else {
        Write-Host "      Backend build completed with warnings" -ForegroundColor Yellow
    }
} catch {
    Write-Host "      ERROR: Backend build failed!" -ForegroundColor Red
}
Pop-Location

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Migration Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "1. Review changes in VSCode" -ForegroundColor White
Write-Host "2. Test the extension (F5 to debug)" -ForegroundColor White
Write-Host "3. If issues occur, restore from: $backupDir" -ForegroundColor White
Write-Host ""
Write-Host "For details, see OPTIMIZATION_REPORT.md" -ForegroundColor Cyan
