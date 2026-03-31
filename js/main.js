/**
 * main.js — Phaser 3 configuration and game bootstrap.
 *
 * To add a new scene, import it in index.html (before this file)
 * and add its class to the `scene` array below.
 */
const config = {
  type: Phaser.AUTO,           // WebGL with Canvas fallback
  width:  800,
  height: 560,
  parent: 'game-container',    // mounts canvas inside #game-container
  backgroundColor: '#1a1a2e',
  pixelArt: true,              // disables anti-aliasing — keeps pixel tiles crisp
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },       // top-down — no gravity
      debug:   false,          // set true to see hitboxes while developing
    },
  },
  scene: [BootScene, GameScene, CasinoLobbyScene, RouletteScene, BlackjackScene, PizzeriaScene, HomeScene],
};

const game = new Phaser.Game(config);

// Expose game instance on window so GameState can emit events to it
window._phaserGame = game;
