/**
 * BootScene — loads all assets then launches GameScene.
 * Add any new assets here (tilesets, spritesheets, audio, etc.).
 */
class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    const { width, height } = this.scale;

    // ── Loading bar ────────────────────────────────────────────
    const barBg = this.add.rectangle(width / 2, height / 2, 420, 24, 0x1a1a3a)
      .setStrokeStyle(1, 0x3a3a6a);
    const barFill = this.add.rectangle(width / 2 - 208, height / 2, 0, 16, 0x5a5adf)
      .setOrigin(0, 0.5);
    const label = this.add.text(width / 2, height / 2 - 24, 'Loading…', {
      fontFamily: 'Courier New',
      fontSize:   '13px',
      color:      '#888888',
    }).setOrigin(0.5);

    this.load.on('progress', v => barFill.setSize(v * 416, 16));
    this.load.on('complete', () => label.setText('Ready'));

    // ── Assets ────────────────────────────────────────────────
    // Tileset image — key must match the name used in addTilesetImage()
    this.load.image('city_tiles', 'assets/tilesets/city_tiles.png');

    // Tiled JSON map
    this.load.tilemapTiledJSON('city_map', 'assets/tilemaps/city.json');

    // Player spritesheet: 4 frames wide × 4 rows tall, 32×48 per frame
    this.load.spritesheet('player', 'assets/sprites/player.png', {
      frameWidth:  32,
      frameHeight: 48,
    });
  }

  create() {
    this.scene.start('GameScene');
  }
}
