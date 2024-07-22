# SillyTavern-EmulatorJS

This extension allows you to play retro console games right from the SillyTavern chat.

## Features

Cool stuff:

- Unnecessary and absurd concept.
- AI can provide immersive comments on your gameplay (OpenAI API key required).
- Simple ROM file management. ROMs are stored in your browser.
- All EmulatorJS cores supported.
  - Nintendo
  - Sega
  - Atari
  - PlayStation
  - many more

Limitations:

- AI can't play the game with you as a second player (yet).
- No built-in ROMs. But you can find them [anywhere](https://archive.org/details/ni-romsets).

## NEW! AI Streaming mode

With the power of GPT-4 Vision, your AI bots can now see your gameplay and provide witty in-character comments.

### Requirements

1. Latest *staging* version of SillyTavern.
2. Latest update of EmulatorJS extension.
3. A browser that supports [ImageCapture](https://developer.mozilla.org/en-US/docs/Web/API/ImageCapture#browser_compatibility). Tested on desktop Chrome. Firefox requires to enable it with config. Safari won't work.
4. (If image inlining is disabled) OpenAI API key with access to the "gpt-4-vision" model.
5. (If image inlining is enabled. Recommended) OpenAI or OpenRouter API key with "gpt-4-vision" as the selected model.

### How to enable

1. Make sure you set the interval of providing comments in the EmulatorJS extension settings. This setting defines how often the character is queried for comments using a snap of your current gameplay. A value of 0 indicates that no comments are provided.
2. Select a character chat and launch the game. For the best performance, make sure that the ROM file is properly named so that AI can have more background context.
3. Start playing as you normally would. The vision model will be queried periodically to write a comment based on the latest screenshot it "sees".

### Why I'm not seeing any comments?

Comments are temporarily paused (interval step skipped) if:

1. Emulator is paused (with a pause button, not in-game).
2. The browser window is out of focus.
3. The user input area is not empty. This is to let you type your reply in peace.
4. Another reply generation is currently in progress.
5. TTS voice is being read aloud. Comment is held off (10 seconds maximum) until it finishes, but not skipped.

Other common issues:

1. Make sure you've set a commenting interval before launching the game.
2. Make sure you have set an OpenAI key and there are no errors in the ST server console.

Still doesn't work? Send us your browser debug console logs (press F12).

### Settings

1. Caption template - a prompt used to describe the in-game screenshot. `{{game}}` and `{{core}}` additional macro are supported.
2. Comment template - a prompt used to write a comment based on the generated caption. `{{game}}`, `{{core}}`, `{{caption}}` additional macro are supported. For image inlining mode, `{{caption}}` is replaced with `see included image`.

## Installation and Usage

### Installation

Install using SillyTavern's third-party extensions installer using this link:

`https://github.com/Cohee1207/SillyTavern-EmulatorJS`

### Usage

- Open the "EmulatorJS" extension menu.
- Click "Add ROM file".
- Select the game file to add. Input the name and core (if it wasn't auto-detected).
- Click the "Play" button in the list or launch via the wand menu.

## Prerequisites

- Latest release version of SillyTavern.
- ROM files downloaded from the net.

## Support and Contributions

Feel free to contribute.

## License

GPLv3

---

<div align = center>

<img width = 300 src = docs/Logo-light.png#gh-dark-mode-only>
<img width = 300 src = docs/Logo.png#gh-light-mode-only>

<br>
<br>

[![Badge License]][License]


Self-hosted **Javascript** emulation for various system.

<br>

[![Button Website]][Website] 
[![Button Usage]][Usage]<br>
[![Button Configurator]][Configurator]<br>
[![Button Demo]][Demo] 
[![Button Legacy]][Legacy]

[![Button Contributors]][Contributors]

Join our Discord server:

[![Join our Discord server!](https://invidget.switchblade.xyz/6akryGkETU)](https://discord.gg/6akryGkETU)

</div>

<br>

**As of EmulatorJS version 4.0, this project is no longer a reverse-engineered version of the emulatorjs.com project. It is now a complete re-write,**

<br>

**README BEFORE YOU UPDATE:** EmulatorJS Version 4.0 is a complete re-write of the application. At least some bugs are expected. If you did any communicating with the emulator, there is a 100% chance you will need to re-write your project, and to people with active branches of this project, I wish you luck with merge conflicts (I'm very sorry). The emulator object can be accessed through the `window.EJS_emulator` object.

It is **HIGHLY** suggested that you update to 4.0 ASAP.

<br>

### Ads

*This project has no ads.* <br>
*Although, the demo page currently has an ad to help fund this project.* <br>
*Ads on the demo page may come and go depending on how many people are* <br>
*funding this project.* <br>

*You can help fund this project on* ***[patreon]***

<br>


### Issues

*If something doesn't work, please consider opening an* ***[Issue]*** <br>
*with as many details as possible, as well as the console log.*

<br>

### Extensions

 **[GameLibrary]**

   *A library overview for your **ROM** folder.*

<br>

### Development:

*Run a local server with:*
```
npm i
npm start
```

<br>

**>> When reporting bugs, please specify that you are using the old version**

<br>
<br>
<br>

<h1 align = center>Supported Systems</h1>

<br>

<div align = center>

### Nintendo

**[Game Boy Advance][Nintendo Game Boy Advance]**   | 
**[Famicom / NES][NES / Famicom]**   | 
**[Virtual Boy][Virtual Boy]**

**[Game Boy][Nintendo Game Boy]**   | 
**[SNES]**   | 
**[DS][Nintendo DS]**   | 
**[64][Nintendo 64]**

<br>
<br>

### Sega

**[Master System][Sega Master System]**   | 
**[Mega Drive][Sega Mega Drive]**   | 
**[Game Gear][Sega Game Gear]**

**[Saturn][Sega Saturn]**   | 
**[32X][Sega 32X]**   | 
**[CD][Sega CD]**

<br>
<br>

### Atari

**[2600][Atari 2600]**   | 
**[5200][Atari 5200]**   | 
**[7800][Atari 7800]**   | 
**[Lynx][Atari Lynx]**   | 
**[Jaguar][Atari Jaguar]**


<br>
<br>

### Other

**[PlayStation]**   | 
**[Arcade]**   | 
**[3DO]**   | 
**[MAME 2003]**

</div>

<br>

***PSP is not yet supported***. Some of y'all may have seen that I pushed a "beta" ppsspp core, but this core is not ready for daily use. It still crashes randomly and any games that use 3d (so like, all of them) will just have a white screen (and might just crash). Do not open issues related to the "psp" core.


<!-- 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 --->

[License]: LICENSE
[Issue]: https://github.com/ethanaobrien/emulatorjs/issues
[patreon]: https://patreon.com/EmulatorJS


<!-- 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮   Extensions   🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 --->

[GameLibrary]: https://github.com/Ramaerel/emulatorjs-GameLibrary


<!-- 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮   Quicklinks   🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 --->

[Configurator]: https://emulatorjs.org/editor.html
[Contributors]: docs/Contributors.md
[Website]: https://emulatorjs.org/
[Legacy]: https://coldcast.org/games/1/Super-Mario-Bros
[Usage]: https://emulatorjs.org/docs/
[Demo]: https://demo.emulatorjs.org/


<!-- 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮  Systems  🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 -->

[Nintendo Game Boy Advance]: docs/Systems/Nintendo%20Game%20Boy%20Advance.md
[Nintendo Game Boy]: docs/Systems/Nintendo%20Game%20Boy.md
[Nintendo 64]: docs/Systems/Nintendo%2064.md
[Nintendo DS]: docs/Systems/Nintendo%20DS.md

[Sega Master System]: docs/Systems/Sega%20Master%20System.md
[Sega Mega Drive]: docs/Systems/Sega%20Mega%20Drive.md
[Sega Game Gear]: docs/Systems/Sega%20Game%20Gear.md
[Sega Saturn]: docs/Systems/Sega%20Saturn.md
[Sega 32X]: docs/Systems/Sega%2032X.md
[Sega CD]: docs/Systems/Sega%20CD.md

[Atari Jaguar]: docs/Systems/Atari%20Jaguar.md
[Atari Lynx]: docs/Systems/Atari%20Lynx.md
[Atari 7800]: docs/Systems/Atari%207800.md
[Atari 2600]: docs/Systems/Atari%202600.md
[Atari 5200]: docs/Systems/Atari%205200.md

[NES / Famicom]: docs/Systems/NES-Famicom.md
[SNES]: docs/Systems/SNES.md

[TurboGrafs-16 / PC Engine]: docs/Systems/TurboGrafs%2016-PC%20Engine.md
[WanderSwan / Color]: docs/Systems/WanderSwan-Color.md
[Neo Geo Poket]: docs/Systems/Neo%20Geo%20Poket.md
[PlayStation]: docs/Systems/PlayStation.md
[Virtual Boy]: docs/Systems/Virtual%20Boy.md
[Arcade]: docs/Systems/Arcade.md
[MSX]: docs/Systems/MSX.md
[3DO]: docs/Systems/3DO.md
[MAME 2003]: docs/Systems/MAME%202003.md


<!-- 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮  Badges  🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 🎮 --->

[Badge License]: https://img.shields.io/badge/License-GPLv3-blue.svg?style=for-the-badge

[Button Configurator]: https://img.shields.io/badge/Configurator-992cb3?style=for-the-badge
[Button Contributors]: https://img.shields.io/badge/Contributors-54b7dd?style=for-the-badge
[Button Website]: https://img.shields.io/badge/Website-736e9b?style=for-the-badge
[Button Legacy]: https://img.shields.io/badge/Legacy-ab910b?style=for-the-badge
[Button Usage]: https://img.shields.io/badge/Usage-2478b5?style=for-the-badge
[Button Demo]: https://img.shields.io/badge/Demo-528116?style=for-the-badge
[Button Beta]: https://img.shields.io/badge/Beta-bb044f?style=for-the-badge
