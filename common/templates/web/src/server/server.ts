import express from 'express';
import cors from 'cors';
import path from 'path';

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

// Middleware
if (!isProduction) {
  app.use(cors());
}

// API Routes
app.get('/api/hello', (req, res) => {
  res.json({ message: 'World' });
});

// Production-specific setup
if (isProduction) {
  // Static files
  app.use(express.static('public'));
  
  // Client-side routing fallback (Express 5 syntax)
  app.get('/{*splat}', (req, res) => {
    res.sendFile(path.resolve('public/index.html'));
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running in ${isProduction ? 'production' : 'development'} mode on port ${PORT}`);
});