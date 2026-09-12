# OWL

A watchful AI companion. Voice, gaze, nest memory, and a Grok mind in one HUD.

Wake word: **hey owl**.

## What it does

OWL is a Jarvis-style roost in the browser. Speak or type. It reasons in a short verse, then briefs you.

- **Mind** — research, news, and real math through Grok 4.5
- **Ear** — always-on mic after you grant it; hold the mic for a clip if dictation is missing
- **Gaze** — live camera, observe a frame
- **Nest** — your name, city, song, notes, and people. Edit, delete, import, export. Stays on this device
- **Studio** — stills and clips from a prompt, in the roost. Clips play in the thread. Upload a photo and restyle it (sketch, Ghibli, noir…). Gaze can mint a copyable **OWL-FACE** sheet. **Mint seed** extracts a 512-d vector + crop (`owl-seed.json` / `.npy`). Say **as me in ghibli** to draw from that seed.
- **Relics** — ten things a chat box cannot do: drop files, moon in the HUD, hourglass ring, tilt perch, breath ring, cover-eye, roost sigil, color talon, shake tease, idle walk.
- **Mesh** — pair devices, share a still over the system sheet or Bluetooth
- **Arcade** — snake, pong, perch
- **Open** — “open instagram”, “open yt”, any site by name. OWL launches it.
- **Music** — “play song believer” finds the track and plays it in the roost
- **WhatsApp** — “open whatsapp and send Rahul text as hi”. Save a number first: “Rahul’s number is 98…”

Searches and site names are not kept on the home screen. Chat is session-only. Nest is what persists.

## Talk to it

```
hey owl
play song believer
open instagram
open whatsapp and send Rahul text as hi
Rahul’s number is 9876543210
call Rahul on whatsapp
who is Elon Musk
solve 17^7 - 3
news
call me Pragyan
my favorite song is Night Watch
remember I ship at dusk
open nest
open relics
sky
start hourglass
tilt perch
what color is this
weave a clip of a geometric owl turning its head
ghibli
mint face
mint seed
as me in ghibli
```

## Nest

Open **Nest** from the rail. Change anything:

- what OWL calls you
- city
- favorite song
- voice: precise / partner / tease
- notes (add, edit, delete)
- people (add, edit, delete, WhatsApp number)
- export / import `owl-nest.json`

You can also speak it: “call me Boss”, “I live in Delhi”, “my favorite song is Believer”, “Rahul’s number is 98…”.

## Honest limits

OWL lives in the browser. It cannot unlock a real phone or take over a Mac. WhatsApp is opened with the official click-to-chat link (`wa.me` / WhatsApp Web) — the chat and message are filled in; WhatsApp itself still needs the last Send tap. Mesh pairing and Bluetooth share use what the browser allows (Web Share / Web Bluetooth).

## Privacy

Nest memory is local. Commands like “open …” are not written onto the home HUD and are not saved across visits.

## Built with

React, TanStack Start, Zustand, Grok (xAI).
