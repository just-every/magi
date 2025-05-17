import Phaser from 'phaser';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    
    // Background
    this.add.image(width / 2, height / 2, 'background');
    
    // Logo
    this.add.image(width / 2, height / 3, 'logo');
    
    // Game title
    this.add.text(width / 2, height / 2, 'GAME TITLE', {
      font: '40px Arial Bold',
      color: '#ffffff'
    }).setOrigin(0.5);
    
    // Start game button
    const startButton = this.add.text(width / 2, height / 2 + 100, 'Start Game', {
      font: '32px Arial',
      color: '#ffffff'
    }).setOrigin(0.5);
    
    startButton.setInteractive({ useHandCursor: true })
      .on('pointerover', () => startButton.setStyle({ color: '#ff0' }))
      .on('pointerout', () => startButton.setStyle({ color: '#fff' }))
      .on('pointerdown', () => this.startGame());
  }
  
  startGame(): void {
    this.scene.start('GameScene');
  }
}