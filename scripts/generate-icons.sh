#!/usr/bin/env bash
set -euo pipefail

ASSETS="assets/images"
SRC="$ASSETS/unicorn-source.png"

# Crop offset in pixels from each edge (increase to zoom in more on the unicorn)
CROP=60

# ── Validate source ───────────────────────────────────────────────────────────
if [[ ! -f "$SRC" ]]; then
  echo "ERROR: Source image not found: $SRC" >&2
  exit 1
fi

W=$(sips -g pixelWidth "$SRC" | awk '/pixelWidth/{print $2}')
H=$(sips -g pixelHeight "$SRC" | awk '/pixelHeight/{print $2}')
echo "Source: ${W}×${H}  →  cropping ${CROP}px from each edge"

CROP_W=$((W - CROP * 2))
CROP_H=$((H - CROP * 2))

# ── Crop to tight square ──────────────────────────────────────────────────────
TMP_CROP=$(mktemp /tmp/unicorn-crop.XXXXXX.png)
trap 'rm -f "$TMP_CROP"' EXIT

# sips -c <height> <width> crops from centre; --cropOffset moves the top-left
sips -c "$CROP_H" "$CROP_W" --cropOffset "$CROP" "$CROP" "$SRC" --out "$TMP_CROP" > /dev/null

# ── Generate icons via sips ───────────────────────────────────────────────────

# icon.png — 1024×1024 (iOS + main)
sips -z 1024 1024 "$TMP_CROP" --out "$ASSETS/icon.png" > /dev/null
echo "  ✓ icon.png (1024×1024)"

# android-icon-foreground.png — 1024×1024
sips -z 1024 1024 "$TMP_CROP" --out "$ASSETS/android-icon-foreground.png" > /dev/null
echo "  ✓ android-icon-foreground.png (1024×1024)"

# android-icon-monochrome.png — grayscale 1024×1024
TMP_MONO=$(mktemp /tmp/unicorn-mono.XXXXXX.png)
trap 'rm -f "$TMP_CROP" "$TMP_MONO"' EXIT
sips -z 1024 1024 "$TMP_CROP" --out "$TMP_MONO" > /dev/null
# Convert to grayscale using Python (stdlib only, no Pillow required)
python3 - "$TMP_MONO" "$ASSETS/android-icon-monochrome.png" <<'PYEOF'
import sys, zlib, struct

def read_png_pixels(path):
    import zlib
    with open(path, 'rb') as f:
        sig = f.read(8)
        chunks = {}
        while True:
            length_data = f.read(4)
            if len(length_data) < 4:
                break
            length = struct.unpack('>I', length_data)[0]
            name = f.read(4)
            data = f.read(length)
            f.read(4)  # CRC
            chunks.setdefault(name, []).append(data)
    ihdr = chunks[b'IHDR'][0]
    width, height, bit_depth, color_type = struct.unpack('>IIBB', ihdr[:10])
    return width, height, color_type, zlib.decompress(b''.join(chunks[b'IDAT']))

def write_grayscale_png(path, width, height, pixels_rgb):
    def make_chunk(name, data):
        crc = zlib.crc32(name + data) & 0xFFFFFFFF
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', crc)

    # Convert RGB pixels to grayscale (luminance formula)
    raw = bytearray()
    idx = 0
    for y in range(height):
        raw.append(0)  # filter type None
        for x in range(width):
            r, g, b = pixels_rgb[idx], pixels_rgb[idx+1], pixels_rgb[idx+2]
            gray = int(0.299 * r + 0.587 * g + 0.114 * b)
            raw.append(gray)
            raw.append(gray)
            raw.append(gray)
            idx += 3

    ihdr = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    idat = zlib.compress(bytes(raw))

    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(make_chunk(b'IHDR', ihdr))
        f.write(make_chunk(b'IDAT', idat))
        f.write(make_chunk(b'IEND', b''))

src, dst = sys.argv[1], sys.argv[2]
width, height, color_type, raw_data = read_png_pixels(src)

# Reconstruct pixel rows (filter type 0 = None assumed for sips output)
pixels = bytearray()
stride = width * 3  # RGB
for y in range(height):
    filter_byte = raw_data[y * (stride + 1)]
    row = raw_data[y * (stride + 1) + 1 : y * (stride + 1) + 1 + stride]
    pixels.extend(row)

write_grayscale_png(dst, width, height, pixels)
PYEOF
echo "  ✓ android-icon-monochrome.png (1024×1024 grayscale)"

# android-icon-background.png — solid #E6F4FE, 1024×1024
python3 - "$ASSETS/android-icon-background.png" <<'PYEOF'
import sys, zlib, struct

def write_solid_png(path, width, height, r, g, b):
    def make_chunk(name, data):
        crc = zlib.crc32(name + data) & 0xFFFFFFFF
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', crc)

    row = b'\x00' + bytes([r, g, b] * width)
    raw = row * height
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    idat = zlib.compress(raw)

    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(make_chunk(b'IHDR', ihdr))
        f.write(make_chunk(b'IDAT', idat))
        f.write(make_chunk(b'IEND', b''))

# #E6F4FE = rgb(230, 244, 254)
write_solid_png(sys.argv[1], 1024, 1024, 230, 244, 254)
PYEOF
echo "  ✓ android-icon-background.png (1024×1024 solid #E6F4FE)"

# favicon.png — 48×48
sips -z 48 48 "$TMP_CROP" --out "$ASSETS/favicon.png" > /dev/null
echo "  ✓ favicon.png (48×48)"

# splash-icon.png — 200×200 (Expo displays at imageWidth: 76 logical px)
sips -z 200 200 "$TMP_CROP" --out "$ASSETS/splash-icon.png" > /dev/null
echo "  ✓ splash-icon.png (200×200)"

echo ""
echo "Done. Source image untouched: $SRC"
