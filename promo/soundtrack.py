# Synthesises the soundtrack from out/events.json, so every click, thud and chime lands on its frame.
import json, numpy as np, sys
from scipy.io import wavfile
SR = 44100
E = json.load(open(sys.argv[1]))
D = E['duration']; N = int(SR * D)
t = np.arange(N) / SR
mix = np.zeros(N)
rng = np.random.default_rng(3)
def env(n, a=0.005, r=0.2):
    x = np.arange(n) / SR
    return np.minimum(1, x / a) * np.exp(-x / r)
def put(sig, at, gain=1.0):
    i = int(at * SR); j = min(N, i + len(sig))
    if i < N: mix[i:j] += sig[:j - i] * gain
def tone(f, dur, r=0.3, a=0.005, kind='sine'):
    n = int(dur * SR); x = np.arange(n) / SR
    w = np.sin(2 * np.pi * f * x) if kind == 'sine' else np.sign(np.sin(2 * np.pi * f * x)) * 0.5
    return w * env(n, a, r)
nt = lambda m: 440 * 2 ** ((m - 69) / 12)

# Pad: A minor drone, turns A major at the resurrection (30.5s)
res = 30.5
for m, g in [(45, .5), (52, .35), (57, .3), (60, .22)]:
    f = nt(m)
    lfo = 0.6 + 0.4 * np.sin(2 * np.pi * 0.15 * t + m)
    mix += g * 0.05 * lfo * (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 2.003 * t))
maj = np.clip((t - res) / 0.6, 0, 1)
mix += 0.05 * 0.22 * maj * (np.sin(2 * np.pi * nt(61) * t) - np.sin(2 * np.pi * nt(60) * t))  # C -> C#
mix += 0.05 * 0.25 * maj * np.sin(2 * np.pi * nt(64) * t)
# Beat 100 BPM from the terminal scene to the CTA
beat = 60 / 100
b = 11.2 + 3.9
while b < 35.5:
    n = int(0.35 * SR); x = np.arange(n) / SR
    kick = np.sin(2 * np.pi * (50 + 90 * np.exp(-x * 35)) * x) * np.exp(-x / 0.12)
    put(kick, b, 0.55)
    if b > 16.5:
        hat = rng.standard_normal(int(0.05 * SR)) * env(int(0.05 * SR), 0.001, 0.012)
        put(np.diff(hat, prepend=0), b + beat / 2, 0.12)
    b += beat
# Events
for e in E['events']:
    at, k = e['t'], e['type']
    if k == 'click':
        n = int(0.03 * SR); put(np.diff(rng.standard_normal(n), prepend=0) * env(n, 0.0005, 0.004), at, 0.5)
        put(tone(2400, 0.03, 0.006), at, 0.15)
    elif k == 'womp':
        n = int(0.45 * SR); x = np.arange(n) / SR
        f = 220 * np.exp(-x * 2.2)
        put(np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.01, 0.18), at, 0.28)
    elif k == 'tick':
        n = int(0.012 * SR); put(np.diff(rng.standard_normal(n), prepend=0) * env(n, 0.0003, 0.002), at, 0.12)
    elif k == 'blip':
        put(tone(330, 0.12, 0.05, kind='square'), at, 0.07)
    elif k == 'hit':
        put(tone(nt(45), 1.5, 0.5), at, 0.35); put(tone(nt(57), 1.0, 0.3), at, 0.15)
    elif k == 'thud':
        n = int(0.5 * SR); x = np.arange(n) / SR
        th = np.sin(2 * np.pi * (45 + 60 * np.exp(-x * 25)) * x) * np.exp(-x / 0.15)
        grit = rng.standard_normal(n) * np.exp(-x / 0.03) * 0.25
        put(th + grit, at, 0.6)
    elif k == 'thunk':
        put(tone(140, 0.25, 0.06), at, 0.4)
    elif k == 'final':
        for m in (57, 61, 64, 69): put(tone(nt(m), 4.0, 1.4, 0.02), at, 0.12)
# Chimes, rising A-major pentatonic
for i, e in enumerate([e for e in E['events'] if e['type'] == 'chime']):
    m = [69, 71, 73, 76, 78, 81][i % 6]
    put(tone(nt(m), 1.2, 0.35), e['t'], 0.16); put(tone(nt(m + 12), 0.8, 0.2), e['t'], 0.064)
# Fades
mix *= np.clip(t / 0.4, 0, 1) * np.clip((D - t) / 1.2, 0, 1)
mix = np.tanh(mix * 1.4) / np.tanh(1.4)
peak = np.max(np.abs(mix)); mix = mix / peak * 0.89
st = np.stack([mix, np.roll(mix, 220) * 0.98], axis=1)
wavfile.write(sys.argv[2], SR, (st * 32767).astype(np.int16))
print('wrote', sys.argv[2], f'{D}s')
