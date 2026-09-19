"""Render text to a wav with kokoro-onnx: model, voices, voice, out; text on stdin. Prints the seconds of audio."""
import sys, wave
import numpy as np
from kokoro_onnx import Kokoro

model, voices, voice, out = sys.argv[1:5]
text = sys.stdin.read()
k = Kokoro(model, voices)
samples, rate = k.create(text, voice=voice, speed=1.0, lang="en-us")
pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype(np.int16)
with wave.open(out, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(pcm.tobytes())
print(round(len(samples) / rate, 1))
