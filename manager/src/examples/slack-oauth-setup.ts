#!/usr/bin/env node

import { config } from 'dotenv';
import { setupSlackOAuth } from '../slack/oauth-setup.js';

// Load environment variables
config();

// Run the OAuth setup
setupSlackOAuth();