/**
 * Game configuration constants
 */

export enum GameState {
  BOOT = 'boot',
  MENU = 'menu',
  PLAYING = 'playing',
  PAUSED = 'paused',
  GAME_OVER = 'gameOver'
}

export const GAME_CONFIG = {
  width: 800,
  height: 600,
  backgroundColor: '#000000',
  debug: false
};

export const PLAYER_CONFIG = {
  speed: 300,
  health: 100,
  lives: 3
};

export const ENEMY_CONFIG = {
  speed: 100,
  spawnInterval: 2000,
  maxEnemies: 10
};