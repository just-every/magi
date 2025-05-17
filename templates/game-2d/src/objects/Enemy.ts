import Phaser from 'phaser';

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  private moveSpeed: number = 100;
  private direction: number = 1;
  private changeDirectionTime: number = 0;
  
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'enemy');
    
    // Add to scene
    scene.add.existing(this);
    scene.physics.add.existing(this);
    
    // Physics settings
    this.setCollideWorldBounds(true);
    this.setBounce(0.2);
    
    // Initial movement
    this.setVelocityX(this.moveSpeed * this.direction);
  }
  
  update(): void {
    // Change direction randomly
    const time = this.scene.time.now;
    if (time > this.changeDirectionTime) {
      this.direction = Math.random() > 0.5 ? 1 : -1;
      this.setVelocityX(this.moveSpeed * this.direction);
      
      // Set next direction change
      this.changeDirectionTime = time + Phaser.Math.Between(2000, 5000);
    }
  }
}