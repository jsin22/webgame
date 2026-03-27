/**
 * GameState — shared global state accessible from every Phaser scene.
 * Because all scenes share the same JS context, this plain object acts as
 * a lightweight store. No framework needed.
 */
const GameState = {
  money: 100,

  /** Add (positive) or subtract (negative) money; floor at 0. */
  addMoney(amount) {
    this.money = Math.max(0, this.money + amount);
    // Notify any Phaser scene that is listening (GameScene updates the HUD DOM)
    if (window._phaserGame) {
      window._phaserGame.events.emit('moneyChanged', this.money);
    }
  },
};
