# 按连通域把六个姿态切成独立 PNG，彻底摆脱刚性网格。
# 每帧带一个 anchor（身体的脚底中心），保证换姿态时猫不会上下跳。
Add-Type -AssemblyName System.Drawing

$root = (Get-Location).Path
$scratch = $PSScriptRoot
$outDir = Join-Path $root "assets\domi"
New-Item -ItemType Directory -Force $outDir | Out-Null

$src = New-Object System.Drawing.Bitmap((Resolve-Path "assets\domi-sprite-sheet-v1.png").Path)
$W = $src.Width; $H = $src.Height

# 读回标签图
$labelBytes = [System.IO.File]::ReadAllBytes((Join-Path $scratch "labels.bin"))
$label = New-Object int[] ($W * $H)
[System.Buffer]::BlockCopy($labelBytes, 0, $label, 0, $labelBytes.Length)

# 姿态 -> 连通域 id。body 是决定 anchor 的那个主体。
$frames = @(
  @{ name = "sleep"; ids = @(3);          body = 3  },
  @{ name = "sit";   ids = @(1);          body = 1  },
  @{ name = "paw";   ids = @(2);          body = 2  },
  @{ name = "walk";  ids = @(12);         body = 12 },
  @{ name = "puff";  ids = @(10);         body = 10 },
  # blow 要连两颗泡泡一起带上 —— 它们是独立连通域，横跨了原来的格子边界
  @{ name = "blow";  ids = @(11, 13, 17); body = 11 }
)

$pad = 8
$manifest = @{}

foreach ($f in $frames) {
  $ids = @{}; foreach ($i in $f.ids) { $ids[$i] = $true }

  # 只统计属于本帧的连通域，算联合 bbox
  $minX = $W; $maxX = -1; $minY = $H; $maxY = -1
  $bMinX = $W; $bMaxX = -1; $bMaxY = -1
  for ($y = 0; $y -lt $H; $y++) {
    $base = $y * $W
    for ($x = 0; $x -lt $W; $x++) {
      $id = $label[$base + $x]
      if ($id -eq 0) { continue }
      if ($ids.ContainsKey($id)) {
        if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }
        if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y }
        if ($id -eq $f.body) {
          if ($x -lt $bMinX) { $bMinX = $x }; if ($x -gt $bMaxX) { $bMaxX = $x }
          if ($y -gt $bMaxY) { $bMaxY = $y }
        }
      }
    }
  }

  $fx = $minX - $pad; $fy = $minY - $pad
  $fw = ($maxX - $minX + 1) + $pad * 2
  $fh = ($maxY - $minY + 1) + $pad * 2

  $out = New-Object System.Drawing.Bitmap($fw, $fh, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  # 逐像素拷贝，并且只拷属于本帧的连通域 —— 邻居的尾巴不会混进来
  for ($y = 0; $y -lt $fh; $y++) {
    $sy = $fy + $y
    if ($sy -lt 0 -or $sy -ge $H) { continue }
    for ($x = 0; $x -lt $fw; $x++) {
      $sx = $fx + $x
      if ($sx -lt 0 -or $sx -ge $W) { continue }
      $id = $label[$sy * $W + $sx]
      if ($id -ne 0 -and $ids.ContainsKey($id)) {
        $out.SetPixel($x, $y, $src.GetPixel($sx, $sy))
      }
    }
  }

  $path = Join-Path $outDir "$($f.name).png"
  $out.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $out.Dispose()

  # anchor = 身体的脚底中心，换姿态时以它对齐
  $manifest[$f.name] = @{
    w = $fw; h = $fh
    anchorX = [math]::Round((($bMinX + $bMaxX) / 2) - $fx)
    anchorY = ($bMaxY - $fy)
  }
  "{0,-6} {1,4} x {2,-4}  anchor ({3},{4})" -f $f.name, $fw, $fh, $manifest[$f.name].anchorX, $manifest[$f.name].anchorY
}

$manifest | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $outDir "frames.json") -Encoding utf8
$src.Dispose()
Write-Output "-> $outDir"
