import { Howl } from 'howler';

const sounds = {
  correct: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3'] }), // Simple chime
  wrong: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2003/2003-preview.mp3'] }), // Buzzer
  click: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'] }), // Click
  win: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3'] }), // Cheering
  message: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3'] }), // Bubble Pop/Message
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