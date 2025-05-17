import Phaser from 'phaser';
import { Player } from '../objects/Player';
import { Enemy } from '../objects/Enemy';

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private enemies!: Phaser.Physics.Arcade.Group;
  private score: number = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  
  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    // Add background
    this.add.image(400, 300, 'background');
    
    // Create player
    this.player = new Player(this, 400, 450);
    
    // Create enemies group
    this.enemies = this.physics.add.group({
      classType: Enemy
    });
    
    // Add some enemies
    for (let i = 0; i < 5; i++) {
      const x = Phaser.Math.Between(100, 700);
      const y = Phaser.Math.Between(100, 300);
      const enemy = new Enemy(this, x, y);
      this.enemies.add(enemy);
    }
    
    // Collisions
    this.physics.add.collider(this.player, this.enemies, this.handleCollision, undefined, this);
    
    // Score display
    this.scoreText = this.add.text(16, 16, 'Score: 0', {
      fontSize: '32px',
      color: '#fff'
    });
    
    // Controls
    this.cursors = this.input.keyboard.createCursorKeys();
  }

  update(): void {
    // Player movement
    this.player.update(this.cursors);
    
    // Update enemies
    this.enemies.getChildren().forEach((enemy) => {
      (enemy as Enemy).update();
    });
  }
  
  private handleCollision(player: any, enemy: any): void {
    enemy.destroy();
    this.score += 10;
    this.scoreText.setText(`Score: ${this.score}`);
    
    // Spawn new enemy
    const x = Phaser.Math.Between(100, 700);
    const y = Phaser.Math.Between(100, 200);
    const newEnemy = new Enemy(this, x, y);
    this.enemies.add(newEnemy);
  }
}