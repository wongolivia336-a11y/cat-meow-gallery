# 找出精灵图里所有连通的不透明区域（8 邻接），报告 bbox / 像素数 / 质心。
# 目的：不再按刚性网格切图，而是按"内容实际长在哪"切。
Add-Type -AssemblyName System.Drawing

$path = Resolve-Path "assets\domi-sprite-sheet-v1.png"
$bmp = New-Object System.Drawing.Bitmap($path.Path)
$W = $bmp.Width; $H = $bmp.Height

$rect = New-Object System.Drawing.Rectangle(0, 0, $W, $H)
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$stride = $data.Stride
$bytes = New-Object byte[] ($stride * $H)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
$bmp.UnlockBits($data)
$bmp.Dispose()

# alpha > 24 视为有内容
$solid = New-Object bool[] ($W * $H)
for ($y = 0; $y -lt $H; $y++) {
  $row = $y * $stride
  $base = $y * $W
  for ($x = 0; $x -lt $W; $x++) {
    if ($bytes[$row + $x * 4 + 3] -gt 24) { $solid[$base + $x] = $true }
  }
}

$label = New-Object int[] ($W * $H)
$stack = New-Object int[] ($W * $H)
$components = New-Object System.Collections.ArrayList
$next = 0

for ($i = 0; $i -lt $solid.Length; $i++) {
  if (-not $solid[$i] -or $label[$i] -ne 0) { continue }
  $next++
  $sp = 0; $stack[$sp++] = $i; $label[$i] = $next
  $minX = $W; $maxX = 0; $minY = $H; $maxY = 0; $count = 0
  [double]$sumX = 0; [double]$sumY = 0

  while ($sp -gt 0) {
    $p = $stack[--$sp]
    $py = [int][math]::Floor($p / $W); $px = $p - $py * $W
    $count++; $sumX += $px; $sumY += $py
    if ($px -lt $minX) { $minX = $px }; if ($px -gt $maxX) { $maxX = $px }
    if ($py -lt $minY) { $minY = $py }; if ($py -gt $maxY) { $maxY = $py }

    for ($dy = -1; $dy -le 1; $dy++) {
      $ny = $py + $dy
      if ($ny -lt 0 -or $ny -ge $H) { continue }
      for ($dx = -1; $dx -le 1; $dx++) {
        $nx = $px + $dx
        if ($nx -lt 0 -or $nx -ge $W) { continue }
        $q = $ny * $W + $nx
        if ($solid[$q] -and $label[$q] -eq 0) { $label[$q] = $next; $stack[$sp++] = $q }
      }
    }
  }

  # 小于 200 像素的当噪点丢掉
  if ($count -ge 200) {
    [void]$components.Add([pscustomobject]@{
      Id = $next; X = $minX; Y = $minY
      W = ($maxX - $minX + 1); H = ($maxY - $minY + 1)
      Pixels = $count
      CX = [math]::Round($sumX / $count); CY = [math]::Round($sumY / $count)
    })
  }
}

$components | Sort-Object -Property Pixels -Descending |
  Format-Table Id, X, Y, W, H, Pixels, CX, CY -AutoSize

# 标签图存下来，后面按 id 提取
$labelPath = Join-Path $PSScriptRoot "labels.bin"
$outBytes = New-Object byte[] ($label.Length * 4)
[System.Buffer]::BlockCopy($label, 0, $outBytes, 0, $outBytes.Length)
[System.IO.File]::WriteAllBytes($labelPath, $outBytes)
Write-Output "labels -> $labelPath  ($W x $H, $next 个连通域)"
