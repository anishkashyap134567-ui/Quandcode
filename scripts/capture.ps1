# PowerShell Script to capture a cropped screenshot of only the QuandCode TUI window

# Define Win32 API to get window coordinates
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class Win32 {
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }
}
"@

# 1. Start the TUI in a new command prompt window with a specific title
$process = Start-Process cmd.exe -ArgumentList '/c title QuandCodeTUI && cd "c:\Users\Anish\OneDrive\Documents\Big project\quandcode" && bun run quandcode' -PassThru

# 2. Wait for the window handle to be available
$hwnd = [IntPtr]::Zero
for ($i = 0; $i -lt 10; $i++) {
    Start-Sleep -Milliseconds 500
    $process.Refresh()
    $hwnd = $process.MainWindowHandle
    if ($hwnd -ne [IntPtr]::Zero) {
        break
    }
}

# If still Zero, try to find a process with title containing "QuandCodeTUI"
if ($hwnd -eq [IntPtr]::Zero) {
    Start-Sleep -Seconds 1
    $allProcesses = Get-Process
    foreach ($p in $allProcesses) {
        if ($p.MainWindowTitle -like "*QuandCodeTUI*") {
            $hwnd = $p.MainWindowHandle
            break
        }
    }
}

# Allow 3 more seconds for the cyberpunk banner and TUI to fully render
Start-Sleep -Seconds 3

# 3. Capture the window using .NET drawing assemblies
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$rect = New-Object Win32+RECT
if ($hwnd -ne [IntPtr]::Zero -and [Win32]::GetWindowRect($hwnd, [ref]$rect)) {
    $width = $rect.Right - $rect.Left
    $height = $rect.Bottom - $rect.Top

    # Create bitmap matching the window dimensions
    $bitmap = New-Object System.Drawing.Bitmap $width, $height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

    # Copy window pixels from the screen
    $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size $width, $height))

    # Ensure output directory exists
    $outputDir = "c:\Users\Anish\OneDrive\Documents\Big project\quandcode\media"
    if (-not (Test-Path $outputDir)) {
        New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
    }

    # Save cropped image
    $outputPath = Join-Path $outputDir "tui_screenshot.png"
    $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

    # Dispose drawing resources
    $graphics.Dispose()
    $bitmap.Dispose()

    Write-Host "Cropped terminal screenshot successfully saved to $outputPath"
} else {
    Write-Warning "Could not find TUI window handle. Capturing primary screen instead as fallback."
    
    $screen = [System.Windows.Forms.Screen]::PrimaryScreen
    $bounds = $screen.Bounds
    $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    
    $outputDir = "c:\Users\Anish\OneDrive\Documents\Big project\quandcode\media"
    if (-not (Test-Path $outputDir)) {
        New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
    }
    $outputPath = Join-Path $outputDir "tui_screenshot.png"
    $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    $graphics.Dispose()
    $bitmap.Dispose()
    Write-Host "Screenshot successfully saved to $outputPath"
}

# 4. Close the spawned terminal window
Stop-Process -Id $process.Id -Force
