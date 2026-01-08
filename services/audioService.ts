
import { Howl, Howler } from 'howler';

const sounds = {
  correct: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3'] }), // Simple chime
  wrong: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2003/2003-preview.mp3'] }), // Buzzer
  click: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'] }), // Click
  win: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3'] }), // Cheering
  
  // FIX: Updated to user requested specific sounds
  // Received: Message Pop Alert (Mixkit 2354)
  message: new Howl({ 
    src: ['https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3'], 
    volume: 0.8 
  }), 
  // Sent: Modern Technology Select (Mixkit 3124)
  sent: new Howl({ 
    src: ['https://assets.mixkit.co/active_storage/sfx/3124/3124-preview.mp3'], 
    volume: 0.6 
  }), 
  
  // Reaction Sound
  reaction: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.mp3'], volume: 0.6 }), 
  // distinct "Your Turn" notification
  turn: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/1862/1862-preview.mp3'] }),
  // Countdown Tick
  tick: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'], rate: 1.5 }), 
  // Game Start
  fight: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3'] }),
  bgm: new Howl({ 
    src: ['https://assets.mixkit.co/active_storage/sfx/123/123-preview.mp3'], 
    loop: true,
    volume: 0.2
  })
};

export const playSound = (type: keyof typeof sounds) => {
  try {
    const sound = sounds[type];
    // Unlock WebAudio context if suspended (common in browsers)
    if (Howler.ctx && Howler.ctx.state === 'suspended') {
        Howler.ctx.resume();
    }
    sound.play();
  } catch (e) {
    console.error("Audio play error", e);
  }
};
