import Phaser from 'phaser';

export class Player extends Phaser.Physics.Arcade.Sprite {
  private moveSpeed: number = 300;
  
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player');
    
    // Add to scene
    scene.add.existing(this);
    scene.physics.add.existing(this);
    
    // Physics settings
    this.setCollideWorldBounds(true);
  }
  
  update(cursors: Phaser.Types.Input.Keyboard.CursorKeys): void {
    // Reset velocity
    this.setVelocity(0);
    
    // Movement
    if (cursors.left.isDown) {
      this.setVelocityX(-this.moveSpeed);
    } else if (cursors.right.isDown) {
      this.setVelocityX(this.moveSpeed);
    }
    
    if (cursors.up.isDown) {
      this.setVelocityY(-this.moveSpeed);
    } else if (cursors.down.isDown) {
      this.setVelocityY(this.moveSpeed);
    }
  }
}