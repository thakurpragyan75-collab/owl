# OWL

A watchful AI companion. Voice, gaze, nest memory, and a Grok mind in one HUD.

Wake word: **hey owl**.

## What it does

OWL is a Jarvis-style roost in the browser. Speak or type. It reasons in a short verse, then briefs you.

- **Mind** — research, news, and real math through Grok 4.5
- **Ear** — always-on mic after you grant it; hold the mic for a clip if dictation is missing
- **Gaze** — live camera, observe a frame
- **Nest** — your name, city, song, notes, and people. Edit, delete, import, export. Stays on this device
- **Studio** — stills and clips from a prompt
- **Mesh** — pair devices, share a still over the system sheet or Bluetooth
- **Arcade** — snake, pong, perch
- **Open** — “open instagram”, “open yt”, any site by name
- **Music** — “play song believer” lands on YouTube Music

Searches and site names are not kept on the home screen. Chat is session-only. Nest is what persists.

## Talk to it

```
hey owl
play song believer
open instagram
who is Elon Musk
solve 17^7 - 3
news
call me Pragyan
my favorite song is Night Watch
remember I ship at dusk
open nest
```

## Nest

Open **Nest** from the rail. Change anything:

- what OWL calls you
- city
- favorite song
- voice: precise / partner / tease
- notes (add, edit, delete)
- people (add, edit, delete)
- export / import `owl-nest.json`

You can also speak it: “call me Boss”, “I live in Delhi”, “my favorite song is Believer”.

## Honest limits

OWL lives in the browser. It cannot unlock a real phone, drive WhatsApp, or take over a Mac. Mesh pairing and Bluetooth share use what the browser allows (Web Share / Web Bluetooth). The rest is a roost you can actually run.

## Privacy

Nest memory is local. Commands like “open …” are not written onto the home HUD and are not saved across visits.

## Built with

React, TanStack Start, Zustand, Grok (xAI).
