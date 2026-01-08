
import { Howl } from 'howler';

const sounds = {
  correct: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3'] }), // Simple chime
  wrong: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2003/2003-preview.mp3'] }), // Buzzer
  click: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'] }), // Click
  win: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3'] }), // Cheering
  // Updated Chat Sounds
  message: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'], volume: 0.6 }), // Smartphone Notification Ping
  sent: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.mp3'], volume: 0.5 }), // Crisp Click/Send Sound
  // Reaction Sound (Kept as requested)
  reaction: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.mp3'], volume: 0.6 }), 
  // New distinct "Your Turn" notification
  turn: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/1862/1862-preview.mp3'] }),
  // Countdown Tick
  tick: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'], rate: 1.5 }), 
  // Game Start
  fight: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3'] }),
  bgm: new Howl({ 
    src: ['https://assets.mixkit.co/active_storage/sfx/123/123-preview.mp3'], // Placeholder background beat
    loop: true,
    volume: 0.2
  })
};

export const playSound = (type: keyof typeof sounds) => {
  try {
    sounds[type].play();
  } catch (e) {
    console.error("Audio play error", e);
  }
};
