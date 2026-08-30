import { mulberry32 } from "../js/data.js"

type AudioTrack = { id: number }

let context: AudioContext | null = null
let master: GainNode | null = null
let timer: number | null = null
let voices: OscillatorNode[] = []
let volume = 0.7

const scales = [
  [0, 3, 5, 7, 10],
  [0, 2, 4, 7, 9],
  [0, 2, 3, 7, 8],
]

function ensureAudio() {
  if (context) return
  context = new AudioContext()
  master = context.createGain()
  master.gain.value = volume * 0.5
  master.connect(context.destination)
}

function noteFrequency(root: number, semitones: number) {
  return 220 * Math.pow(2, (root + semitones) / 12)
}

function voice(frequency: number, when: number, duration: number, gain: number, type: OscillatorType) {
  if (!context || !master) return
  const oscillator = context.createOscillator()
  const envelope = context.createGain()
  oscillator.type = type
  oscillator.frequency.value = frequency
  envelope.gain.setValueAtTime(0, when)
  envelope.gain.linearRampToValueAtTime(gain, when + 0.03)
  envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration)
  oscillator.connect(envelope).connect(master)
  oscillator.start(when)
  oscillator.stop(when + duration + 0.05)
  voices.push(oscillator)
}

export function stopAudio() {
  if (timer !== null) window.clearInterval(timer)
  timer = null
  voices.forEach((oscillator) => {
    try { oscillator.stop() } catch { /* already stopped */ }
  })
  voices = []
}

export function playAudio(track: AudioTrack) {
  ensureAudio()
  if (!context) return
  void context.resume()
  stopAudio()
  const random = mulberry32(track.id * 977 + 41)
  const scale = scales[track.id % scales.length]
  const root = 3 + (track.id % 5)
  let step = 0
  const schedule = () => {
    if (!context) return
    const when = context.currentTime + 0.08
    if (step % 8 === 0) voice(noteFrequency(root - 12, 0), when, 3.3, 0.13, "triangle")
    const semitones = scale[Math.floor(random() * scale.length)] + (random() > 0.8 ? 12 : 0)
    voice(noteFrequency(root, semitones), when, 1.6 + random(), 0.14, "sine")
    step += 1
  }
  schedule()
  timer = window.setInterval(schedule, 420)
}

export function setAudioVolume(nextVolume: number) {
  volume = nextVolume
  if (master) master.gain.value = volume * 0.5
}
