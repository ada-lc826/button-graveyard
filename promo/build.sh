#!/usr/bin/env bash
# Full build: scenes -> soundtrack -> concat -> mux -> covers
set -euo pipefail
cd "$(dirname "$0")"
node render.mjs
python3 soundtrack.py out/events.json out/music.wav
cd out
for s in s1 s2 s3 s4 s5 s6 s7 s8 s9; do echo "file '$s.mp4'"; done > list.txt
ffmpeg -y -loglevel error -f concat -safe 0 -i list.txt -c copy video.tmp.mp4 && mv video.tmp.mp4 video.mp4
ffmpeg -y -loglevel error -i video.mp4 -i music.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart promo.tmp.mp4 && mv promo.tmp.mp4 button-graveyard-promo.mp4
cd .. && node render.mjs cover 20.85 && cd out
ffmpeg -y -loglevel error -i cover-9x16.jpg -vf "crop=1080:1440:0:100" -q:v 2 cover-xiaohongshu-3x4.jpg && mv cover-9x16.jpg cover-douyin-9x16.jpg
echo "done: promo/out/button-graveyard-promo.mp4"
