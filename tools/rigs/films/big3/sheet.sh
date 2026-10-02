FF="${FFMPEG:-$(cd "$(dirname "$0")/../../../.." && pwd)/video/node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe}"
out=$1; shift; args=(); for f in "$@"; do args+=(-i "$f"); done; n=$#
fc=""; for i in $(seq 0 $((n-1))); do fc="$fc[$i]scale=960:540[s$i];"; done
for i in $(seq 0 $((n-1))); do fc="$fc[s$i]"; done
lay=$(python -c "print('|'.join(f'{(i%2)*960}_{(i//2)*540}' for i in range($n)))")
"$FF" -v error -y "${args[@]}" -filter_complex "${fc}xstack=inputs=$n:layout=$lay" "$out"
